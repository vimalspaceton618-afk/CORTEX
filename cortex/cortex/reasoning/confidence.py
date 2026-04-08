"""Confidence calibration for CORTEX reasoning outputs."""

from dataclasses import dataclass
from typing import Optional, List


@dataclass
class ConfidenceSignals:
    """Signals used to calibrate output confidence."""
    teacher_agreement: float = 0.0  # 0-1, fraction of teachers that agree
    verification_status: Optional[str] = None  # "CORRECT", "INCORRECT", "UNVERIFIED"
    king_matches: int = 0  # Number of King verification hits
    reasoning_consistency: float = 0.0  # 0-1, consistency of reasoning steps
    memory_retrieval_confidence: float = 0.0  # 0-1, similarity to known answers
    tool_execution_success: float = 0.0  # 0-1, success rate of tool calls
    reflection_flaws: int = 0  # Number of flaws found during reflection
    contradiction_count: int = 0  # Number of contradictions detected


@dataclass
class ConfidenceResult:
    """Calibrated confidence output."""
    score: float  # 0.0-1.0
    level: str  # "very_low", "low", "medium", "high", "very_high"
    factors: List[str]  # What contributed to this score


class ConfidenceCalibrator:
    """
    Calibrates output confidence using multiple signals.
    Returns a calibrated 0-1 confidence score with explanation.
    """

    _WEIGHTS = {
        "teacher_agreement": 0.25,
        "verification_status": 0.25,
        "king_verification": 0.15,
        "reasoning_consistency": 0.10,
        "memory_similarity": 0.10,
        "tool_success": 0.05,
        "reflection_penalty": 0.05,
        "contradiction_penalty": 0.05,
    }

    def compute(self, signals: ConfidenceSignals) -> ConfidenceResult:
        """Return calibrated confidence 0-1 with factor explanation."""
        score = 0.0
        factors = []

        # Teacher agreement (0-1 -> 0-0.25)
        agreement_score = signals.teacher_agreement * self._WEIGHTS["teacher_agreement"]
        score += agreement_score
        if signals.teacher_agreement >= 0.8:
            factors.append(f"All teachers agree ({signals.teacher_agreement:.0%})")
        elif signals.teacher_agreement <= 0.3:
            factors.append(f"Teachers mostly disagree ({signals.teacher_agreement:.0%})")

        # Verification status (0-1 -> 0-0.25)
        if signals.verification_status == "CORRECT":
            score += self._WEIGHTS["verification_status"]
            factors.append("Verified correct against ground truth")
        elif signals.verification_status == "INCORRECT":
            factors.append("Failed verification against ground truth")
        # UNVERIFIED adds nothing

        # King verification (count -> 0-0.15)
        king_score = min(1.0, signals.king_matches / 5.0)
        score += king_score * self._WEIGHTS["king_verification"]
        if signals.king_matches > 0:
            factors.append(f"King found {signals.king_matches} supporting sources")

        # Reasoning consistency (0-1 -> 0-0.10)
        score += signals.reasoning_consistency * self._WEIGHTS["reasoning_consistency"]
        if signals.reasoning_consistency > 0.7:
            factors.append("Reasoning steps are internally consistent")
        elif signals.reasoning_consistency < 0.3:
            factors.append("Reasoning steps are inconsistent")

        # Memory retrieval (0-1 -> 0-0.10)
        score += signals.memory_retrieval_confidence * self._WEIGHTS["memory_similarity"]
        if signals.memory_retrieval_confidence > 0.8:
            factors.append("High confidence memory match")

        # Tool execution success (0-1 -> 0-0.05)
        score += signals.tool_execution_success * self._WEIGHTS["tool_success"]

        # Reflection penalty (flaws -> reduction, max 0.05)
        if signals.reflection_flaws > 0:
            penalty = min(1.0, signals.reflection_flaws / 5.0)
            score -= penalty * self._WEIGHTS["reflection_penalty"]
            factors.append(f"Reflection found {signals.reflection_flaws} flaw(s)")

        # Contradiction penalty
        if signals.contradiction_count > 0:
            penalty = min(1.0, signals.contradiction_count / 3.0)
            score -= penalty * self._WEIGHTS["contradiction_penalty"]
            factors.append(f"{signals.contradiction_count} contradiction(s) detected")

        # Clamp to [0, 1]
        score = max(0.0, min(1.0, score))

        return ConfidenceResult(
            score=round(score, 3),
            level=self._score_to_level(score),
            factors=factors,
        )

    @staticmethod
    def _score_to_level(score: float) -> str:
        if score >= 0.85:
            return "very_high"
        elif score >= 0.7:
            return "high"
        elif score >= 0.5:
            return "medium"
        elif score >= 0.3:
            return "low"
        else:
            return "very_low"
