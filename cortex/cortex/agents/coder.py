"""CoderAgent — Code generation, execution, and debugging.

Generates code in Python/JS/Rust/PowerShell, executes it,
reads output, and iterates until correct.
"""

import re
from .base import BaseAgent, AgentTask, AgentAction, AgentState, ActionType


# Map language keywords to tool names
LANG_TOOL_MAP = {
    "python": "python_repl",
    "py": "python_repl",
    "javascript": "node_runner",
    "js": "node_runner",
    "node": "node_runner",
    "typescript": "node_runner",
    "ts": "node_runner",
    "rust": "rust_runner",
    "rs": "rust_runner",
    "powershell": "shell_exec",
    "ps": "shell_exec",
    "bash": "shell_exec",
    "sh": "shell_exec",
    "shell": "shell_exec",
}


class CoderAgent(BaseAgent):
    """
    Code generation and execution agent.

    Pipeline:
    1. Analyze request → determine language
    2. Generate code via teachers
    3. Execute in sandbox
    4. If errors → debug and retry
    5. Return working code + output
    """

    def __init__(self, **kwargs):
        super().__init__(
            name="coder",
            description="Generate, execute, and debug code in Python, JS, Rust, PowerShell",
            capabilities=["python_repl", "node_runner", "rust_runner", "shell_exec", "code_generation"],
            **kwargs,
        )

    def can_handle(self, task: AgentTask) -> float:
        query = task.query.lower()
        keywords = ["write", "code", "implement", "function", "class", "script",
                     "program", "debug", "fix", "refactor", "run", "execute",
                     "python", "javascript", "rust", "powershell"]
        score = sum(0.2 for kw in keywords if kw in query)
        if "```" in task.query:
            score += 0.3
        return min(1.0, max(0.0, score))

    def _detect_language(self, query: str) -> str:
        """Detect target programming language from query."""
        query_lower = query.lower()
        for lang, tool in LANG_TOOL_MAP.items():
            if lang in query_lower:
                return tool
        return "python_repl"  # Default

    def _extract_code(self, text: str) -> str:
        """Extract code from markdown code blocks or raw text."""
        # Try to find fenced code block
        match = re.search(r"```(?:\w+)?\n(.*?)```", text, re.DOTALL)
        if match:
            return match.group(1).strip()
        # Fallback: treat entire text as code if it looks like code
        if any(kw in text for kw in ["def ", "function ", "fn ", "class ", "import ", "const "]):
            return text.strip()
        return text.strip()

    async def step(self, state: AgentState) -> AgentAction:
        step_num = len(state.steps)

        if step_num == 0:
            # Step 1: Generate code via council/teachers
            tool_name = self._detect_language(state.task.query)
            prompt = (
                f"Write code to accomplish this task. Return ONLY the code, "
                f"no explanations. Use print() for output.\n\n"
                f"Task: {state.task.query}"
            )

            if self.council:
                try:
                    result = await self.council.process_question(
                        prompt,
                        use_verification=False,
                        store_in_knowledge=False,
                    )
                    code = self._extract_code(result.get("answer", ""))
                    if code:
                        state.observations.append(f"target_tool:{tool_name}")
                        return AgentAction(
                            action_type=ActionType.TOOL_CALL,
                            description=f"Executing generated code via {tool_name}",
                            tool_name=tool_name,
                            tool_input={"code": code},
                            content=code,
                        )
                except Exception as e:
                    return AgentAction(
                        action_type=ActionType.THINK,
                        description=f"Code generation failed: {e}",
                        content=str(e),
                    )

            # No council — check if query itself contains code
            code = self._extract_code(state.task.query)
            if code:
                return AgentAction(
                    action_type=ActionType.TOOL_CALL,
                    description=f"Executing provided code via {tool_name}",
                    tool_name=tool_name,
                    tool_input={"code": code},
                    content=code,
                )

            return AgentAction(
                action_type=ActionType.RESPOND,
                description="Cannot generate code without teacher access",
                content="Code generation requires an active teacher model. Please configure one.",
            )

        elif step_num == 1:
            # Step 2: Check execution result
            if state.tool_results:
                last_result = state.tool_results[-1]
                if last_result.success:
                    # Success! Return code + output
                    code = state.steps[0].content if state.steps else ""
                    parts = []
                    if code:
                        parts.append(f"```\n{code}\n```")
                    parts.append(f"\n**Output:**\n```\n{last_result.stdout}\n```")
                    return AgentAction(
                        action_type=ActionType.RESPOND,
                        description="Code executed successfully",
                        content="\n".join(parts),
                    )
                else:
                    # Failed — attempt debug
                    return AgentAction(
                        action_type=ActionType.THINK,
                        description=f"Execution failed: {last_result.stderr[:200]}",
                        content=f"Error: {last_result.stderr}",
                    )

            return AgentAction(
                action_type=ActionType.RESPOND,
                description="No execution result",
                content="Code was generated but execution returned no result.",
            )

        elif step_num == 2:
            # Step 3: Debug attempt — ask teacher to fix
            if self.council and state.tool_results:
                last_error = state.tool_results[-1].stderr
                original_code = state.steps[0].content if state.steps else ""
                debug_prompt = (
                    f"This code has an error. Fix it. Return ONLY the corrected code.\n\n"
                    f"Code:\n```\n{original_code}\n```\n\n"
                    f"Error:\n```\n{last_error}\n```"
                )
                try:
                    result = await self.council.process_question(
                        debug_prompt, use_verification=False, store_in_knowledge=False,
                    )
                    fixed_code = self._extract_code(result.get("answer", ""))
                    tool_obs = [o for o in state.observations if o.startswith("target_tool:")]
                    tool_name = tool_obs[0].split(":")[1] if tool_obs else "python_repl"

                    if fixed_code:
                        return AgentAction(
                            action_type=ActionType.TOOL_CALL,
                            description="Executing debugged code",
                            tool_name=tool_name,
                            tool_input={"code": fixed_code},
                            content=fixed_code,
                        )
                except Exception:
                    pass

            return AgentAction(
                action_type=ActionType.RESPOND,
                description="Debug failed",
                content="Could not automatically fix the code error.",
            )

        else:
            # Final: return whatever we have
            if state.tool_results:
                last = state.tool_results[-1]
                if last.success:
                    return AgentAction(
                        action_type=ActionType.RESPOND,
                        description="Code fixed and executed",
                        content=f"```\n{state.steps[-1].content}\n```\n\n**Output:**\n```\n{last.stdout}\n```",
                    )

            return AgentAction(
                action_type=ActionType.RESPOND,
                description="Exhausted retry budget",
                content="Unable to generate working code after multiple attempts.",
            )
