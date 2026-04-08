"""QualityLeadAgent — Lead agent for code review, testing, and debugging.

Subagents: CodeReviewer, Tester, Debugger
"""
from ..base import LeadAgent, SubAgent, AgentTask, AgentAction, AgentState, ActionType


class CodeReviewer(SubAgent):
    """Reviews code for quality, patterns, and security issues."""
    def __init__(self, **kw):
        super().__init__(name="reviewer", group="quality",
                         description="Code review: quality, patterns, security, OWASP, best practices",
                         capabilities=["filesystem","python_repl"], **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["review","quality","security","audit","vulnerability","owasp","hardcoded","injection","lint","smell"] if k in q))
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Do a thorough code review. Check: security (OWASP top 10), performance, "
                    f"readability, error handling, type safety. Rank issues by severity.\n\n{state.task.query}",
                    use_verification=True, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="Review complete", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Review complete.")


class Tester(SubAgent):
    """Generates unit tests, runs them, analyzes failure logs."""
    def __init__(self, **kw):
        super().__init__(name="tester", group="quality",
                         description="Generate unit tests, run them, and analyze failures",
                         capabilities=["python_repl","node_runner","filesystem"], **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["test","unittest","pytest","jest","coverage","assertion","mock","fixture","spec","tdd"] if k in q))
    async def step(self, state):
        if not state.steps:
            # Step 1: Generate tests
            if self.council:
                try:
                    r = await self.council.process_question(
                        f"Write comprehensive unit tests using pytest. Include edge cases, "
                        f"mocking, and assertions. Return ONLY the test code.\n\n{state.task.query}",
                        use_verification=False, store_in_knowledge=False)
                    code = r.get("answer","")
                    # Try to extract code block
                    if "```python" in code:
                        code = code.split("```python")[1].split("```")[0]
                    elif "```" in code:
                        code = code.split("```")[1].split("```")[0]
                    return AgentAction(action_type=ActionType.TOOL_CALL, description="Running tests",
                                       tool_name="python_repl", tool_input={"code": code})
                except: pass
        if len(state.steps) == 1 and state.tool_results:
            result = state.tool_results[-1]
            if result.success:
                return AgentAction(action_type=ActionType.RESPOND, description="Tests passed",
                                   content=f"✅ **All tests passed**\n```\n{result.stdout[:2000]}\n```")
            else:
                # Analyze failures
                return AgentAction(action_type=ActionType.RESPOND, description="Test failures",
                                   content=f"❌ **Test failures detected**\n```\n{result.stderr[:1000]}\n{result.stdout[:1000]}\n```")
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Testing complete.")


class Debugger(SubAgent):
    """Iterative write-run-debug loop — traces stack, fixes bugs, repeats."""
    def __init__(self, **kw):
        super().__init__(name="debugger", group="quality",
                         description="Analyze stack traces, fix bugs in iterative write-run-debug loops",
                         capabilities=["python_repl","filesystem","diff_patcher"], max_steps=20, **kw)
        self._debug_cycles = 0

    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["debug","error","bug","fix","traceback","stacktrace","crash","exception","fail","broken"] if k in q))

    async def step(self, state):
        if not state.steps:
            self._debug_cycles = 0
            if self.council:
                try:
                    r = await self.council.process_question(
                        f"Analyze this error/bug. Identify root cause and write a fix.\n"
                        f"Return the FIXED code only.\n\n{state.task.query}",
                        use_verification=False, store_in_knowledge=False)
                    code = r.get("answer","")
                    if "```python" in code:
                        code = code.split("```python")[1].split("```")[0]
                    elif "```" in code:
                        code = code.split("```")[1].split("```")[0]
                    return AgentAction(action_type=ActionType.TOOL_CALL, description=f"Testing fix (cycle {self._debug_cycles+1})",
                                       tool_name="python_repl", tool_input={"code": code})
                except Exception as e:
                    return AgentAction(action_type=ActionType.RESPOND, description="Error", content=str(e))

        # Check if last tool result succeeded
        if state.tool_results:
            last = state.tool_results[-1]
            if last.success:
                self._debug_cycles += 1
                return AgentAction(action_type=ActionType.RESPOND, description="Bug fixed!",
                                   content=f"🐛 **Fixed in {self._debug_cycles} cycle(s)**\n```\n{last.stdout[:2000]}\n```")
            elif self._debug_cycles < 5 and self.council:
                self._debug_cycles += 1
                try:
                    r = await self.council.process_question(
                        f"The fix failed with:\n{last.stderr[:500]}\n\nPrevious attempt observations:\n"
                        + "\n".join(state.observations[-3:])
                        + f"\n\nTry a different approach. Return ONLY fixed code.",
                        use_verification=False, store_in_knowledge=False)
                    code = r.get("answer","")
                    if "```python" in code:
                        code = code.split("```python")[1].split("```")[0]
                    elif "```" in code:
                        code = code.split("```")[1].split("```")[0]
                    return AgentAction(action_type=ActionType.TOOL_CALL, description=f"Retry fix (cycle {self._debug_cycles})",
                                       tool_name="python_repl", tool_input={"code": code})
                except: pass

        return AgentAction(action_type=ActionType.RESPOND, description="Debug exhausted",
                           content=f"🐛 Could not fix after {self._debug_cycles} cycles.\n"
                           + "\n".join(f"- {o}" for o in state.observations[-5:]))


class QualityLeadAgent(LeadAgent):
    """Lead: code review, testing, and debugging."""
    def __init__(self, **kw):
        super().__init__(name="quality", group="quality",
                         description="Code review, unit testing, and iterative debugging", **kw)
        self.register_subagent(CodeReviewer())
        self.register_subagent(Tester())
        self.register_subagent(Debugger())

    def can_handle(self, task):
        q = task.query.lower()
        kws = ["review","test","debug","quality","security","audit","fix","bug","error","lint","coverage"]
        return min(1.0, sum(0.15 for k in kws if k in q))

    async def step(self, state):
        if not state.steps:
            best = self._best_subagent(state.task)
            if best:
                return AgentAction(action_type=ActionType.DELEGATE_SUB, description=f"Routing to {best}",
                                   delegate_to=best, delegate_task=state.task.query)
        if state.subagent_results:
            return AgentAction(action_type=ActionType.RESPOND, description="Quality complete",
                               content=list(state.subagent_results.values())[0])
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Quality assessment complete.")
