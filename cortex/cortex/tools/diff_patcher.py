"""Diff/Patch Tool — Generate and apply diffs with rollback support."""

import shutil
from pathlib import Path
from .base import BaseTool
from .base_models import ToolCallResult


class DiffPatcher(BaseTool):
    """Generate diffs, apply patches, with rollback support."""

    name = "diff_patcher"
    description = "Generate unified diffs and apply patches to files with rollback"
    language = "diff"

    async def execute(self, input_data: dict) -> ToolCallResult:
        action = input_data.get("action", "diff")

        if action == "diff":
            return self._diff(input_data.get("original", ""), input_data.get("modified", ""),
                              input_data.get("filename", "file"))
        elif action == "apply":
            return await self._apply(input_data.get("path", ""), input_data.get("new_content", ""))
        elif action == "rollback":
            return self._rollback(input_data.get("path", ""))
        return ToolCallResult(tool_name=self.name, success=False, stderr=f"Unknown action: {action}", exit_code=1)

    def _diff(self, original: str, modified: str, filename: str) -> ToolCallResult:
        import difflib
        diff = difflib.unified_diff(
            original.splitlines(keepends=True), modified.splitlines(keepends=True),
            fromfile=f"a/{filename}", tofile=f"b/{filename}", lineterm=""
        )
        diff_text = "\n".join(diff)
        if not diff_text:
            return ToolCallResult(tool_name=self.name, success=True, stdout="No differences found")
        return ToolCallResult(tool_name=self.name, success=True, stdout=diff_text)

    async def _apply(self, path: str, new_content: str) -> ToolCallResult:
        p = Path(path)
        if not p.exists():
            return ToolCallResult(tool_name=self.name, success=False, stderr=f"File not found: {path}", exit_code=1)
        # Save backup for rollback
        backup = p.with_suffix(p.suffix + ".cortex_backup")
        shutil.copy2(p, backup)
        p.write_text(new_content, encoding="utf-8")
        return ToolCallResult(tool_name=self.name, success=True,
                              stdout=f"Patched {path} (backup at {backup})")

    def _rollback(self, path: str) -> ToolCallResult:
        p = Path(path)
        backup = p.with_suffix(p.suffix + ".cortex_backup")
        if not backup.exists():
            return ToolCallResult(tool_name=self.name, success=False, stderr="No backup found", exit_code=1)
        shutil.copy2(backup, p)
        backup.unlink()
        return ToolCallResult(tool_name=self.name, success=True, stdout=f"Rolled back {path}")
