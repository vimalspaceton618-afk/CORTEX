"""ArchitectAgent — System design and technical architecture."""

from .base import BaseAgent, AgentTask, AgentAction, AgentState, ActionType


class ArchitectAgent(BaseAgent):
    """
    System design and architecture analysis agent.

    Capabilities:
    - Generate architecture proposals
    - Analyze codebases for patterns/anti-patterns
    - Propose refactoring strategies
    - Generate project scaffolding
    """

    def __init__(self, **kwargs):
        super().__init__(
            name="architect",
            description="System design, architecture analysis, and technical planning",
            capabilities=["system_design", "code_analysis", "filesystem"],
            **kwargs,
        )

    def can_handle(self, task: AgentTask) -> float:
        query = task.query.lower()
        keywords = ["design", "architect", "structure", "system", "scale",
                     "infrastructure", "database", "microservice", "pattern",
                     "diagram", "refactor", "scaffold", "api design"]
        score = sum(0.2 for kw in keywords if kw in query)
        return min(1.0, max(0.05, score))

    async def step(self, state: AgentState) -> AgentAction:
        step_num = len(state.steps)

        if step_num == 0:
            if self.council:
                try:
                    arch_prompt = (
                        f"You are a senior software architect. Provide a comprehensive "
                        f"technical design for the following request. Include:\n"
                        f"1. High-level architecture (components and data flow)\n"
                        f"2. Technology choices with rationale\n"
                        f"3. Key design patterns\n"
                        f"4. Potential risks and mitigations\n"
                        f"5. ASCII or Mermaid diagram if applicable\n\n"
                        f"Request: {state.task.query}"
                    )
                    result = await self.council.process_question(
                        arch_prompt, use_verification=False, store_in_knowledge=True,
                    )
                    return AgentAction(
                        action_type=ActionType.RESPOND,
                        description="Architecture design complete",
                        content=result.get("answer", ""),
                    )
                except Exception as e:
                    return AgentAction(
                        action_type=ActionType.RESPOND,
                        description="Architecture generation failed",
                        content=f"Error: {e}",
                    )

            return AgentAction(
                action_type=ActionType.RESPOND,
                description="No architecture infrastructure",
                content="Architecture design requires teacher models.",
            )

        return AgentAction(
            action_type=ActionType.RESPOND,
            description="Done",
            content=state.observations[-1] if state.observations else "Design complete.",
        )
