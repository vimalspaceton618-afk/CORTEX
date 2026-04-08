"""VerifierAgent — Fact-checking and claim verification."""

from .base import BaseAgent, AgentTask, AgentAction, AgentState, ActionType


class VerifierAgent(BaseAgent):
    """
    Verifies claims against multiple sources.

    Pipeline:
    1. Extract claims from input
    2. Check knowledge graph for existing verification
    3. Query King of Browser for ground truth
    4. Cross-reference with teacher responses
    5. Generate verification report
    """

    def __init__(self, **kwargs):
        super().__init__(
            name="verifier",
            description="Verify claims against ground truth using King of Browser and teacher cross-referencing",
            capabilities=["king_verify", "knowledge_search", "web_search"],
            **kwargs,
        )

    def can_handle(self, task: AgentTask) -> float:
        query = task.query.lower()
        keywords = ["verify", "check", "validate", "confirm", "true", "false",
                     "fact", "accurate", "correct", "source", "proof"]
        score = sum(0.2 for kw in keywords if kw in query)
        return min(1.0, max(0.05, score))

    async def step(self, state: AgentState) -> AgentAction:
        step_num = len(state.steps)

        if step_num == 0:
            # Query council with verification enabled
            if self.council:
                try:
                    result = await self.council.process_question(
                        state.task.query,
                        use_verification=True,
                        store_in_knowledge=False,
                    )
                    answer = result.get("answer", "")
                    verification = result.get("verification_summary", "No verification data")
                    teacher_labels = result.get("teacher_labels", {})
                    contradictions = result.get("contradictions_found", 0)

                    # Build verification report
                    report = [f"**Answer**: {answer}", ""]
                    report.append(f"**Verification**: {verification}")
                    if teacher_labels:
                        report.append("\n**Teacher Labels**:")
                        for teacher, label in teacher_labels.items():
                            icon = "✓" if label == "CORRECT" else "✗" if label == "INCORRECT" else "?"
                            report.append(f"  {icon} {teacher}: {label}")
                    if contradictions:
                        report.append(f"\n⚠ **Contradictions detected**: {contradictions}")

                    return AgentAction(
                        action_type=ActionType.RESPOND,
                        description=f"Verification complete ({contradictions} contradictions)",
                        content="\n".join(report),
                    )
                except Exception as e:
                    return AgentAction(
                        action_type=ActionType.RESPOND,
                        description="Verification failed",
                        content=f"Error during verification: {e}",
                    )

            return AgentAction(
                action_type=ActionType.RESPOND,
                description="No verification infrastructure",
                content="Verification requires the Council of Critics. Please initialize.",
            )

        return AgentAction(
            action_type=ActionType.RESPOND,
            description="Done",
            content=state.observations[-1] if state.observations else "Verification complete.",
        )
