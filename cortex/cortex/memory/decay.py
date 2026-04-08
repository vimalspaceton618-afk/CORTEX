"""Decay policy for CORTEX memory -- consolidation and forgetting."""

import time
import asyncio
from typing import Optional


class DecayPolicy:
    """
    Memory decay and consolidation policy.

    Old entries lose relevance exponentially. Frequently accessed
    working memory entries get consolidated to long-term storage.

    Usage:
        policy = DecayPolicy(half_life_days=30)
        await policy.run_consolidation(memory_manager)  # Call periodically
    """

    def __init__(self, half_life_days: int = 30, consolidation_threshold: int = 5):
        self.half_life_days = half_life_days
        self.consolidation_threshold = consolidation_threshold

    def decay_score(self, timestamp: float) -> float:
        """Calculate decayed relevance score for a given timestamp."""
        now = time.time()
        days_old = (now - timestamp) / 86400
        return 0.5 ** (days_old / self.half_life_days)

    async def run_consolidation(self, memory_manager) -> dict:
        """
        Run one round of memory maintenance:
        1. Decay episodic relevance scores
        2. Consolidate frequently-accessed working memory
        3. Clean up old entries

        Returns summary stats.
        """
        # Decay episodic
        await memory_manager.episodic.decay(half_life_days=self.half_life_days)

        # Consolidate working memory
        await memory_manager.consolidate(threshold=self.consolidation_threshold)

        return {
            "half_life_days": self.half_life_days,
            "consolidation_threshold": self.consolidation_threshold,
        }

    async def start_background(
        self,
        memory_manager,
        interval_hours: int = 24,
        stop_event: Optional[asyncio.Event] = None
    ):
        """Run consolidation on a background schedule."""
        while True:
            if stop_event and stop_event.is_set():
                break
            await self.run_consolidation(memory_manager)
            # Sleep for the specified interval
            for _ in range(interval_hours):
                if stop_event and stop_event.is_set():
                    break
                await asyncio.sleep(3600)
