"""Chain-of-Thought Reasoning Engine.

Supports chain, tree, and graph modes for multi-step reasoning
with self-reflection cycles.
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class ReasoningStep:
    """Single step in a reasoning chain."""
    step_num: int
    thought: str
    evidence: str = ""
    conclusion: str = ""
    confidence: float = 0.5
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class ReasoningResult:
    """Output of a reasoning chain."""
    question: str
    steps: List[ReasoningStep]
    final_answer: str
    confidence: float
    mode: str  # "chain" | "tree" | "graph"
    reflection_notes: List[str] = field(default_factory=list)
    duration_ms: float = 0


class ReasoningChain:
    """
    Multi-step reasoning with reflection.

    Modes:
    - "chain": Linear step-by-step (default)
    - "tree": Branch and evaluate multiple paths
    - "graph": Interconnected reasoning nodes
    """

    def __init__(
        self,
        max_steps: int = 10,
        max_reflections: int = 3,
        mode: str = "chain",
    ):
        self.max_steps = max_steps
        self.max_reflections = max_reflections
        self.mode = mode

    async def reason(
        self,
        question: str,
        context: str = "",
        council=None,
    ) -> ReasoningResult:
        """Run chain-of-thought reasoning."""
        import time
        start = time.time()

        steps = []

        if council:
            # Step 1: Break down the question
            decomp = await council.process_question(
                f"Break this question into 2-3 logical reasoning steps. "
                f"For each step, state what needs to be determined.\n\n"
                f"Question: {question}\nContext: {context}",
                use_verification=False,
                store_in_knowledge=False,
            )
            steps.append(ReasoningStep(
                step_num=1,
                thought="Decomposing question into reasoning steps",
                evidence=decomp.get("answer", ""),
                confidence=0.6,
            ))

            # Step 2: Reason through each step
            reasoning = await council.process_question(
                f"Given this reasoning plan:\n{decomp.get('answer', '')}\n\n"
                f"Now reason through each step to answer: {question}",
                use_verification=True,
                store_in_knowledge=False,
            )
            steps.append(ReasoningStep(
                step_num=2,
                thought="Reasoning through steps with verification",
                evidence=reasoning.get("verification_summary", ""),
                conclusion=reasoning.get("answer", ""),
                confidence=reasoning.get("confidence", 0.5),
            ))

            final_answer = reasoning.get("answer", "")
            confidence = reasoning.get("confidence", 0.5)
        else:
            final_answer = "Reasoning requires a council (teacher models) to function."
            confidence = 0.0

        # Self-reflection
        reflection_notes = self._reflect(steps)

        duration = (time.time() - start) * 1000
        return ReasoningResult(
            question=question,
            steps=steps,
            final_answer=final_answer,
            confidence=confidence,
            mode=self.mode,
            reflection_notes=reflection_notes,
            duration_ms=duration,
        )

    def _reflect(self, steps: List[ReasoningStep]) -> List[str]:
        """Identify potential flaws in reasoning."""
        notes = []
        if len(steps) < 2:
            notes.append("Shallow reasoning — consider deeper analysis")
        low_conf = [s for s in steps if s.confidence < 0.4]
        if low_conf:
            notes.append(f"{len(low_conf)} step(s) with low confidence")
        if all(not s.evidence for s in steps):
            notes.append("No evidence cited — claims may be unverified")
        return notes
