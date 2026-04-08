"""CORTEX CLI Virtual Machine v3.0 — Interactive Shell.

GODMODE: 9 Lead Agents, 25+ SubAgents, 13 Tools, Smart Routing, Live Dashboard.
"""

import asyncio, sys, io, os, time, uuid
from pathlib import Path
from typing import Optional, Dict, Any

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

PROMPT_STYLE = Style.from_dict({"prompt": "#00e5ff bold", "arrow": "#ff6ec7"})

COMMANDS = {
    "/ask":       "Ask CORTEX (smart-routed to best agent group)",
    "/explore":   "Research & explore (→ Explore Agent)",
    "/plan":      "Create plans & roadmaps (→ Plan Agent)",
    "/help":      "Tutorials, examples, error help (→ Help Agent)",
    "/dev":       "Write code (→ Developer specialists)",
    "/frontend":  "Frontend dev (React/Vue/HTML/CSS)",
    "/backend":   "Backend dev (Python/Node servers)",
    "/api":       "Design APIs (REST/GraphQL/OpenAPI)",
    "/db":        "Database tasks (schema/queries/migrations)",
    "/rust":      "Write Rust code (→ Rust Engineer)",
    "/ts":        "Write TypeScript (→ TypeScript Pro)",
    "/review":    "Code review & security audit (→ Quality)",
    "/test":      "Generate & run tests (→ Tester)",
    "/debug":     "Debug errors iteratively (→ Debugger)",
    "/devops":    "CI/CD, Cloud, K8s (→ DevOps)",
    "/spec":      "Requirements & specs (→ PM/Spec Agent)",
    "/docs":      "Generate documentation (→ Docs Agent)",
    "/browser":   "UI/accessibility testing (→ Browser Agent)",
    "/exec":      "Execute code: /exec python <code>",
    "/http":      "HTTP request: /http GET <url>",
    "/git":       "Git operations: /git status",
    "/bench":     "Benchmark code: /bench <code>",
    "/sql":       "SQL query: /sql <db_path> <query>",
    "/install":   "Install package: /install pip <package>",
    "/dashboard": "Toggle live system dashboard",
    "/agents":    "Show full agent tree",
    "/tools":     "List all tools",
    "/status":    "System status",
    "/history":   "Session history",
    "/train":     "Run training iterations",
    "/clear":     "Clear screen",
    "/exit":      "Exit CORTEX shell",
}

ALL_COMPLETIONS = list(COMMANDS.keys()) + [
    "python","node","rust","powershell","bash","GET","POST","PUT","DELETE",
    "pip","npm","cargo","status","diff","log","commit","branch",
]
COMMAND_COMPLETER = WordCompleter(ALL_COMPLETIONS, ignore_case=True)


class ShellSession:
    def __init__(self):
        self.session_id = uuid.uuid4().hex[:8]
        self.start_time = time.time()
        self.command_count = 0
        self.history: list = []
        self.last_confidence = 0.0
        self.show_dashboard = False

    def elapsed(self) -> str:
        s = time.time() - self.start_time
        return f"{int(s//60)}m {int(s%60)}s"


class CortexShell:
    """The CORTEX CLI VM — 9 agent groups, 13 tools, smart routing."""

    def __init__(self, config_path: str = "config.yaml"):
        self.config_path = config_path
        self.session = ShellSession()
        self.initialized = False
        self.config = self.council = self.orchestrator = self.tools = self.memory = None

    async def initialize(self):
        with renderer.render_spinner("Initializing CORTEX v3.0..."):
            try:
                from .config import load_config
                self.config = load_config(self.config_path)
                from .models.council import create_council
                self.council = await create_council(self.config_path)
                renderer.render_success("Council of Critics initialized")

                from .tools import create_tool_registry
                cfg = {"code_timeout": 30, "allowed_paths": ["."]}
                king = self.council.king if hasattr(self.council, 'king') else None
                self.tools = create_tool_registry(cfg, king=king)
                renderer.render_success(f"Tool system: {len(self.tools)} tools")

                try:
                    from .memory.manager import MemoryManager
                    self.memory = MemoryManager(storage=self.council.storage, kg=self.council.knowledge_graph)
                    renderer.render_success("Memory system initialized")
                except Exception as e:
                    renderer.render_warning(f"Memory: {e}")

                from .agents import create_agent_orchestrator
                self.orchestrator = create_agent_orchestrator(
                    council=self.council, memory_manager=self.memory, tool_registry=self.tools)
                counts = self.orchestrator.agent_count()
                tree = self.orchestrator.list_all_agents()
                renderer.render_success(
                    f"Agents: {counts['leads']} leads + {counts['subagents']} subs = {counts['total']} total")
                for lead, subs in tree.items():
                    renderer.render_system(f"  {lead}: {', '.join(subs) if subs else '(solo)'}")

                self.initialized = True
            except Exception as e:
                renderer.render_error(f"Init failed: {e}")
                import traceback; traceback.print_exc()

    async def run(self):
        renderer.render_banner()
        await self.initialize()
        if not self.initialized:
            renderer.render_error("Cannot start — init failed")
            return
        renderer.render_divider()
        hp = Path.home() / ".cortex" / "history.txt"
        hp.parent.mkdir(parents=True, exist_ok=True)
        session = PromptSession(history=FileHistory(str(hp)), auto_suggest=AutoSuggestFromHistory(),
                                completer=COMMAND_COMPLETER, style=PROMPT_STYLE)
        while True:
            try:
                if self.session.show_dashboard:
                    self._render_dashboard()
                inp = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: session.prompt(HTML("<prompt>cortex</prompt><arrow>❯ </arrow>")))
                inp = inp.strip()
                if not inp: continue
                self.session.command_count += 1
                start = time.time()
                await self._handle(inp)
                elapsed = (time.time() - start) * 1000
                if elapsed > 100:
                    renderer.render_system(f"Completed in {elapsed:.0f}ms")
            except KeyboardInterrupt:
                console.print("\n[dim]Use /exit to quit[/]"); continue
            except EOFError: break
        renderer.render_system(f"Session {self.session.session_id} ended ({self.session.command_count} cmds, {self.session.elapsed()})")

    async def _handle(self, raw: str):
        if raw.startswith("/"):
            parts = raw.split(maxsplit=1)
            cmd, arg = parts[0].lower(), parts[1] if len(parts) > 1 else ""
            # Direct agent routing commands
            agent_routes = {
                "/ask": None, "/explore": "explore", "/plan": "plan", "/help": "help",
                "/dev": "developers", "/frontend": "developers", "/backend": "developers",
                "/api": "developers", "/db": "developers", "/rust": "developers",
                "/ts": "developers", "/review": "quality", "/test": "quality",
                "/debug": "quality", "/devops": "devops", "/spec": "pm_spec",
                "/docs": "docs", "/browser": "browser_ui",
            }
            if cmd in agent_routes:
                await self._cmd_agent(agent_routes[cmd], arg, hint=cmd); return
            # Tool commands
            tool_cmds = {
                "/exec": self._cmd_exec, "/http": self._cmd_http, "/git": self._cmd_git,
                "/bench": self._cmd_bench, "/sql": self._cmd_sql, "/install": self._cmd_install,
            }
            if cmd in tool_cmds:
                await tool_cmds[cmd](arg); return
            # System commands
            sys_cmds = {
                "/dashboard": self._cmd_dashboard, "/agents": self._cmd_agents, "/tools": self._cmd_tools,
                "/status": self._cmd_status, "/history": self._cmd_history, "/train": self._cmd_train,
                "/clear": self._cmd_clear, "/exit": self._cmd_exit,
            }
            if cmd in sys_cmds:
                await sys_cmds[cmd](arg) if cmd in {"/train"} else await sys_cmds[cmd](); return
            renderer.render_warning(f"Unknown: {cmd}. Type /help for commands.")
            return
        await self._cmd_agent(None, raw)

    async def _cmd_agent(self, group, query, hint=None):
        if not query:
            renderer.render_warning(f"Usage: {hint or '/ask'} <your question>"); return
        renderer.render_agent_thinking(group or "router", f"Processing: {query[:60]}...")
        result = await self.orchestrator.dispatch(query, agent_name=group)
        renderer.render_agent_output(agent_name=result.agent_name, content=result.answer,
                                      confidence=result.confidence, steps_taken=result.steps_taken,
                                      tools_used=result.tools_used, duration_ms=result.duration_ms)
        self.session.last_confidence = result.confidence
        self.session.history.append({"query": query[:100], "agent": result.agent_name,
                                      "group": result.agent_group, "success": result.success,
                                      "subs": result.subagents_used})

    async def _cmd_exec(self, raw):
        if not raw:
            renderer.render_warning("Usage: /exec <lang> <code>"); return
        parts = raw.split(maxsplit=1)
        lang, code = parts[0].lower(), parts[1] if len(parts) > 1 else ""
        lang_map = {"python":"python_repl","py":"python_repl","node":"node_runner","js":"node_runner",
                     "rust":"rust_runner","rs":"rust_runner","powershell":"shell_exec","ps":"shell_exec",
                     "bash":"shell_exec","sh":"shell_exec","docker":"docker_exec"}
        tool_name = lang_map.get(lang)
        if not tool_name or not code:
            renderer.render_error(f"Usage: /exec python <code>"); return
        tool = self.tools.get(tool_name)
        if not tool: renderer.render_error(f"Tool not found: {tool_name}"); return
        key = "command" if tool_name == "shell_exec" else "code"
        inp = {key: code}
        if tool_name == "docker_exec": inp = {"code": code, "language": lang}
        result = await tool.execute(inp)
        renderer.render_tool_result(tool_name=tool_name, stdout=result.stdout, stderr=result.stderr,
                                     exit_code=result.exit_code, language=lang, duration_ms=result.duration_ms)

    async def _cmd_http(self, raw):
        if not raw:
            renderer.render_warning("Usage: /http GET <url>"); return
        parts = raw.split(maxsplit=1)
        method, url = parts[0].upper(), parts[1] if len(parts) > 1 else ""
        if not url: renderer.render_error("No URL provided"); return
        tool = self.tools.get("http_client")
        result = await tool.execute({"method": method, "url": url})
        renderer.render_tool_result(tool_name="http_client", stdout=result.stdout, stderr=result.stderr,
                                     exit_code=result.exit_code, language="json", duration_ms=result.duration_ms)

    async def _cmd_git(self, raw):
        parts = raw.split() if raw else ["status"]
        tool = self.tools.get("git_ops")
        result = await tool.execute({"command": parts[0], "args": parts[1:]})
        renderer.render_tool_result(tool_name="git_ops", stdout=result.stdout, stderr=result.stderr,
                                     exit_code=result.exit_code, language="diff", duration_ms=result.duration_ms)

    async def _cmd_bench(self, raw):
        if not raw: renderer.render_warning("Usage: /bench <python code>"); return
        tool = self.tools.get("bench_runner")
        result = await tool.execute({"code": raw, "runs": 10})
        renderer.render_tool_result(tool_name="bench_runner", stdout=result.stdout, stderr=result.stderr,
                                     exit_code=result.exit_code, language="text", duration_ms=result.duration_ms)

    async def _cmd_sql(self, raw):
        if not raw: renderer.render_warning("Usage: /sql <db_path> <query>"); return
        parts = raw.split(maxsplit=1)
        db, query = parts[0], parts[1] if len(parts) > 1 else ""
        tool = self.tools.get("db_query")
        result = await tool.execute({"db_path": db, "query": query})
        renderer.render_tool_result(tool_name="db_query", stdout=result.stdout, stderr=result.stderr,
                                     exit_code=result.exit_code, language="sql", duration_ms=result.duration_ms)

    async def _cmd_install(self, raw):
        if not raw: renderer.render_warning("Usage: /install pip <package>"); return
        parts = raw.split(maxsplit=1)
        mgr, pkg = parts[0].lower(), parts[1] if len(parts) > 1 else ""
        tool = self.tools.get("pkg_manager")
        result = await tool.execute({"action":"install","manager":mgr,"package":pkg})
        renderer.render_tool_result(tool_name="pkg_manager", stdout=result.stdout, stderr=result.stderr,
                                     exit_code=result.exit_code, language="text", duration_ms=result.duration_ms)

    async def _cmd_dashboard(self):
        self.session.show_dashboard = not self.session.show_dashboard
        renderer.render_system(f"Dashboard {'ON' if self.session.show_dashboard else 'OFF'}")
        if self.session.show_dashboard:
            self._render_dashboard()

    def _render_dashboard(self):
        try:
            from .core.dashboard import build_dashboard
            tree = self.orchestrator.list_all_agents() if self.orchestrator else {}
            counts = self.orchestrator.agent_count() if self.orchestrator else {}
            tool_names = self.tools.list_tools() if self.tools else []
            kg_stats = self.council.knowledge_graph.get_stats() if self.council else {}
            teacher_names = list(self.council.teachers.keys()) if self.council else []
            panel = build_dashboard(
                session_id=self.session.session_id, uptime=self.session.elapsed(),
                cmd_count=self.session.command_count, agent_tree=tree, agent_counts=counts,
                tool_names=tool_names, kg_stats=kg_stats, teacher_names=teacher_names,
                last_confidence=self.session.last_confidence,
            )
            console.print(panel)
        except Exception as e:
            renderer.render_error(f"Dashboard error: {e}")

    async def _cmd_agents(self):
        if not self.orchestrator: renderer.render_warning("Not initialized"); return
        from rich.tree import Tree
        tree = Tree("[bold bright_cyan]⫸ CORTEX Agent Tree[/]")
        icons = {"explore":"🔍","plan":"📋","help":"💡","developers":"👨‍💻","quality":"🔒",
                 "devops":"🚀","pm_spec":"📝","docs":"📖","browser_ui":"🌐"}
        descs = self.orchestrator.get_full_descriptions()
        for lead_name, info in descs.items():
            icon = icons.get(lead_name, "⚙️")
            branch = tree.add(f"{icon} [bold]{lead_name}[/] — {info['description']}")
            for sub_name, sub_desc in info.get("subagents",{}).items():
                branch.add(f"  ├─ [dim]{sub_name}[/] — {sub_desc}")
        counts = self.orchestrator.agent_count()
        tree.add(f"[bold green]Total: {counts['leads']} leads + {counts['subagents']} subagents = {counts['total']} agents[/]")
        console.print(tree)

    async def _cmd_tools(self):
        if not self.tools: renderer.render_warning("Not initialized"); return
        descs = self.tools.get_descriptions()
        renderer.render_help({f"🔧 {n}": d for n, d in descs.items()})

    async def _cmd_status(self):
        try:
            kg = self.council.knowledge_graph.get_stats() if self.council else {}
            teachers = list(self.council.teachers.keys()) if self.council else []
            agents = self.orchestrator.list_agents() if self.orchestrator else []
            mem = await self.memory.stats() if self.memory else {}
            tools = self.tools.list_tools() if self.tools else []
            renderer.render_status_dashboard(kg_stats=kg, teacher_names=teachers, agent_names=agents,
                                              memory_stats=mem, tool_names=tools)
        except Exception as e:
            renderer.render_error(f"Status error: {e}")

    async def _cmd_history(self):
        if not self.session.history:
            renderer.render_system("No commands yet"); return
        from rich.table import Table
        t = Table(title="Session History", box=renderer.box.SIMPLE)
        t.add_column("#", style="dim", width=4)
        t.add_column("Query"); t.add_column("Agent"); t.add_column("Group", style="dim")
        t.add_column("Subs", style="dim"); t.add_column("✓", justify="center")
        for i, e in enumerate(self.session.history, 1):
            st = "[green]✓[/]" if e["success"] else "[red]✗[/]"
            t.add_row(str(i), e["query"], e["agent"], e.get("group",""), ", ".join(e.get("subs",[])), st)
        console.print(t)

    async def _cmd_train(self, arg=""):
        n = int(arg) if arg.isdigit() else 10
        renderer.render_system(f"Training ({n} iterations)...")
        from .training.trainer import CORTEXTrainer
        trainer = CORTEXTrainer(config_path=self.config_path, batch_size=5)
        await trainer.initialize()
        from .knowledge.generator import generate_training_questions
        qs = generate_training_questions(count=n, knowledge_graph=trainer.kg)
        await trainer.train_batch(qs)
        renderer.render_success(f"Training complete ({n} iters)")

    async def _cmd_clear(self):
        os.system("cls" if sys.platform == "win32" else "clear")

    async def _cmd_exit(self):
        raise EOFError


def main():
    import argparse
    p = argparse.ArgumentParser(description="CORTEX CLI Virtual Machine v3.0")
    p.add_argument("--config", default="config.yaml")
    a = p.parse_args()
    shell = CortexShell(config_path=a.config)
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(shell.run())

if __name__ == "__main__":
    main()
