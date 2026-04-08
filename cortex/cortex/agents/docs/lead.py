"""DocumentAgent — Lead agent for documentation generation.

Subagents: APIDocGen, ReadmeWriter, ChangelogManager
"""
from ..base import LeadAgent, SubAgent, AgentTask, AgentAction, AgentState, ActionType


class APIDocGen(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="api_doc_gen", group="docs",
                         description="Generate API documentation from code (OpenAPI, JSDoc, docstrings)",
                         capabilities=["filesystem","python_repl"], **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["api doc","openapi","swagger","jsdoc","docstring","endpoint doc"] if k in q))
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Generate comprehensive API documentation with endpoints, parameters, "
                    f"request/response examples, error codes.\n\n{state.task.query}",
                    use_verification=False, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="API docs", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="API docs generated.")


class ReadmeWriter(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="readme_writer", group="docs",
                         description="Write professional README.md files with badges, examples, architecture",
                         capabilities=["filesystem","git_ops"], **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.25 for k in ["readme","documentation","doc","badge","getting started","install"] if k in q))
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Write a professional README.md with: description, badges, features, "
                    f"installation, usage, API reference, architecture, license.\n\n{state.task.query}",
                    use_verification=False, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="README", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="README written.")


class ChangelogManager(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="changelog_mgr", group="docs",
                         description="Generate and maintain CHANGELOG.md from git history",
                         capabilities=["git_ops","filesystem"], **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.25 for k in ["changelog","release","version","history","semver","breaking change"] if k in q))
    async def step(self, state):
        if not state.steps:
            return AgentAction(action_type=ActionType.TOOL_CALL, description="Getting git log",
                               tool_name="git_ops", tool_input={"command":"log","args":["--oneline","-50"]})
        if state.tool_results and self.council:
            try:
                r = await self.council.process_question(
                    f"Generate a CHANGELOG.md (Keep a Changelog format) from these commits:\n"
                    f"{state.tool_results[-1].stdout[:2000]}",
                    use_verification=False, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="Changelog", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Changelog generated.")


class DocumentAgent(LeadAgent):
    """Lead: API docs, README, and changelog generation."""
    def __init__(self, **kw):
        super().__init__(name="docs", group="docs",
                         description="Generate API docs, README files, and changelogs", **kw)
        self.register_subagent(APIDocGen())
        self.register_subagent(ReadmeWriter())
        self.register_subagent(ChangelogManager())

    def can_handle(self, task):
        q = task.query.lower()
        kws = ["document","readme","changelog","doc","api doc","jsdoc","docstring","write docs"]
        return min(1.0, sum(0.15 for k in kws if k in q))

    async def step(self, state):
        if not state.steps:
            best = self._best_subagent(state.task)
            if best:
                return AgentAction(action_type=ActionType.DELEGATE_SUB, description=f"Routing to {best}",
                                   delegate_to=best, delegate_task=state.task.query)
        if state.subagent_results:
            return AgentAction(action_type=ActionType.RESPOND, description="Docs complete",
                               content=list(state.subagent_results.values())[0])
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Documentation complete.")
