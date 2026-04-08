"""Shell Executor Tool — PowerShell (Windows) / Bash (Linux/Mac)."""

import sys
from .base import BaseTool
from .base_models import ToolCallResult


class ShellExec(BaseTool):
    """Execute shell commands via PowerShell or Bash."""

    name = "shell_exec"
    description = "Execute shell commands (PowerShell on Windows, Bash on Unix)"
    language = "powershell" if sys.platform == "win32" else "bash"

    # Commands that are blocked for safety
    BLOCKED_PATTERNS = [
        "rm -rf /", "del /s /q C:\\", "format ", "fdisk",
        ":(){ :|:& };:", "mkfs", "dd if=",
    ]

    async def execute(self, input_data: dict) -> ToolCallResult:
        command = input_data.get("command", input_data.get("code", ""))
        if not command.strip():
            return ToolCallResult(tool_name=self.name, success=False, stderr="No command provided", exit_code=1)

        # Safety check
        for pattern in self.BLOCKED_PATTERNS:
            if pattern.lower() in command.lower():
                return ToolCallResult(
                    tool_name=self.name, success=False,
                    stderr=f"Blocked dangerous command pattern: {pattern}", exit_code=1,
                )

        if sys.platform == "win32":
            cmd = ["powershell", "-NoProfile", "-Command", command]
        else:
            cmd = ["bash", "-c", command]

        return self._run_subprocess(cmd, timeout=self.timeout)
