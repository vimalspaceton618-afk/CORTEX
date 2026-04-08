"""Episodic Memory for CORTEX -- stores past interactions."""

import json
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field


@dataclass
class Episode:
    """A stored episodic memory."""
    task: str
    task_id: str
    answer: str
    outcome_score: float  # 0.0-1.0, how well the response went
    timestamp: float = field(default_factory=time.time)
    task_type: str = "auto"
    steps_taken: int = 0
    agents_involved: List[str] = field(default_factory=list)
    tools_used: List[str] = field(default_factory=list)
    full_context: Optional[Dict[str, Any]] = None
    relevance_score: float = 1.0  # Decays over time

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task": self.task,
            "task_id": self.task_id,
            "answer": self.answer,
            "outcome_score": self.outcome_score,
            "timestamp": self.timestamp,
            "task_type": self.task_type,
            "steps_taken": self.steps_taken,
            "agents_involved": self.agents_involved,
            "tools_used": self.tools_used,
            "full_context": self.full_context,
            "relevance_score": self.relevance_score,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Episode':
        return cls(
            task=data["task"],
            task_id=data["task_id"],
            answer=data["answer"],
            outcome_score=data["outcome_score"],
            timestamp=data["timestamp"],
            task_type=data.get("task_type", "auto"),
            steps_taken=data.get("steps_taken", 0),
            agents_involved=data.get("agents_involved", []),
            tools_used=data.get("tools_used", []),
            full_context=data.get("full_context"),
            relevance_score=data.get("relevance_score", 1.0),
        )


class EpisodicMemory:
    """
    Stores past interactions: task, context, result, outcome score.

    Backed by JSONL files via the existing LocalStorage pattern.
    Supports text-based retrieval and similarity matching.
    """

    def __init__(self, storage, max_episodes: int = 1000):
        self.storage = storage
        self.max_episodes = max_episodes
        self._episodes_dir = Path(storage.base_path) / "episodic_memory"
        self._episodes_file = self._episodes_dir / "episodes.jsonl"
        self._ensure_dirs()

    async def store(self, episode: Episode):
        """Store an episodic memory."""
        with open(self._episodes_file, 'a', encoding='utf-8') as f:
            f.write(json.dumps(episode.to_dict(), ensure_ascii=False) + '\n')
        # Trim if over limit
        self._trim_excess()

    async def find_related(self, query: str, k: int = 5) -> List[Episode]:
        """Find similar past interactions using keyword matching."""
        episodes = self._load_all()
        if not episodes:
            return []

        query_words = set(query.lower().split())
        scored = []

        for ep in episodes:
            # Score by word overlap with task text
            task_words = set(ep.task.lower().split())
            answer_words = set(ep.answer.lower().split())
            all_words = task_words | answer_words
            if not all_words:
                continue

            overlap = len(query_words & all_words)
            union = len(query_words | all_words)
            score = overlap / union if union > 0 else 0

            # Boost by recency and outcome score
            recency_bonus = max(0, 1.0 - (time.time() - ep.timestamp) / 86400 / 7)
            combined = score * 0.6 + recency_bonus * 0.2 + ep.outcome_score * 0.2
            scored.append((combined, ep))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [ep for _, ep in scored[:k]]

    async def get_all(self, limit: int = 100) -> List[Episode]:
        """Get recent episodes."""
        episodes = self._load_all()
        return sorted(episodes, key=lambda e: e.timestamp, reverse=True)[:limit]

    async def count(self) -> int:
        """Count stored episodes."""
        if not self._episodes_file.exists():
            return 0
        with open(self._episodes_file, 'r', encoding='utf-8') as f:
            return sum(1 for line in f if line.strip())

    async def decay(self, half_life_days: int = 30):
        """Reduce relevance scores for old entries."""
        episodes = self._load_all()
        now = time.time()
        for ep in episodes:
            days_old = (now - ep.timestamp) / 86400
            ep.relevance_score *= 0.5 ** (days_old / half_life_days)
        # Rewrite file with updated scores
        with open(self._episodes_file, 'w', encoding='utf-8') as f:
            for ep in episodes:
                f.write(json.dumps(ep.to_dict(), ensure_ascii=False) + '\n')

    async def clear(self):
        """Clear all episodic memories."""
        if self._episodes_file.exists():
            self._episodes_file.unlink()
            self._ensure_dirs()

    def _ensure_dirs(self):
        self._episodes_dir.mkdir(parents=True, exist_ok=True)

    def _load_all(self) -> List[Episode]:
        if not self._episodes_file.exists():
            return []
        episodes = []
        try:
            with open(self._episodes_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            episodes.append(Episode.from_dict(json.loads(line)))
                        except (json.JSONDecodeError, KeyError):
                            pass
        except FileNotFoundError:
            pass
        return episodes

    def _trim_excess(self):
        """Remove oldest entries if over limit."""
        episodes = self._load_all()
        if len(episodes) > self.max_episodes:
            # Keep most relevant
            episodes.sort(key=lambda e: e.relevance_score + e.outcome_score, reverse=True)
            kept = episodes[:self.max_episodes]
            with open(self._episodes_file, 'w', encoding='utf-8') as f:
                for ep in kept:
                    f.write(json.dumps(ep.to_dict(), ensure_ascii=False) + '\n')
