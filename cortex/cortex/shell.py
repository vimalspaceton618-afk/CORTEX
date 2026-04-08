"""CORTEX CLI Virtual Machine — Interactive Shell.

The 20x upgrade: a full interactive REPL with agent dispatch,
tool execution, memory integration, and Rich terminal UI.

Usage:
    python -m cortex.shell
    # or
    python cortex/cli.py shell
"""

import asyncio
import sys
import io
import os
import time
import uuid
from pathlib import Path
from typing import Optional, Dict, Any

# Fix Windows encoding
if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

from prompt_toolkit import PromptSession
from prompt_toolkit.history import FileHistory
from prompt_toolkit.auto_suggest import AutoSuggestFromHistory
from prompt_toolkit.completion import WordCompleter
from prompt_toolkit.formatted_text import HTML
from prompt_toolkit.styles import Style

from . import renderer
from .renderer import console


# ─── Shell Styles ────────────────────────────────────────────────────────────

PROMPT_STYLE = Style.from_dict({
    "prompt": "#00e5ff bold",
    "arrow": "#ff6ec7",
})

# All slash commands
COMMANDS = {
    "/ask":      "Ask CORTEX a question (routed via Triage agent)",
    "/code":     "Generate & execute code (routes to Coder agent)",
    "/research": "Deep research on a topic (routes to Researcher agent)",
    "/verify":   "Fact-check a claim (routes to Verifier agent)",
    "/plan":     "Create a step-by-step plan (routes to Planner agent)",
    "/architect":"Design system architecture (routes to Architect agent)",
    "/exec":     "Execute code directly: /exec python <code>",
    "/status":   "Show system status dashboard",
    "/memory":   "Show memory system stats",
    "/agents":   "List all available agents",
    "/tools":    "List all available tools",
    "/history":  "Show session history",
    "/config":   "Show current configuration",
    "/train":    "Start training loop",
    "/clear":    "Clear screen",
    "/help":     "Show this help menu",
    "/exit":     "Exit CORTEX shell",
}

COMMAND_COMPLETER = WordCompleter(
    list(COMMANDS.keys()) + ["python", "node", "rust", "powershell", "bash"],
    ignore_case=True,
)


# ─── Shell Session ───────────────────────────────────────────────────────────

class ShellSession:
    """Persistent session state."""

    def __init__(self):
        self.session_id = uuid.uuid4().hex[:8]
        self.start_time = time.time()
        self.command_count = 0
        self.history: list = []

    def elapsed(self) -> str:
        secs = time.time() - self.start_time
        mins = int(secs // 60)
        return f"{mins}m {int(secs % 60)}s"


# ─── CORTEX Shell ────────────────────────────────────────────────────────────

class CortexShell:
    """
    The CORTEX interactive CLI Virtual Machine.

    Launches a REPL that accepts:
    - Slash commands (/ask, /code, /exec, etc.)
    - Direct natural language (routed via Triage agent)
    - Code blocks (detected and executed)
    """

    def __init__(self, config_path: str = "config.yaml"):
        self.config_path = config_path
        self.session = ShellSession()
        self.initialized = False

        # Will be populated during init
        self.config = None
        self.council = None
        self.orchestrator = None
        self.tools = None
        self.memory = None

    async def initialize(self):
        """Initialize all subsystems."""
        with renderer.render_spinner("Initializing CORTEX systems..."):
            try:
                from .config import load_config
                self.config = load_config(self.config_path)

                # Initialize council
                from .models.council import create_council
                self.council = await create_council(self.config_path)
                renderer.render_success("Council of Critics initialized")

                # Initialize tools
                from .tools import create_tool_registry
                tool_config = {
                    "code_timeout": self.config.tools.code_timeout if hasattr(self.config, 'tools') else 30,
                    "allowed_paths": self.config.tools.allowed_paths if hasattr(self.config, 'tools') else ["."],
                }
                king = self.council.king if hasattr(self.council, 'king') else None
                self.tools = create_tool_registry(tool_config, king=king)
                renderer.render_success(f"Tool system initialized ({len(self.tools)} tools)")

                # Initialize memory
                try:
                    from .memory.manager import MemoryManager
                    self.memory = MemoryManager(
                        storage=self.council.storage,
                        kg=self.council.knowledge_graph,
                    )
                    renderer.render_success("Memory system initialized")
                except Exception as e:
                    renderer.render_warning(f"Memory unavailable: {e}")

                # Initialize agents
                from .agents import create_agent_orchestrator
                self.orchestrator = create_agent_orchestrator(
                    council=self.council,
                    memory_manager=self.memory,
                    tool_registry=self.tools,
                )
                renderer.render_success(
                    f"Agents initialized: {', '.join(self.orchestrator.list_agents())}"
                )

                self.initialized = True
            except Exception as e:
                renderer.render_error(f"Initialization failed: {e}")
                import traceback
                traceback.print_exc()

    async def run(self):
        """Main shell loop."""
        renderer.render_banner()
        await self.initialize()

        if not self.initialized:
            renderer.render_error("Cannot start shell — initialization failed")
            return

        renderer.render_divider()

        # Create prompt session with history
        history_path = Path.home() / ".cortex" / "history.txt"
        history_path.parent.mkdir(parents=True, exist_ok=True)

        session = PromptSession(
            history=FileHistory(str(history_path)),
            auto_suggest=AutoSuggestFromHistory(),
            completer=COMMAND_COMPLETER,
            style=PROMPT_STYLE,
        )

        while True:
            try:
                # Prompt
                user_input = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: session.prompt(
                        HTML("<prompt>cortex</prompt><arrow>❯ </arrow>"),
                    )
                )

                user_input = user_input.strip()
                if not user_input:
                    continue

                self.session.command_count += 1
                start = time.time()

                # Route command
                await self._handle_input(user_input)

                elapsed = (time.time() - start) * 1000
                if elapsed > 100:
                    renderer.render_system(f"Completed in {elapsed:.0f}ms")

            except KeyboardInterrupt:
                console.print("\n[dim]Use /exit to quit[/]")
                continue
            except EOFError:
                break

        renderer.render_system(
            f"Session {self.session.session_id} ended "
            f"({self.session.command_count} commands, {self.session.elapsed()})"
        )

    async def _handle_input(self, raw: str):
        """Route user input to the appropriate handler."""

        # Slash commands
        if raw.startswith("/"):
            parts = raw.split(maxsplit=1)
            cmd = parts[0].lower()
            arg = parts[1] if len(parts) > 1 else ""

            handlers = {
                "/ask": lambda a: self._cmd_agent("triage", a),
                "/code": lambda a: self._cmd_agent("coder", a),
                "/research": lambda a: self._cmd_agent("researcher", a),
                "/verify": lambda a: self._cmd_agent("verifier", a),
                "/plan": lambda a: self._cmd_agent("planner", a),
                "/architect": lambda a: self._cmd_agent("architect", a),
                "/exec": lambda a: self._cmd_exec(a),
                "/status": lambda a: self._cmd_status(),
                "/memory": lambda a: self._cmd_memory(),
                "/agents": lambda a: self._cmd_agents(),
                "/tools": lambda a: self._cmd_tools(),
                "/history": lambda a: self._cmd_history(),
                "/config": lambda a: self._cmd_config(),
                "/train": lambda a: self._cmd_train(a),
                "/clear": lambda a: self._cmd_clear(),
                "/help": lambda a: self._cmd_help(),
                "/exit": lambda a: self._cmd_exit(),
            }

            handler = handlers.get(cmd)
            if handler:
                await handler(arg)
            else:
                renderer.render_warning(f"Unknown command: {cmd}. Type /help for available commands.")
            return

        # Raw natural language → route through triage
        await self._cmd_agent("triage", raw)

    # ─── Command Handlers ────────────────────────────────────────────────

    async def _cmd_agent(self, agent_name: str, query: str):
        """Dispatch to a specific agent."""
        if not query:
            renderer.render_warning(f"Usage: /{agent_name} <your question>")
            return

        renderer.render_agent_thinking(agent_name, f"Processing: {query[:60]}...")

        result = await self.orchestrator.dispatch(query, agent_name=agent_name)

        renderer.render_agent_output(
            agent_name=result.agent_name,
            content=result.answer,
            confidence=result.confidence,
            steps_taken=result.steps_taken,
            tools_used=result.tools_used,
            duration_ms=result.duration_ms,
        )

        if result.confidence_factors:
            renderer.render_confidence(
                result.confidence, result.confidence_level, result.confidence_factors
            )

        # Track in session
        self.session.history.append({
            "query": query[:100],
            "agent": result.agent_name,
            "success": result.success,
        })

    async def _cmd_exec(self, raw: str):
        """Direct code/command execution."""
        if not raw:
            renderer.render_warning("Usage: /exec <language> <code>")
            renderer.render_system("Languages: python, node, rust, powershell, bash")
            return

        parts = raw.split(maxsplit=1)
        lang = parts[0].lower()
        code = parts[1] if len(parts) > 1 else ""

        lang_map = {
            "python": "python_repl", "py": "python_repl",
            "node": "node_runner", "js": "node_runner", "javascript": "node_runner",
            "rust": "rust_runner", "rs": "rust_runner",
            "powershell": "shell_exec", "ps": "shell_exec",
            "bash": "shell_exec", "sh": "shell_exec", "shell": "shell_exec",
        }

        tool_name = lang_map.get(lang)
        if not tool_name:
            renderer.render_error(f"Unknown language: {lang}")
            return

        if not code:
            renderer.render_warning(f"Usage: /exec {lang} <code>")
            return

        tool = self.tools.get(tool_name)
        if not tool:
            renderer.render_error(f"Tool '{tool_name}' not available")
            return

        renderer.render_system(f"Executing via {tool_name}...")
        input_key = "command" if tool_name == "shell_exec" else "code"
        result = await tool.execute({input_key: code})

        renderer.render_tool_result(
            tool_name=tool_name,
            stdout=result.stdout,
            stderr=result.stderr,
            exit_code=result.exit_code,
            language=lang,
            duration_ms=result.duration_ms,
        )

    async def _cmd_status(self):
        """Show system status dashboard."""
        try:
            kg_stats = self.council.knowledge_graph.get_stats() if self.council else {}
            teacher_names = list(self.council.teachers.keys()) if self.council else []
            agent_names = self.orchestrator.list_agents() if self.orchestrator else []
            memory_stats = await self.memory.stats() if self.memory else {}
            tool_names = self.tools.list_tools() if self.tools else []

            renderer.render_status_dashboard(
                kg_stats=kg_stats,
                teacher_names=teacher_names,
                agent_names=agent_names,
                memory_stats=memory_stats,
                tool_names=tool_names,
            )
        except Exception as e:
            renderer.render_error(f"Status failed: {e}")

    async def _cmd_memory(self):
        """Show memory stats."""
        if not self.memory:
            renderer.render_warning("Memory system not initialized")
            return
        stats = await self.memory.stats()
        renderer.render_memory_summary(stats)

    async def _cmd_agents(self):
        """List agents."""
        if not self.orchestrator:
            renderer.render_warning("Agent system not initialized")
            return
        descriptions = self.orchestrator.get_agent_descriptions()
        renderer.render_help(
            {f"{renderer.get_agent_icon(name)} {name}": desc
             for name, desc in descriptions.items()}
        )

    async def _cmd_tools(self):
        """List tools."""
        if not self.tools:
            renderer.render_warning("Tool system not initialized")
            return
        descriptions = self.tools.get_descriptions()
        renderer.render_help({f"🔧 {name}": desc for name, desc in descriptions.items()})

    async def _cmd_history(self):
        """Show session history."""
        if not self.session.history:
            renderer.render_system("No commands in this session yet")
            return

        from rich.table import Table
        table = Table(title="Session History", box=renderer.box.SIMPLE)
        table.add_column("#", style="dim", width=4)
        table.add_column("Query")
        table.add_column("Agent")
        table.add_column("Status", justify="center")

        for i, entry in enumerate(self.session.history, 1):
            status = "[green]✓[/]" if entry["success"] else "[red]✗[/]"
            table.add_row(str(i), entry["query"], entry["agent"], status)

        console.print(table)

    async def _cmd_config(self):
        """Show config summary."""
        if not self.config:
            renderer.render_warning("Config not loaded")
            return
        from rich.table import Table
        table = Table(title="Configuration", box=renderer.box.SIMPLE, show_header=False)
        table.add_column("Key", style="bold")
        table.add_column("Value")
        table.add_row("Storage", self.config.knowledge.storage_path)
        table.add_row("Embedding", self.config.knowledge.embedding_model)
        table.add_row("FAISS", str(self.config.knowledge.use_faiss))
        table.add_row("Teachers", str(len(self.config.teachers)))
        table.add_row("Similarity", str(self.config.knowledge.similarity_threshold))
        console.print(table)

    async def _cmd_train(self, arg: str):
        """Run training."""
        iterations = int(arg) if arg.isdigit() else 10
        renderer.render_system(f"Starting training ({iterations} iterations)...")
        from .training.trainer import CORTEXTrainer
        trainer = CORTEXTrainer(config_path=self.config_path, batch_size=5)
        await trainer.initialize()
        from .knowledge.generator import generate_training_questions
        questions = generate_training_questions(count=iterations, knowledge_graph=trainer.kg)
        await trainer.train_batch(questions)
        renderer.render_success(f"Training complete ({iterations} iterations)")

    async def _cmd_clear(self):
        os.system("cls" if sys.platform == "win32" else "clear")

    async def _cmd_help(self):
        renderer.render_help(COMMANDS)

    async def _cmd_exit(self):
        raise EOFError


# ─── Entry Point ─────────────────────────────────────────────────────────────

def main():
    """Launch the CORTEX shell."""
    import argparse
    parser = argparse.ArgumentParser(description="CORTEX CLI Virtual Machine")
    parser.add_argument("--config", default="config.yaml", help="Config path")
    args = parser.parse_args()

    shell = CortexShell(config_path=args.config)

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    asyncio.run(shell.run())


if __name__ == "__main__":
    main()
