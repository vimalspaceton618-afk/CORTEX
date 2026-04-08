"""PlannerAgent — Hierarchical task decomposition and execution tracking."""

from .base import BaseAgent, AgentTask, AgentAction, AgentState, ActionType


class PlannerAgent(BaseAgent):
    """
    Breaks complex requests into step-by-step plans.

    Pipeline:
    1. Analyze task complexity
    2. Decompose into subtasks with agent assignments
    3. Execute subtasks via delegation
    4. Track progress and handle failures
    5. Synthesize final report
    """

    def __init__(self, **kwargs):
        super().__init__(
            name="planner",
            description="Decompose complex tasks into step-by-step plans with agent assignments",
            capabilities=["task_decomposition", "delegation", "progress_tracking"],
            max_steps=15,
            **kwargs,
        )

    def can_handle(self, task: AgentTask) -> float:
        query = task.query.lower()
        keywords = ["plan", "steps", "roadmap", "strategy", "breakdown",
                     "decompose", "workflow", "project", "how to build",
                     "phase", "stage", "timeline", "milestone"]
        score = sum(0.2 for kw in keywords if kw in query)
        return min(1.0, max(0.05, score))

    async def step(self, state: AgentState) -> AgentAction:
        step_num = len(state.steps)

        if step_num == 0:
            # Generate plan via council
            if self.council:
                try:
                    plan_prompt = (
                        f"Create a detailed step-by-step plan for the following task. "
                        f"For each step, specify:\n"
                        f"1. What needs to be done\n"
                        f"2. Which specialist should do it (researcher/coder/verifier/architect)\n"
                        f"3. Expected output\n\n"
                        f"Task: {state.task.query}"
                    )
                    result = await self.council.process_question(
                        plan_prompt, use_verification=False, store_in_knowledge=False,
                    )
                    plan = result.get("answer", "")

                    # Store plan for reference
                    state.current_plan = [{"description": plan, "status": "done"}]

                    return AgentAction(
                        action_type=ActionType.RESPOND,
                        description="Plan generated",
                        content=f"## Execution Plan\n\n{plan}",
                    )
                except Exception as e:
                    return AgentAction(
                        action_type=ActionType.RESPOND,
                        description="Planning failed",
                        content=f"Error generating plan: {e}",
                    )

            return AgentAction(
                action_type=ActionType.RESPOND,
                description="No planning infrastructure",
                content="Planning requires teacher models. Please configure one.",
            )

        return AgentAction(
            action_type=ActionType.RESPOND,
            description="Plan complete",
            content=state.observations[-1] if state.observations else "Planning complete.",
        )
