"""Python REPL Tool — Sandboxed Python code execution."""

import sys
import tempfile
from pathlib import Path
from .base import BaseTool
from .base_models import ToolCallResult


class PythonREPL(BaseTool):
    """Execute Python code in a sandboxed subprocess."""

    name = "python_repl"
    description = "Execute Python code and return stdout/stderr"
    language = "python"

    async def execute(self, input_data: dict) -> ToolCallResult:
        code = input_data.get("code", "")
        if not code.strip():
            return ToolCallResult(tool_name=self.name, success=False, stderr="No code provided", exit_code=1)

        # Write to temp file and execute
        tmp = Path(tempfile.mktemp(suffix=".py"))
        try:
            tmp.write_text(code, encoding="utf-8")
            result = self._run_subprocess(
                [sys.executable, "-u", str(tmp)],
                timeout=self.timeout,
            )
            return result
        finally:
            tmp.unlink(missing_ok=True)
