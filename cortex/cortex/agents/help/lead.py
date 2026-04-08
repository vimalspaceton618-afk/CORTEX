"""HelpGuideAgent — Lead agent for tutorials, examples, and error explanations.

Subagents: TutorialGenerator, ExampleProvider, ErrorExplainer
"""
from ..base import LeadAgent, SubAgent, AgentTask, AgentAction, AgentState, ActionType


class TutorialGenerator(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="tutorial_gen", group="help",
                         description="Generate step-by-step tutorials and learning guides", **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.25 for k in ["tutorial","guide","learn","teach","howto","walkthrough"] if k in q))
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Write a detailed tutorial with steps, code examples, and explanations.\n\n{state.task.query}",
                    use_verification=True, store_in_knowledge=True)
                return AgentAction(action_type=ActionType.RESPOND, description="Tutorial", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Tutorial generated.")


class ExampleProvider(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="example_provider", group="help",
                         description="Provide working code examples and usage patterns", **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.25 for k in ["example","demo","sample","show","snippet","usage"] if k in q))
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Give 3 practical code examples with explanations.\n\n{state.task.query}",
                    use_verification=False, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="Examples", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Examples generated.")


class ErrorExplainer(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="error_explainer", group="help",
                         description="Explain errors, stack traces, and common pitfalls", **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["error","exception","traceback","stack","why","fail","crash","bug","fix"] if k in q))
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Explain this error: what caused it, how to fix it, common pitfalls.\n\n{state.task.query}",
                    use_verification=True, store_in_knowledge=True)
                return AgentAction(action_type=ActionType.RESPOND, description="Explained", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Error explained.")


class HelpGuideAgent(LeadAgent):
    """Lead: tutorials, examples, and error explanations."""
    def __init__(self, **kw):
        super().__init__(name="help", group="help",
                         description="Tutorials, code examples, and error explanations", **kw)
        self.register_subagent(TutorialGenerator())
        self.register_subagent(ExampleProvider())
        self.register_subagent(ErrorExplainer())

    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.15 for k in ["help","guide","tutorial","example","how to","explain","show me","teach","learn","error"] if k in q))

    async def step(self, state):
        if not state.steps:
            best = self._best_subagent(state.task)
            if best:
                return AgentAction(action_type=ActionType.DELEGATE_SUB, description=f"Routing to {best}",
                                   delegate_to=best, delegate_task=state.task.query)
        if state.subagent_results:
            return AgentAction(action_type=ActionType.RESPOND, description="Help complete",
                               content=list(state.subagent_results.values())[0])
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Help provided.")
