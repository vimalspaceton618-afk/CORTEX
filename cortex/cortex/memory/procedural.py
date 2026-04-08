"""Procedural Memory for CORTEX -- learned skills and how-to patterns."""

import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field


@dataclass
class Skill:
    """A learned procedural skill."""
    name: str
    trigger_pattern: str  # When to apply this skill
    steps: List[str]  # Step-by-step instructions
    examples: List[str] = field(default_factory=list)
    success_count: int = 0
    failure_count: int = 0
    tags: List[str] = field(default_factory=list)
    created_at: str = ""

    @property
    def success_rate(self) -> float:
        total = self.success_count + self.failure_count
        if total == 0:
            return 1.0
        return self.success_count / total

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "trigger_pattern": self.trigger_pattern,
            "steps": self.steps,
            "examples": self.examples,
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "tags": self.tags,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Skill':
        return cls(**data)


class ProceduralMemory:
    """
    Skills and how-to patterns: "when asked X, do steps A->B->C".

    Automatically learns from successful task completions by extracting
    the sequence of steps that worked. Stored as JSONL via LocalStorage.
    """

    def __init__(self, storage):
        self.storage = storage
        self._skills_dir = Path(storage.base_path) / "procedural_memory"
        self._skills_file = self._skills_dir / "skills.jsonl"
        self._ensure_dirs()

    async def store_skill(self, skill: Skill):
        """Store a reusable skill."""
        with open(self._skills_file, 'a', encoding='utf-8') as f:
            f.write(json.dumps(skill.to_dict(), ensure_ascii=False) + '\n')

    async def find_applicable_skills(self, task: str) -> List[Skill]:
        """Find skills whose trigger patterns match the current task."""
        skills = self._load_all()
        task_lower = task.lower()
        applicable = []

        for skill in skills:
            trigger = skill.trigger_pattern.lower()
            # Simple keyword matching on trigger pattern
            trigger_words = set(trigger.split())
            task_words = set(task_lower.split())
            overlap = len(trigger_words & task_words)
            if overlap >= 1:
                applicable.append(skill)

        # Sort by success rate
        applicable.sort(key=lambda s: s.success_rate, reverse=True)
        return applicable

    async def record_success(self, task: str, steps: List[str], tags: List[str] = None):
        """Learn from a successful task completion."""
        import datetime

        # Check if we already have a similar skill
        existing_skills = await self.find_applicable_skills(task)
        if existing_skills:
            # Update the best matching skill
            best = existing_skills[0]
            best.success_count += 1
            best.steps = steps  # Update with the latest working steps
            if tags:
                best.tags = list(set(best.tags + tags))
            self._rewrite_all(existing_skills)
        else:
            # Create new skill
            skill = Skill(
                name=f"skill_{len(self._load_all()) + 1}",
                trigger_pattern=task[:100],
                steps=steps,
                success_count=1,
                failure_count=0,
                tags=tags or [],
                created_at=datetime.datetime.utcnow().isoformat(),
            )
            await self.store_skill(skill)

    async def record_failure(self, task: str):
        """Record that a known skill failed on this task."""
        skills = await self.find_applicable_skills(task)
        if skills:
            skills[0].failure_count += 1
            self._rewrite_all(skills)

    async def get_all(self) -> List[Skill]:
        """Get all stored skills."""
        return self._load_all()

    async def count(self) -> int:
        return len(self._load_all())

    async def clear(self):
        if self._skills_file.exists():
            self._skills_file.unlink()
            self._ensure_dirs()

    def _ensure_dirs(self):
        self._skills_dir.mkdir(parents=True, exist_ok=True)

    def _load_all(self) -> List[Skill]:
        if not self._skills_file.exists():
            return []
        skills = []
        try:
            with open(self._skills_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            skills.append(Skill.from_dict(json.loads(line)))
                        except (json.JSONDecodeError, KeyError):
                            pass
        except FileNotFoundError:
            pass
        return skills

    def _rewrite_all(self, skills: List[Skill]):
        with open(self._skills_file, 'w', encoding='utf-8') as f:
            for skill in skills:
                f.write(json.dumps(skill.to_dict(), ensure_ascii=False) + '\n')
