"""PlanAgent — Lead agent for task decomposition and planning.

Subagents: TaskDecomposer, DependencyAnalyzer, TimelineEstimator
"""
from ..base import LeadAgent, SubAgent, AgentTask, AgentAction, AgentState, ActionType


class TaskDecomposer(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="task_decomposer", group="plan",
                         description="Break complex tasks into ordered subtasks with agent assignments", **kw)
    def can_handle(self, task): return 0.8
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Decompose into numbered subtasks. Each: description, agent, expected output.\n\nTask: {state.task.query}",
                    use_verification=False, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="Decomposed", content=r.get("answer",""))
            except Exception as e:
                return AgentAction(action_type=ActionType.RESPOND, description="Error", content=str(e))
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Decomposition complete.")


class DependencyAnalyzer(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="dependency_analyzer", group="plan",
                         description="Analyze task dependencies and determine execution order", **kw)
    def can_handle(self, task): return 0.5
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Analyze dependencies between these tasks. Show a DAG.\n\n{state.task.query}",
                    use_verification=False, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="Dependencies mapped", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Dependency analysis complete.")


class TimelineEstimator(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="timeline_estimator", group="plan",
                         description="Estimate time/effort for tasks and generate timeline", **kw)
    def can_handle(self, task): return 0.4
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Estimate time and effort. Give optimistic/realistic/pessimistic.\n\n{state.task.query}",
                    use_verification=False, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="Timeline estimated", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Timeline estimation complete.")


class PlanAgent(LeadAgent):
    """Lead: decomposes tasks, analyzes dependencies, estimates timelines."""
    def __init__(self, **kw):
        super().__init__(name="plan", group="plan",
                         description="Decompose tasks, analyze dependencies, estimate timelines", **kw)
        self.register_subagent(TaskDecomposer())
        self.register_subagent(DependencyAnalyzer())
        self.register_subagent(TimelineEstimator())

    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["plan","steps","roadmap","strategy","breakdown","decompose","timeline","milestone","phase","project"] if k in q))

    async def step(self, state):
        if not state.steps:
            return AgentAction(action_type=ActionType.PARALLEL, description="Full planning analysis",
                               subagent_tasks=[
                                   {"agent":"task_decomposer","query":state.task.query},
                                   {"agent":"dependency_analyzer","query":state.task.query},
                                   {"agent":"timeline_estimator","query":state.task.query},
                               ])
        if state.subagent_results:
            parts = []
            if "task_decomposer" in state.subagent_results:
                parts.append(f"## Task Breakdown\n{state.subagent_results['task_decomposer']}")
            if "dependency_analyzer" in state.subagent_results:
                parts.append(f"## Dependencies\n{state.subagent_results['dependency_analyzer']}")
            if "timeline_estimator" in state.subagent_results:
                parts.append(f"## Timeline\n{state.subagent_results['timeline_estimator']}")
            return AgentAction(action_type=ActionType.RESPOND, description="Plan complete", content="\n\n".join(parts))
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Planning complete.")
