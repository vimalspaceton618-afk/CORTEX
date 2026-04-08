"""CORTEX CLI VM — Rich Terminal Renderer.

All terminal output flows through this module for consistent,
beautiful rendering. Powers the 20x CLI experience.
"""

import time
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.markdown import Markdown
from rich.syntax import Syntax
from rich.tree import Tree
from rich.text import Text
from rich.live import Live
from rich.spinner import Spinner
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeElapsedColumn
from rich.columns import Columns
from rich.rule import Rule
from rich.align import Align
from rich import box

# Global console — all output goes through here
console = Console()

# ─── Color Theme (Cyberpunk Dark) ───────────────────────────────────────────

THEME = {
    "agent_triage":    "#ff6ec7",   # Hot pink
    "agent_researcher":"#00d4ff",   # Cyan
    "agent_coder":     "#39ff14",   # Neon green
    "agent_verifier":  "#ffaa00",   # Amber
    "agent_planner":   "#b388ff",   # Lavender
    "agent_architect": "#ff5252",   # Red accent
    "tool":            "#78909c",   # Blue grey
    "confidence_high": "#00e676",   # Green
    "confidence_mid":  "#ffc107",   # Yellow
    "confidence_low":  "#ff5252",   # Red
    "system":          "#607d8b",   # Steel
    "king":            "#ffd700",   # Gold
    "memory":          "#ce93d8",   # Purple
    "prompt":          "#00e5ff",   # Bright cyan
    "border":          "#37474f",   # Dark grey
}

AGENT_ICONS = {
    "triage":     "⚡",
    "researcher": "🔬",
    "coder":      "💻",
    "verifier":   "🛡️",
    "planner":    "📋",
    "architect":  "🏗️",
    "king":       "👑",
    "system":     "⚙️",
    "memory":     "🧠",
    "tool":       "🔧",
}


def get_agent_color(agent_name: str) -> str:
    """Get theme color for an agent."""
    key = f"agent_{agent_name.lower()}"
    return THEME.get(key, THEME["system"])


def get_agent_icon(agent_name: str) -> str:
    """Get icon for an agent."""
    return AGENT_ICONS.get(agent_name.lower(), "●")


# ─── Banner ─────────────────────────────────────────────────────────────────

def render_banner():
    """Render the CORTEX startup banner."""
    banner_text = r"""
   ██████╗ ██████╗ ██████╗ ████████╗███████╗██╗  ██╗
  ██╔════╝██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝╚██╗██╔╝
  ██║     ██║   ██║██████╔╝   ██║   █████╗   ╚███╔╝
  ██║     ██║   ██║██╔══██╗   ██║   ██╔══╝   ██╔██╗
  ╚██████╗╚██████╔╝██║  ██║   ██║   ███████╗██╔╝ ██╗
   ╚═════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
    """
    console.print(Text(banner_text, style="bold cyan"))
    console.print(
        Align.center(
            Text("CLI Virtual Machine v2.0 — Autonomous Agent OS", style="dim white")
        )
    )
    console.print(
        Align.center(
            Text("Type /help for commands • Press Ctrl+D to exit", style="dim")
        )
    )
    console.print()


# ─── Agent Output ───────────────────────────────────────────────────────────

def render_agent_output(
    agent_name: str,
    content: str,
    confidence: Optional[float] = None,
    steps_taken: int = 0,
    tools_used: Optional[List[str]] = None,
    duration_ms: float = 0,
):
    """Render an agent's output as a styled panel."""
    color = get_agent_color(agent_name)
    icon = get_agent_icon(agent_name)

    # Build subtitle
    subtitle_parts = []
    if steps_taken > 0:
        subtitle_parts.append(f"{steps_taken} steps")
    if tools_used:
        subtitle_parts.append(f"tools: {', '.join(tools_used)}")
    if duration_ms > 0:
        subtitle_parts.append(f"{duration_ms:.0f}ms")
    subtitle = " │ ".join(subtitle_parts) if subtitle_parts else None

    # Confidence badge
    conf_str = ""
    if confidence is not None:
        conf_color = (
            THEME["confidence_high"] if confidence >= 0.7
            else THEME["confidence_mid"] if confidence >= 0.4
            else THEME["confidence_low"]
        )
        conf_str = f" [{conf_color}]■ {confidence:.0%} confidence[/]"

    title = f"{icon} {agent_name.upper()}{conf_str}"

    # Detect if content has code blocks → use Markdown rendering
    if "```" in content:
        renderable = Markdown(content)
    else:
        renderable = Text(content)

    panel = Panel(
        renderable,
        title=title,
        subtitle=subtitle,
        border_style=color,
        box=box.HEAVY,
        padding=(1, 2),
    )
    console.print(panel)


def render_agent_thinking(agent_name: str, thought: str):
    """Render an agent's intermediate thought (dimmed)."""
    icon = get_agent_icon(agent_name)
    color = get_agent_color(agent_name)
    console.print(f"  [{color}]{icon} {agent_name}[/] [dim]thinking:[/dim] [dim italic]{thought}[/]")


def render_agent_action(agent_name: str, action_type: str, detail: str):
    """Render an agent action (tool call, delegation, etc.)."""
    icon = get_agent_icon(agent_name)
    color = get_agent_color(agent_name)
    action_icons = {
        "tool_call": "🔧",
        "delegate": "➤",
        "think": "💭",
        "search": "🔍",
        "verify": "✓",
        "execute": "▶",
    }
    action_icon = action_icons.get(action_type, "•")
    console.print(f"  [{color}]{icon}[/] {action_icon} [bold]{action_type}[/]: {detail}")


def render_agent_handoff(from_agent: str, to_agent: str, task_summary: str):
    """Render agent-to-agent handoff."""
    from_color = get_agent_color(from_agent)
    to_color = get_agent_color(to_agent)
    from_icon = get_agent_icon(from_agent)
    to_icon = get_agent_icon(to_agent)
    console.print(
        f"  [{from_color}]{from_icon} {from_agent}[/] ➤ [{to_color}]{to_icon} {to_agent}[/]"
        f"  [dim]({task_summary})[/]"
    )


# ─── Tool Output ────────────────────────────────────────────────────────────

def render_tool_result(
    tool_name: str,
    stdout: str = "",
    stderr: str = "",
    exit_code: int = 0,
    language: str = "text",
    duration_ms: float = 0,
):
    """Render tool execution result."""
    success = exit_code == 0
    status_color = THEME["confidence_high"] if success else THEME["confidence_low"]
    status_text = "OK" if success else f"EXIT {exit_code}"

    title = f"🔧 {tool_name} [{status_color}][{status_text}][/]"
    subtitle = f"{duration_ms:.0f}ms" if duration_ms > 0 else None

    parts = []
    if stdout.strip():
        parts.append(Syntax(stdout.strip(), language, theme="monokai", line_numbers=False))
    if stderr.strip():
        parts.append(Text(f"\nSTDERR:\n{stderr.strip()}", style="red"))

    if not parts:
        parts.append(Text("(no output)", style="dim"))

    # Use first renderable
    renderable = parts[0] if len(parts) == 1 else Text(stdout + "\n" + stderr)

    panel = Panel(
        renderable,
        title=title,
        subtitle=subtitle,
        border_style=THEME["tool"],
        box=box.ROUNDED,
        padding=(0, 1),
    )
    console.print(panel)


# ─── Confidence ──────────────────────────────────────────────────────────────

def render_confidence(score: float, level: str, factors: List[str]):
    """Render confidence score with bar and factors."""
    color = (
        THEME["confidence_high"] if score >= 0.7
        else THEME["confidence_mid"] if score >= 0.4
        else THEME["confidence_low"]
    )

    bar_filled = int(score * 20)
    bar_empty = 20 - bar_filled
    bar = f"[{color}]{'█' * bar_filled}[/][dim]{'░' * bar_empty}[/]"

    console.print(f"\n  Confidence: {bar} [{color}]{score:.1%}[/] ({level})")
    for factor in factors:
        console.print(f"    [dim]• {factor}[/]")


# ─── Plan ────────────────────────────────────────────────────────────────────

def render_plan(steps: List[Dict[str, Any]], title: str = "Execution Plan"):
    """Render a task plan as a tree."""
    tree = Tree(f"📋 [bold]{title}[/]")

    status_icons = {
        "pending": "○",
        "running": "◉",
        "done": "✓",
        "failed": "✗",
        "skipped": "⊘",
    }

    for i, step in enumerate(steps, 1):
        status = step.get("status", "pending")
        icon = status_icons.get(status, "○")
        agent = step.get("agent", "")
        description = step.get("description", f"Step {i}")
        agent_icon = get_agent_icon(agent) if agent else ""

        color = (
            THEME["confidence_high"] if status == "done"
            else THEME["confidence_mid"] if status == "running"
            else THEME["confidence_low"] if status == "failed"
            else "dim"
        )

        tree.add(f"[{color}]{icon}[/] {agent_icon} {description}")

    console.print(tree)


# ─── Memory ──────────────────────────────────────────────────────────────────

def render_memory_summary(stats: Dict[str, Any]):
    """Render memory system overview."""
    table = Table(
        title="🧠 Memory System",
        box=box.SIMPLE_HEAVY,
        border_style=THEME["memory"],
    )
    table.add_column("Type", style="bold")
    table.add_column("Count", justify="right")
    table.add_column("Status", justify="center")

    entries = [
        ("Episodic", stats.get("episodic_count", 0), "●"),
        ("Semantic", stats.get("semantic_count", 0), "●"),
        ("Procedural", stats.get("procedural_count", 0), "●"),
        ("Working", stats.get("working_entries", 0), f"{stats.get('working_tokens', 0)} tokens"),
    ]

    for name, count, status in entries:
        table.add_row(name, str(count), status)

    console.print(table)


# ─── Status Dashboard ───────────────────────────────────────────────────────

def render_status_dashboard(
    kg_stats: Dict[str, Any],
    teacher_names: List[str],
    agent_names: List[str],
    memory_stats: Dict[str, Any],
    tool_names: List[str],
):
    """Render full system status dashboard."""
    console.print(Rule("[bold cyan]CORTEX STATUS DASHBOARD[/]", style="cyan"))

    # Knowledge Graph
    kg_table = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
    kg_table.add_column("Key", style="dim")
    kg_table.add_column("Value", style="bold")
    kg_table.add_row("Knowledge Entries", f"{kg_stats.get('total_entries', 0):,}")
    kg_table.add_row("FAISS Vectors", f"{kg_stats.get('faiss_index_size', 0):,}")
    kg_table.add_row("Storage", f"{kg_stats.get('storage_mb', 0):.1f} MB")

    # Agents
    agent_text = Text()
    for name in agent_names:
        icon = get_agent_icon(name)
        color = get_agent_color(name)
        agent_text.append(f" {icon} {name} ", style=f"on {THEME['border']}")
        agent_text.append("  ")

    # Teachers
    teacher_text = ", ".join(teacher_names) if teacher_names else "(none active)"

    # Tools
    tool_text = ", ".join(tool_names) if tool_names else "(none active)"

    console.print(Panel(kg_table, title="📊 Knowledge Graph", border_style=THEME["system"]))
    console.print(f"\n  [bold]Agents:[/] {agent_text}")
    console.print(f"  [bold]Teachers:[/] {teacher_text}")
    console.print(f"  [bold]Tools:[/] {tool_text}")

    if memory_stats:
        console.print()
        render_memory_summary(memory_stats)

    console.print(Rule(style="dim"))


# ─── Help ────────────────────────────────────────────────────────────────────

def render_help(commands: Dict[str, str]):
    """Render help menu."""
    table = Table(
        title="⚡ CORTEX Commands",
        box=box.ROUNDED,
        border_style=THEME["prompt"],
        show_lines=True,
    )
    table.add_column("Command", style="bold cyan", min_width=20)
    table.add_column("Description")

    for cmd, desc in commands.items():
        table.add_row(cmd, desc)

    console.print(table)


# ─── Streaming ───────────────────────────────────────────────────────────────

def create_progress(description: str = "Processing...") -> Progress:
    """Create a progress context for long-running operations."""
    return Progress(
        SpinnerColumn(),
        TextColumn("[bold cyan]{task.description}"),
        BarColumn(bar_width=30),
        TimeElapsedColumn(),
        console=console,
    )


def render_spinner(message: str):
    """Show a spinner for brief wait."""
    return console.status(f"[cyan]{message}[/]", spinner="dots")


# ─── System Messages ────────────────────────────────────────────────────────

def render_system(message: str, style: str = "dim"):
    """Render a system-level message."""
    console.print(f"  [dim]⚙️ {message}[/]")


def render_error(message: str):
    """Render an error message."""
    console.print(Panel(
        Text(message, style="red"),
        title="❌ Error",
        border_style="red",
        box=box.HEAVY,
    ))


def render_warning(message: str):
    """Render a warning."""
    console.print(f"  [yellow]⚠ {message}[/]")


def render_success(message: str):
    """Render a success message."""
    console.print(f"  [green]✓ {message}[/]")


def render_divider(label: str = ""):
    """Render a visual divider."""
    if label:
        console.print(Rule(f"[dim]{label}[/]", style="dim"))
    else:
        console.print(Rule(style="dim"))
