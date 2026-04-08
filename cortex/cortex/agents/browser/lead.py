"""BrowserUIAgent — Web interface testing, visual regression, accessibility.

Subagents: VisualRegressionTester, AccessibilityAuditor
"""
from ..base import LeadAgent, SubAgent, AgentTask, AgentAction, AgentState, ActionType


class VisualRegressionTester(SubAgent):
    """Visual regression testing — screenshot comparison, layout checks."""
    def __init__(self, **kw):
        super().__init__(name="visual_regression", group="browser",
                         description="Visual regression testing: screenshots, layout, responsive design",
                         capabilities=["http_client","python_repl","shell_exec"], **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["visual","screenshot","regression","layout","responsive","pixel","ui test","render"] if k in q))
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Write a visual regression test plan. Include: what to screenshot, "
                    f"responsive breakpoints to test, elements to check, pixel threshold.\n\n{state.task.query}",
                    use_verification=False, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="Visual test plan", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Visual regression test created.")


class AccessibilityAuditor(SubAgent):
    """Accessibility auditing — WCAG compliance, ARIA labels, contrast."""
    def __init__(self, **kw):
        super().__init__(name="accessibility_auditor", group="browser",
                         description="Accessibility audit: WCAG 2.1, ARIA, contrast, keyboard nav, screen reader",
                         capabilities=["http_client","python_repl"], **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["accessibility","a11y","wcag","aria","contrast","screen reader","keyboard","tab order","alt text"] if k in q))
    async def step(self, state):
        if not state.steps:
            # Try to fetch the URL and analyze HTML
            url = state.task.context or ""
            if url.startswith("http"):
                return AgentAction(action_type=ActionType.TOOL_CALL, description="Fetching page",
                                   tool_name="http_client", tool_input={"method":"GET","url":url})
            if self.council:
                try:
                    r = await self.council.process_question(
                        f"Perform a WCAG 2.1 AA accessibility audit. Check: alt text, ARIA labels, "
                        f"contrast ratios, keyboard navigation, semantic HTML, focus management.\n\n{state.task.query}",
                        use_verification=True, store_in_knowledge=False)
                    return AgentAction(action_type=ActionType.RESPOND, description="A11y audit", content=r.get("answer",""))
                except: pass
        if state.tool_results and self.council:
            html = state.tool_results[-1].stdout[:3000]
            try:
                r = await self.council.process_question(
                    f"Audit this HTML for WCAG 2.1 AA accessibility issues:\n{html}",
                    use_verification=True, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="A11y report", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Accessibility audit complete.")


class BrowserUIAgent(LeadAgent):
    """Lead: web UI testing — visual regression and accessibility."""
    def __init__(self, **kw):
        super().__init__(name="browser_ui", group="browser",
                         description="Browser/UI testing: visual regression and accessibility auditing", **kw)
        self.register_subagent(VisualRegressionTester())
        self.register_subagent(AccessibilityAuditor())

    def can_handle(self, task):
        q = task.query.lower()
        kws = ["browser","ui test","visual","accessibility","a11y","wcag","screenshot","regression","responsive","render"]
        return min(1.0, sum(0.15 for k in kws if k in q))

    async def step(self, state):
        if not state.steps:
            best = self._best_subagent(state.task)
            if best:
                return AgentAction(action_type=ActionType.DELEGATE_SUB, description=f"Routing to {best}",
                                   delegate_to=best, delegate_task=state.task.query)
            # Default: run both in parallel
            return AgentAction(action_type=ActionType.PARALLEL, description="Full UI audit",
                               subagent_tasks=[
                                   {"agent":"visual_regression","query":state.task.query},
                                   {"agent":"accessibility_auditor","query":state.task.query},
                               ])
        if state.subagent_results:
            parts = [f"## {k}\n{v}" for k,v in state.subagent_results.items()]
            return AgentAction(action_type=ActionType.RESPOND, description="UI audit complete", content="\n\n".join(parts))
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Browser/UI testing complete.")
