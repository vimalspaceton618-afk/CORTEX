"""CORTEX Tools Package v3.0 — 13 tools registered."""

from .base import ToolRegistry
from .python_repl import PythonREPL
from .node_runner import NodeRunner
from .rust_runner import RustRunner
from .shell_exec import ShellExec
from .filesystem import FilesystemTool
from .web_search import WebSearchTool
from .http_client import HTTPClient
from .docker_exec import DockerExec
from .git_ops import GitOps
from .diff_patcher import DiffPatcher
from .bench_runner import BenchRunner
from .db_query import DBQuery
from .pkg_manager import PkgManager


def create_tool_registry(config=None, king=None) -> ToolRegistry:
    """Create and populate the tool registry with all 13 tools."""
    registry = ToolRegistry()
    c = config or {}
    registry.register(PythonREPL(c))
    registry.register(NodeRunner(c))
    registry.register(RustRunner(c))
    registry.register(ShellExec(c))
    registry.register(FilesystemTool(c))
    registry.register(WebSearchTool(c, king=king))
    registry.register(HTTPClient(c))
    registry.register(DockerExec(c))
    registry.register(GitOps(c))
    registry.register(DiffPatcher(c))
    registry.register(BenchRunner(c))
    registry.register(DBQuery(c))
    registry.register(PkgManager(c))
    return registry


__all__ = ["ToolRegistry", "create_tool_registry"]
