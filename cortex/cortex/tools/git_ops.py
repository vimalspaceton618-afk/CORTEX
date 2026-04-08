"""Git Operations Tool — Rich git integration for agents."""

from .base import BaseTool
from .base_models import ToolCallResult


class GitOps(BaseTool):
    """Git operations: status, diff, log, commit, branch, blame, stash."""

    name = "git_ops"
    description = "Git operations (status, diff, log, commit, branch, blame)"
    language = "diff"

    SAFE_COMMANDS = {"status", "diff", "log", "branch", "blame", "stash", "show", "remote", "tag"}
    WRITE_COMMANDS = {"add", "commit", "stash"}
    BLOCKED_COMMANDS = {"push", "force-push", "reset --hard"}

    async def execute(self, input_data: dict) -> ToolCallResult:
        command = input_data.get("command", "status")
        args = input_data.get("args", [])
        cwd = input_data.get("cwd", ".")

        if isinstance(args, str):
            args = args.split()

        base_cmd = command.split()[0] if command else ""
        if base_cmd in self.BLOCKED_COMMANDS:
            return ToolCallResult(tool_name=self.name, success=False,
                                  stderr=f"Blocked: '{command}' requires --force flag", exit_code=1)

        cmd = ["git", command] + args
        if command == "log" and "--oneline" not in args and "-n" not in " ".join(args):
            cmd.extend(["-n", "20", "--oneline"])
        if command == "diff":
            cmd.append("--stat")

        return self._run_subprocess(cmd, cwd=cwd)
