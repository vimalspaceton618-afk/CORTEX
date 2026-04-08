"""Rust Runner Tool — Compile and execute Rust code."""

import tempfile
from pathlib import Path
from .base import BaseTool
from .base_models import ToolCallResult


class RustRunner(BaseTool):
    """Compile and run Rust code via rustc."""

    name = "rust_runner"
    description = "Compile and execute Rust code, return output"
    language = "rust"

    def __init__(self, config=None):
        super().__init__(config)
        self.rustc_path = self.config.get("rustc_path", "rustc")

    async def execute(self, input_data: dict) -> ToolCallResult:
        code = input_data.get("code", "")
        if not code.strip():
            return ToolCallResult(tool_name=self.name, success=False, stderr="No code provided", exit_code=1)

        tmp_dir = Path(tempfile.mkdtemp(prefix="cortex_rust_"))
        src = tmp_dir / "main.rs"
        binary = tmp_dir / "main.exe"

        try:
            src.write_text(code, encoding="utf-8")

            # Compile
            compile_result = self._run_subprocess(
                [self.rustc_path, str(src), "-o", str(binary)],
                timeout=self.timeout,
            )
            if not compile_result.success:
                compile_result.tool_name = self.name
                return compile_result

            # Run
            return self._run_subprocess([str(binary)], timeout=self.timeout)
        finally:
            for f in tmp_dir.glob("*"):
                f.unlink(missing_ok=True)
            tmp_dir.rmdir()
