"""CORTEX Tools Package — Tool registry factory."""

from .base import ToolRegistry
from .python_repl import PythonREPL
from .node_runner import NodeRunner
from .rust_runner import RustRunner
from .shell_exec import ShellExec
from .filesystem import FilesystemTool
from .web_search import WebSearchTool


def create_tool_registry(config=None, king=None) -> ToolRegistry:
    """Create and populate the tool registry with all available tools."""
    registry = ToolRegistry()
    tool_config = config or {}

    registry.register(PythonREPL(tool_config))
    registry.register(NodeRunner(tool_config))
    registry.register(RustRunner(tool_config))
    registry.register(ShellExec(tool_config))
    registry.register(FilesystemTool(tool_config))
    registry.register(WebSearchTool(tool_config, king=king))

    return registry


__all__ = [
    "ToolRegistry", "create_tool_registry",
    "PythonREPL", "NodeRunner", "RustRunner",
    "ShellExec", "FilesystemTool", "WebSearchTool",
]
