"""Node.js Runner Tool — Execute JavaScript/TypeScript code."""

import tempfile
from pathlib import Path
from .base import BaseTool
from .base_models import ToolCallResult


class NodeRunner(BaseTool):
    """Execute JavaScript code via Node.js."""

    name = "node_runner"
    description = "Execute JavaScript/Node.js code and return output"
    language = "javascript"

    def __init__(self, config=None):
        super().__init__(config)
        self.node_path = self.config.get("node_path", "node")

    async def execute(self, input_data: dict) -> ToolCallResult:
        code = input_data.get("code", "")
        if not code.strip():
            return ToolCallResult(tool_name=self.name, success=False, stderr="No code provided", exit_code=1)

        tmp = Path(tempfile.mktemp(suffix=".js"))
        try:
            tmp.write_text(code, encoding="utf-8")
            return self._run_subprocess([self.node_path, str(tmp)], timeout=self.timeout)
        finally:
            tmp.unlink(missing_ok=True)
