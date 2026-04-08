"""Working Memory for CORTEX -- bounded in-memory context for active tasks."""

import time
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional


@dataclass
class MemoryEntry:
    """A single entry in working memory."""
    content: str
    entry_type: str  # "thought", "observation", "tool_result", "agent_output", "fact"
    timestamp: float = field(default_factory=time.time)
    access_count: int = 0
    importance: float = 1.0  # 0.0-1.0, used during eviction

    def touch(self):
        """Mark this entry as recently accessed."""
        self.access_count += 1
        self.timestamp = time.time()

    @property
    def approximate_tokens(self) -> int:
        """Rough token count (1 token ~ 0.75 words for English)."""
        return len(self.content.split())


class WorkingMemory:
    """
    Bounded in-memory context for current task execution.

    Evicts oldest entries when approaching token budget.
    High-importance entries are protected from eviction.
    """

    def __init__(self, max_tokens: int = 8000):
        self.entries: List[MemoryEntry] = []
        self.max_tokens = max_tokens

    def add(self, content: str, entry_type: str = "info",
            importance: float = 1.0) -> MemoryEntry:
        """Add entry; evict oldest non-important entries if over limit."""
        entry = MemoryEntry(
            content=content,
            entry_type=entry_type,
            importance=importance,
        )
        self.entries.append(entry)
        self._evict_if_needed()
        return entry

    def get_context(self, max_tokens: Optional[int] = None) -> str:
        """Return formatted context string for LLM prompts."""
        limit = max_tokens or self.max_tokens
        parts = []
        total_tokens = 0

        # Sort by recency, put important entries last (higher priority)
        sorted_entries = sorted(self.entries, key=lambda e: (e.importance, e.timestamp))

        for entry in sorted_entries:
            tokens = entry.approximate_tokens
            if total_tokens + tokens > limit:
                parts.append(f"\n...[context truncated at {total_tokens} tokens]")
                break
            entry.touch()
            parts.append(f"[{entry.entry_type}] {entry.content}")
            total_tokens += tokens

        return "\n".join(parts)

    def summarize(self) -> str:
        """Condense working memory to key points when approaching limit."""
        if not self.entries:
            return "(empty working memory)"

        # Group by type and return most important entries
        important = [e for e in self.entries if e.importance > 0.7]
        if important:
            return "\n".join(f"- {e.content}" for e in important)

        return "\n".join(f"- [{e.entry_type}] {e.content[:200]}" for e in self.entries[-10:])

    @property
    def token_count(self) -> int:
        return sum(e.approximate_tokens for e in self.entries)

    def clear(self):
        """Clear all entries (task complete)."""
        self.entries.clear()

    def _evict_if_needed(self):
        """Remove oldest entries if token budget exceeded."""
        while self.token_count > self.max_tokens:
            # Find evictable entry (non-important)
            evictable = [e for e in self.entries if e.importance < 0.8]
            if not evictable:
                evictable = self.entries
            if not evictable:
                break
            entry = evictable[0]
            self.entries.remove(entry)

    def get_recent(self, n: int = 5) -> List[MemoryEntry]:
        """Get the N most recent entries."""
        return sorted(self.entries, key=lambda e: e.timestamp, reverse=True)[:n]

    def get_by_type(self, entry_type: str) -> List[MemoryEntry]:
        """Get all entries of a specific type."""
        return [e for e in self.entries if e.entry_type == entry_type]
