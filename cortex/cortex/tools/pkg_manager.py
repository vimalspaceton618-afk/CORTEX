"""Package Manager Tool — Install packages across Python/Node/Rust."""

import sys
from .base import BaseTool
from .base_models import ToolCallResult


class PkgManager(BaseTool):
    """Install/uninstall packages via pip, npm, or cargo."""

    name = "pkg_manager"
    description = "Install/uninstall Python (pip), Node (npm), Rust (cargo) packages"
    language = "text"

    async def execute(self, input_data: dict) -> ToolCallResult:
        action = input_data.get("action", "install")
        package = input_data.get("package", "")
        manager = input_data.get("manager", "pip")

        if not package:
            return ToolCallResult(tool_name=self.name, success=False, stderr="No package specified", exit_code=1)

        if manager == "pip":
            if action == "install":
                cmd = [sys.executable, "-m", "pip", "install", package, "--quiet"]
            elif action == "uninstall":
                cmd = [sys.executable, "-m", "pip", "uninstall", package, "-y"]
            else:
                cmd = [sys.executable, "-m", "pip", "show", package]
        elif manager == "npm":
            cmd = ["npm", action, package]
        elif manager == "cargo":
            if action == "install":
                cmd = ["cargo", "install", package]
            else:
                cmd = ["cargo", "uninstall", package]
        else:
            return ToolCallResult(tool_name=self.name, success=False,
                                  stderr=f"Unknown manager: {manager}", exit_code=1)

        return self._run_subprocess(cmd, timeout=60)
