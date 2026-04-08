"""Docker Executor Tool — Default sandbox for code execution."""

import sys
from .base import BaseTool
from .base_models import ToolCallResult

DOCKER_IMAGES = {
    "python": "python:3.12-slim",
    "node": "node:20-slim",
    "rust": "rust:1.77-slim",
}

class DockerExec(BaseTool):
    """Execute code inside isolated Docker containers. Falls back to local if Docker unavailable."""

    name = "docker_exec"
    description = "Run code in Docker containers (Python, Node.js, Rust) with full isolation"
    language = "text"

    def __init__(self, config=None):
        super().__init__(config)
        self._docker_available = None

    def _check_docker(self) -> bool:
        if self._docker_available is None:
            import subprocess
            try:
                subprocess.run(["docker", "version"], capture_output=True, timeout=5)
                self._docker_available = True
            except Exception:
                self._docker_available = False
        return self._docker_available

    async def execute(self, input_data: dict) -> ToolCallResult:
        code = input_data.get("code", "")
        language = input_data.get("language", "python")
        network = input_data.get("network", False)

        if not code.strip():
            return ToolCallResult(tool_name=self.name, success=False, stderr="No code provided", exit_code=1)

        image = DOCKER_IMAGES.get(language, DOCKER_IMAGES["python"])

        if not self._check_docker():
            # Fallback to local execution
            if language == "python":
                from .python_repl import PythonREPL
                return await PythonREPL(self.config).execute({"code": code})
            return ToolCallResult(tool_name=self.name, success=False,
                                  stderr="Docker not available and no local fallback for this language", exit_code=1)

        # Build docker command
        net_flag = "--network=none" if not network else ""
        if language == "python":
            cmd = ["docker", "run", "--rm", net_flag, "--memory=256m", "--cpus=1",
                   image, "python", "-c", code]
        elif language == "node":
            cmd = ["docker", "run", "--rm", net_flag, "--memory=256m", "--cpus=1",
                   image, "node", "-e", code]
        elif language == "rust":
            # For Rust we need a more complex setup
            cmd = ["docker", "run", "--rm", net_flag, "--memory=512m", "--cpus=2",
                   image, "bash", "-c", f'echo \'{code}\' > /tmp/main.rs && rustc /tmp/main.rs -o /tmp/main && /tmp/main']
        else:
            cmd = ["docker", "run", "--rm", net_flag, image, "sh", "-c", code]

        # Remove empty strings from cmd
        cmd = [c for c in cmd if c]
        return self._run_subprocess(cmd, timeout=self.timeout)
