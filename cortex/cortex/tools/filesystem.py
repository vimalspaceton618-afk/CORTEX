"""Filesystem Tool — Safe file I/O operations."""

import os
import glob
from pathlib import Path
from .base import BaseTool
from .base_models import ToolCallResult


class FilesystemTool(BaseTool):
    """Read, write, list, and search files within allowed paths."""

    name = "filesystem"
    description = "Read/write/list/search files on disk"
    language = "text"

    def __init__(self, config=None):
        super().__init__(config)
        self.allowed_paths = [Path(p).resolve() for p in self.config.get("allowed_paths", ["."])]

    def _is_allowed(self, path: str) -> bool:
        """Check if path is within allowed directories."""
        resolved = Path(path).resolve()
        return any(str(resolved).startswith(str(ap)) for ap in self.allowed_paths)

    async def execute(self, input_data: dict) -> ToolCallResult:
        action = input_data.get("action", "read")
        path = input_data.get("path", "")

        if action == "read":
            return await self._read(path)
        elif action == "write":
            return await self._write(path, input_data.get("content", ""))
        elif action == "list":
            return await self._list_dir(path)
        elif action == "search":
            return await self._search(path, input_data.get("pattern", "*"))
        else:
            return ToolCallResult(tool_name=self.name, success=False, stderr=f"Unknown action: {action}", exit_code=1)

    async def _read(self, path: str) -> ToolCallResult:
        if not self._is_allowed(path):
            return ToolCallResult(tool_name=self.name, success=False, stderr=f"Path not allowed: {path}", exit_code=1)
        try:
            content = Path(path).read_text(encoding="utf-8", errors="replace")
            return ToolCallResult(tool_name=self.name, success=True, stdout=content)
        except Exception as e:
            return ToolCallResult(tool_name=self.name, success=False, stderr=str(e), exit_code=1)

    async def _write(self, path: str, content: str) -> ToolCallResult:
        if not self._is_allowed(path):
            return ToolCallResult(tool_name=self.name, success=False, stderr=f"Path not allowed: {path}", exit_code=1)
        try:
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            Path(path).write_text(content, encoding="utf-8")
            return ToolCallResult(tool_name=self.name, success=True, stdout=f"Written {len(content)} bytes to {path}")
        except Exception as e:
            return ToolCallResult(tool_name=self.name, success=False, stderr=str(e), exit_code=1)

    async def _list_dir(self, path: str) -> ToolCallResult:
        if not self._is_allowed(path):
            return ToolCallResult(tool_name=self.name, success=False, stderr=f"Path not allowed: {path}", exit_code=1)
        try:
            entries = sorted(Path(path).iterdir())
            lines = [f"{'[DIR] ' if e.is_dir() else '      '}{e.name}" for e in entries]
            return ToolCallResult(tool_name=self.name, success=True, stdout="\n".join(lines))
        except Exception as e:
            return ToolCallResult(tool_name=self.name, success=False, stderr=str(e), exit_code=1)

    async def _search(self, path: str, pattern: str) -> ToolCallResult:
        if not self._is_allowed(path):
            return ToolCallResult(tool_name=self.name, success=False, stderr=f"Path not allowed: {path}", exit_code=1)
        try:
            matches = list(Path(path).rglob(pattern))[:100]
            return ToolCallResult(tool_name=self.name, success=True, stdout="\n".join(str(m) for m in matches))
        except Exception as e:
            return ToolCallResult(tool_name=self.name, success=False, stderr=str(e), exit_code=1)
