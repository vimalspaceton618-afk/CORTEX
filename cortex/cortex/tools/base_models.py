"""Shared Pydantic models used across agents and tools."""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional


class ToolCallResult(BaseModel):
    """Result from a tool execution."""
    tool_name: str
    success: bool
    stdout: str = ""
    stderr: str = ""
    exit_code: int = 0
    artifacts: List[str] = Field(default_factory=list)
    duration_ms: float = 0
