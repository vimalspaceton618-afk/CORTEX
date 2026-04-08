"""ExploreAgent — Lead agent for research, code exploration, and data mining.

Subagents: WebResearcher, CodeExplorer, DataMiner
"""

from ..base import LeadAgent, SubAgent, AgentTask, AgentAction, AgentState, ActionType, AgentRole


class WebResearcher(SubAgent):
    """Deep web research — multi-hop crawling and source synthesis."""
    def __init__(self, **kw):
        super().__init__(name="web_researcher", group="explore",
                         description="Multi-hop web research, URL crawling, source cross-referencing",
                         capabilities=["http_client", "web_search"], **kw)

    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["search","find","web","url","http","site","page","article","docs"] if k in q))

    async def step(self, state):
        if not state.steps:
            if self.council:
                try:
                    r = await self.council.process_question(state.task.query, use_verification=True, store_in_knowledge=True)
                    return AgentAction(action_type=ActionType.RESPOND, description="Research complete",
                                       content=r.get("answer",""))
                except Exception as e:
                    return AgentAction(action_type=ActionType.TOOL_CALL, description="Fallback to HTTP",
                                       tool_name="web_search", tool_input={"query": state.task.query})
            return AgentAction(action_type=ActionType.TOOL_CALL, description="Web search",
                               tool_name="web_search", tool_input={"query": state.task.query})
        return AgentAction(action_type=ActionType.RESPOND, description="Done",
                           content=state.observations[-1] if state.observations else "Research complete.")


class CodeExplorer(SubAgent):
    """Explores codebases — reads files, analyzes structure, finds patterns."""
    def __init__(self, **kw):
        super().__init__(name="code_explorer", group="explore",
                         description="Explore codebases: read files, analyze structure, find patterns",
                         capabilities=["filesystem", "git_ops"], **kw)

    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["code","file","read","explore","structure","codebase","repo","dir"] if k in q))

    async def step(self, state):
        if not state.steps:
            return AgentAction(action_type=ActionType.TOOL_CALL, description="Listing directory",
                               tool_name="filesystem", tool_input={"action":"list","path":state.task.context or "."})
        if len(state.steps) == 1 and state.tool_results:
            return AgentAction(action_type=ActionType.RESPOND, description="Structure mapped",
                               content=f"**Directory Structure:**\n```\n{state.tool_results[-1].stdout[:2000]}\n```")
        return AgentAction(action_type=ActionType.RESPOND, description="Done",
                           content=state.observations[-1] if state.observations else "Exploration complete.")


class DataMiner(SubAgent):
    """Mines data from APIs, databases, and structured sources."""
    def __init__(self, **kw):
        super().__init__(name="data_miner", group="explore",
                         description="Mine data from APIs, databases, and structured sources",
                         capabilities=["http_client", "db_query", "python_repl"], **kw)

    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["data","api","database","extract","mine","scrape","json","csv"] if k in q))

    async def step(self, state):
        if not state.steps:
            if self.council:
                try:
                    r = await self.council.process_question(
                        f"Write Python code to extract/analyze data for: {state.task.query}\nReturn ONLY code.",
                        use_verification=False, store_in_knowledge=False)
                    code = r.get("answer","")
                    return AgentAction(action_type=ActionType.TOOL_CALL, description="Running data extraction",
                                       tool_name="python_repl", tool_input={"code": code})
                except: pass
            return AgentAction(action_type=ActionType.RESPOND, description="No council", content="Need teacher models for data mining.")
        if state.tool_results and state.tool_results[-1].success:
            return AgentAction(action_type=ActionType.RESPOND, description="Data extracted",
                               content=f"**Data Results:**\n```\n{state.tool_results[-1].stdout[:2000]}\n```")
        return AgentAction(action_type=ActionType.RESPOND, description="Done",
                           content=state.observations[-1] if state.observations else "Mining complete.")


class ExploreAgent(LeadAgent):
    """Lead agent for exploration — routes to WebResearcher, CodeExplorer, or DataMiner."""
    def __init__(self, **kw):
        super().__init__(name="explore", group="explore",
                         description="Research, explore codebases, and mine data",
                         capabilities=["web_search","http_client","filesystem","git_ops","db_query"], **kw)
        self.register_subagent(WebResearcher())
        self.register_subagent(CodeExplorer())
        self.register_subagent(DataMiner())

    def can_handle(self, task):
        q = task.query.lower()
        kws = ["what","how","why","explain","search","find","explore","research","investigate","discover","analyze","read"]
        return min(1.0, sum(0.15 for k in kws if k in q))

    async def step(self, state):
        if not state.steps:
            best = self._best_subagent(state.task)
            if best:
                return AgentAction(action_type=ActionType.DELEGATE_SUB, description=f"Routing to {best}",
                                   delegate_to=best, delegate_task=state.task.query)
            return AgentAction(action_type=ActionType.PARALLEL, description="All subagents exploring",
                               subagent_tasks=[{"agent":n,"query":state.task.query} for n in self.subagents])
        if state.subagent_results:
            parts = [f"**{k}**: {v}" for k,v in state.subagent_results.items()]
            return AgentAction(action_type=ActionType.RESPOND, description="Exploration complete",
                               content="\n\n".join(parts))
        return AgentAction(action_type=ActionType.RESPOND, description="Done",
                           content=state.observations[-1] if state.observations else "Exploration complete.")
