"""MemoryManager for CORTEX -- unified interface for all memory types."""

import json
from pathlib import Path
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field

from .working import WorkingMemory
from .episodic import EpisodicMemory, Episode
from .semantic import SemanticMemory
from .procedural import ProceduralMemory, Skill


@dataclass
class RetrievedMemories:
    """Aggregated results from cross-memory retrieval."""
    episodic: List[Episode] = field(default_factory=list)
    semantic: List[Dict] = field(default_factory=list)
    procedural: List[Skill] = field(default_factory=list)
    working_summary: str = ""

    def combined_summary(self) -> str:
        parts = []
        if self.working_summary:
            parts.append(f"Working Memory:\n{self.working_summary}")
        if self.episodic:
            parts.append("\nEpisodic Memories:")
            for ep in self.episodic:
                parts.append(f"  [score: {ep.outcome_score:.2f}] {ep.task[:80]}... -> {ep.answer[:60]}...")
        if self.semantic:
            parts.append("\nSemantic Facts:")
            for item in self.semantic[:5]:
                parts.append(f"  - {item.get('question', item.get('answer', ''))[:80]}")
        if self.procedural:
            parts.append("\nProcedural Skills:")
            for skill in self.procedural:
                parts.append(f"  - {skill.name} ({skill.success_rate:.0%} success): {skill.trigger_pattern[:60]}")
        return "\n".join(parts)


class MemoryManager:
    """
    Unified interface for episodic, semantic, procedural, and working memory.

    Usage:
        mm = MemoryManager(storage=localStorage, kg=knowledgeGraph)
        # Store
        await mm.store("episodic", Episode(...))
        # Retrieve across all types
        memories = await mm.retrieve("how to validate email regex")
        # Consolidate frequently accessed working memory
        await mm.consolidate()
    """

    def __init__(self, storage, kg, config=None):
        """
        Args:
            storage: LocalStorage instance for persistent memory files
            kg: KnowledgeGraph instance (wrapped by SemanticMemory)
            config: Optional dict with episodic_max, consolidation_threshold,
                    working_context_tokens, decay_half_life_days
        """
        episodic_max = 1000
        context_tokens = 8000
        if config:
            episodic_max = config.get('episodic_max', episodic_max)
            context_tokens = config.get('working_context_tokens', context_tokens)

        self.episodic = EpisodicMemory(storage, max_episodes=episodic_max)
        self.semantic = SemanticMemory(kg) if kg else None
        self.procedural = ProceduralMemory(storage)
        self.working = WorkingMemory(max_tokens=context_tokens)

    async def store(self, memory_type: str, content):
        """
        Store to episodic, semantic, or procedural memory.

        Args:
            memory_type: "episodic", "procedural"
            content: Episode or Skill instance
        """
        if memory_type == "episodic":
            await self.episodic.store(content)
        elif memory_type == "procedural":
            await self.procedural.store_skill(content)
        else:
            raise ValueError(f"Unknown memory type: {memory_type}")

    async def retrieve(self, query: str, k: int = 5) -> RetrievedMemories:
        """Search across all memory types with relevance scoring."""
        memories = RetrievedMemories()

        # Episodic: past interactions
        memories.episodic = await self.episodic.find_related(query, k=k)

        # Semantic: facts from knowledge graph
        if self.semantic:
            memories.semantic = await self.semantic.retrieve(query, k=k)

        # Procedural: applicable skills
        memories.procedural = await self.procedural.find_applicable_skills(query)

        # Working: current context
        memories.working_summary = self.working.summarize()

        return memories

    async def consolidate(self, threshold: int = 5):
        """
        Move frequently-accessed working memory entries to long-term storage.

        Entries accessed more than `threshold` times are extracted and
        stored as procedural knowledge. Working memory entry is cleared
        after consolidation.
        """
        frequent = [e for e in self.working.entries if e.access_count >= threshold]

        if frequent and self.semantic:
            # Extract concepts from frequent entries
            combined = " ".join(e.content for e in frequent)
            concepts = await self.semantic.extract_concepts(combined)

            # Store as procedural skill if we found concepts
            if concepts:
                skill = Skill(
                    name=f"consolidated_{len(await self.procedural.get_all()) + 1}",
                    trigger_pattern=" ".join(c['concept'] for c in concepts[:3]),
                    steps=[c['description'] for c in concepts],
                    tags=["auto-extracted"],
                )
                await self.procedural.store_skill(skill)

        # Clear working memory after consolidation
        self.working.clear()

    def add_to_working(self, content: str, entry_type: str = "info", importance: float = 1.0):
        """Shorthand: add to working memory."""
        self.working.add(content, entry_type=entry_type, importance=importance)

    async def stats(self) -> Dict[str, Any]:
        """Get stats for all memory types."""
        stats = {
            "episodic_count": await self.episodic.count(),
            "procedural_count": await self.procedural.count(),
            "working_entries": len(self.working.entries),
            "working_tokens": self.working.token_count,
        }
        if self.semantic:
            stats["semantic_count"] = await self.semantic.count()
        return stats
