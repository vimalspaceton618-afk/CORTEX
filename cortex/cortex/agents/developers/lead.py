"""DevLeadAgent — Lead agent for specialist developers.

Subagents: FrontendDev, BackendDev, APIDesigner, DBA, RustEngineer, TypeScriptPro
"""
from ..base import LeadAgent, SubAgent, AgentTask, AgentAction, AgentState, ActionType


class FrontendDev(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="frontend_dev", group="developers",
                         description="Frontend: React, Vue, HTML/CSS/JS, responsive design, animations",
                         capabilities=["node_runner","filesystem","python_repl"], **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["frontend","react","vue","html","css","ui","ux","component","dom","style","tailwind","next"] if k in q))
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"You are a senior frontend developer. Write production-quality code.\n\n{state.task.query}",
                    use_verification=False, store_in_knowledge=False)
                code = r.get("answer","")
                return AgentAction(action_type=ActionType.RESPOND, description="Frontend code", content=code)
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Frontend task complete.")


class BackendDev(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="backend_dev", group="developers",
                         description="Backend: Python/Node.js servers, databases, auth, microservices",
                         capabilities=["python_repl","node_runner","shell_exec","db_query"], **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["backend","server","api","endpoint","database","fastapi","express","django","flask","auth","middleware"] if k in q))
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"You are a senior backend engineer. Write scalable, secure code.\n\n{state.task.query}",
                    use_verification=False, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="Backend code", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Backend task complete.")


class APIDesigner(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="api_designer", group="developers",
                         description="API Design: REST, GraphQL, OpenAPI specs, versioning, auth schemes",
                         capabilities=["http_client","filesystem"], **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["api","rest","graphql","openapi","swagger","endpoint","schema","route","contract"] if k in q))
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Design a complete API specification with endpoints, schemas, auth.\n\n{state.task.query}",
                    use_verification=False, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="API spec", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="API design complete.")


class DBA(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="dba", group="developers",
                         description="Database Admin: schema design, queries, indexing, migrations, performance",
                         capabilities=["db_query","python_repl"], **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["database","sql","schema","table","index","query","migration","postgres","mysql","sqlite","orm","normalization"] if k in q))
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"You are a senior DBA. Design optimal schema/queries.\n\n{state.task.query}",
                    use_verification=False, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="DB solution", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Database task complete.")


class RustEngineer(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="rust_engineer", group="developers",
                         description="Rust: systems programming, zero-cost abstractions, memory safety",
                         capabilities=["rust_runner","filesystem"], **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.25 for k in ["rust","cargo","struct","impl","trait","borrow","lifetime","unsafe","wasm"] if k in q))
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Write idiomatic Rust code. Use proper error handling (Result/Option).\n\n{state.task.query}",
                    use_verification=False, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="Rust code", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Rust task complete.")


class TypeScriptPro(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="typescript_pro", group="developers",
                         description="TypeScript: strict types, generics, decorators, full-stack TS",
                         capabilities=["node_runner","filesystem"], **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.25 for k in ["typescript","ts","type","interface","generic","decorator","angular","nest","deno"] if k in q))
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Write production TypeScript with strict types, generics.\n\n{state.task.query}",
                    use_verification=False, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="TS code", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="TypeScript task complete.")


class DevLeadAgent(LeadAgent):
    """Lead: routes to Frontend, Backend, API, DBA, Rust, or TypeScript specialist."""
    def __init__(self, **kw):
        super().__init__(name="developers", group="developers",
                         description="Specialist developers: Frontend, Backend, API, DBA, Rust, TypeScript", **kw)
        self.register_subagent(FrontendDev())
        self.register_subagent(BackendDev())
        self.register_subagent(APIDesigner())
        self.register_subagent(DBA())
        self.register_subagent(RustEngineer())
        self.register_subagent(TypeScriptPro())

    def can_handle(self, task):
        q = task.query.lower()
        kws = ["build","create","code","write","implement","develop","frontend","backend","api","database","rust","typescript","function","class","module"]
        return min(1.0, sum(0.12 for k in kws if k in q))

    async def step(self, state):
        if not state.steps:
            best = self._best_subagent(state.task)
            if best:
                return AgentAction(action_type=ActionType.DELEGATE_SUB, description=f"Routing to {best}",
                                   delegate_to=best, delegate_task=state.task.query)
            # Default: backend
            return AgentAction(action_type=ActionType.DELEGATE_SUB, description="Default to backend",
                               delegate_to="backend_dev", delegate_task=state.task.query)
        if state.subagent_results:
            return AgentAction(action_type=ActionType.RESPOND, description="Dev complete",
                               content=list(state.subagent_results.values())[0])
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Development complete.")
