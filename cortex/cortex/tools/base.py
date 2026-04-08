"""CORTEX Tool System — Base Protocol & Registry.

All tools (Python REPL, Node.js, Rust, PowerShell, filesystem, web search)
implement BaseTool and register via ToolRegistry.
"""

import asyncio
import time
import subprocess
import tempfile
import os
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List, Type
from pathlib import Path

from pydantic import BaseModel, Field

from .base_models import ToolCallResult


class ToolInput(BaseModel):
    """Generic tool input."""
    code: str = ""
    command: str = ""
    path: str = ""
    args: Dict[str, Any] = Field(default_factory=dict)


class BaseTool(ABC):
    """Abstract base for all CORTEX tools."""

    name: str = "base_tool"
    description: str = "Base tool"
    language: str = "text"

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.timeout = self.config.get("code_timeout", 30)

    @abstractmethod
    async def execute(self, input_data: Dict[str, Any]) -> ToolCallResult:
        """Execute the tool. Override in subclasses."""
        raise NotImplementedError

    def _run_subprocess(
        self,
        cmd: List[str],
        input_text: str = "",
        timeout: int = None,
        cwd: str = None,
        env: Dict[str, str] = None,
    ) -> ToolCallResult:
        """Helper: run a subprocess and capture output."""
        start = time.time()
        timeout = timeout or self.timeout

        try:
            proc = subprocess.run(
                cmd,
                input=input_text,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=cwd,
                env={**os.environ, **(env or {})},
            )
            duration = (time.time() - start) * 1000

            return ToolCallResult(
                tool_name=self.name,
                success=proc.returncode == 0,
                stdout=proc.stdout or "",
                stderr=proc.stderr or "",
                exit_code=proc.returncode,
                duration_ms=duration,
            )
        except subprocess.TimeoutExpired:
            duration = (time.time() - start) * 1000
            return ToolCallResult(
                tool_name=self.name,
                success=False,
                stderr=f"Timed out after {timeout}s",
                exit_code=-1,
                duration_ms=duration,
            )
        except FileNotFoundError as e:
            return ToolCallResult(
                tool_name=self.name,
                success=False,
                stderr=f"Command not found: {e}",
                exit_code=-1,
            )
        except Exception as e:
            return ToolCallResult(
                tool_name=self.name,
                success=False,
                stderr=str(e),
                exit_code=-1,
            )


class ToolRegistry:
    """Registry of all available tools."""

    def __init__(self):
        self._tools: Dict[str, BaseTool] = {}

    def register(self, tool: BaseTool):
        """Register a tool."""
        self._tools[tool.name] = tool

    def get(self, name: str) -> Optional[BaseTool]:
        """Get tool by name."""
        return self._tools.get(name)

    def list_tools(self) -> List[str]:
        """List registered tool names."""
        return list(self._tools.keys())

    def get_descriptions(self) -> Dict[str, str]:
        """Get tool name → description mapping."""
        return {name: tool.description for name, tool in self._tools.items()}

    def __contains__(self, name: str) -> bool:
        return name in self._tools

    def __len__(self) -> int:
        return len(self._tools)
