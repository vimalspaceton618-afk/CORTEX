"""PMSpecAgent — Reads requirements, clarifies ambiguity, writes technical specs."""
from ..base import LeadAgent, SubAgent, AgentTask, AgentAction, AgentState, ActionType


class RequirementsAnalyzer(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="requirements_analyzer", group="workflow",
                         description="Analyze requirements, identify gaps, clarify ambiguity", **kw)
    def can_handle(self, task): return 0.7
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Analyze these requirements. Identify: gaps, ambiguities, assumptions, "
                    f"missing edge cases, unclear acceptance criteria.\n\n{state.task.query}",
                    use_verification=False, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="Analysis", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Requirements analyzed.")


class SpecWriter(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="spec_writer", group="workflow",
                         description="Write detailed technical specifications from requirements", **kw)
    def can_handle(self, task): return 0.6
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Write a full technical specification document. Include: overview, "
                    f"scope, architecture, data models, API contracts, error handling, "
                    f"security, testing strategy, milestones.\n\n{state.task.query}",
                    use_verification=False, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="Spec written", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Specification written.")


class PMSpecAgent(LeadAgent):
    """Lead: reads requirements, clarifies ambiguity, writes technical specs."""
    def __init__(self, **kw):
        super().__init__(name="pm_spec", group="workflow",
                         description="PM/Spec: analyze requirements, clarify ambiguity, write technical specs", **kw)
        self.register_subagent(RequirementsAnalyzer())
        self.register_subagent(SpecWriter())

    def can_handle(self, task):
        q = task.query.lower()
        kws = ["requirement","spec","specification","prd","user story","acceptance criteria","scope","feature","milestone","stakeholder"]
        return min(1.0, sum(0.15 for k in kws if k in q))

    async def step(self, state):
        if not state.steps:
            return AgentAction(action_type=ActionType.PARALLEL, description="Full spec analysis",
                               subagent_tasks=[
                                   {"agent":"requirements_analyzer","query":state.task.query},
                                   {"agent":"spec_writer","query":state.task.query},
                               ])
        if state.subagent_results:
            parts = []
            if "requirements_analyzer" in state.subagent_results:
                parts.append(f"## Requirements Analysis\n{state.subagent_results['requirements_analyzer']}")
            if "spec_writer" in state.subagent_results:
                parts.append(f"## Technical Specification\n{state.subagent_results['spec_writer']}")
            return AgentAction(action_type=ActionType.RESPOND, description="Spec complete", content="\n\n---\n\n".join(parts))
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Spec done.")
