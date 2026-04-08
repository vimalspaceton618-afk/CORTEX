"""Core Dashboard — Live TUI with agent/tool/memory stats. Toggle with /dashboard."""

from rich.layout import Layout
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich import box


def build_dashboard(
    session_id: str = "",
    uptime: str = "",
    cmd_count: int = 0,
    agent_tree: dict = None,
    agent_counts: dict = None,
    tool_names: list = None,
    memory_stats: dict = None,
    kg_stats: dict = None,
    teacher_names: list = None,
    last_confidence: float = 0.0,
) -> Panel:
    """Build a full dashboard panel for rendering."""
    agent_tree = agent_tree or {}
    agent_counts = agent_counts or {}
    tool_names = tool_names or []
    memory_stats = memory_stats or {}
    kg_stats = kg_stats or {}
    teacher_names = teacher_names or []

    # Session info
    header = Text()
    header.append(f"  Session: {session_id}", style="bold cyan")
    header.append(f"  │  Uptime: {uptime}", style="dim")
    header.append(f"  │  Commands: {cmd_count}", style="dim")

    # Agent tree
    agent_table = Table(title="AGENT GROUPS", box=box.SIMPLE_HEAD, title_style="bold magenta",
                        show_edge=False, pad_edge=False)
    agent_table.add_column("Lead", style="bold")
    agent_table.add_column("SubAgents", style="dim")

    icons = {"explore":"🔍","plan":"📋","help":"💡","developers":"👨‍💻","quality":"🔒",
             "devops":"🚀","pm_spec":"📝","docs":"📖","browser_ui":"🌐"}

    for lead, subs in agent_tree.items():
        icon = icons.get(lead, "⚙️")
        sub_str = ", ".join(subs[:4])
        if len(subs) > 4:
            sub_str += f" +{len(subs)-4}"
        agent_table.add_row(f"{icon} {lead}", sub_str or "—")

    counts = agent_counts
    agent_table.add_row("", f"[bold]{counts.get('leads',0)} leads, {counts.get('subagents',0)} subs = {counts.get('total',0)} total[/]")

    # Tools
    tools_text = " · ".join(f"🔧{t}" for t in tool_names[:8])
    if len(tool_names) > 8:
        tools_text += f" +{len(tool_names)-8}"

    # Knowledge Graph
    kg_text = (f"Entries: {kg_stats.get('total_entries', 0):,}  │  "
               f"FAISS: {kg_stats.get('faiss_vectors', 0):,}  │  "
               f"Storage: {kg_stats.get('storage_mb', 0):.0f} MB")

    # Memory
    mem_text = (f"Working: {memory_stats.get('working', 0)}  │  "
                f"Episodic: {memory_stats.get('episodic', 0):,}  │  "
                f"Skills: {memory_stats.get('procedural', 0)}")

    # Teachers
    teachers_text = " · ".join(teacher_names) if teacher_names else "None configured"

    # Confidence bar
    bar_len = 20
    filled = int(last_confidence * bar_len)
    conf_bar = "█" * filled + "░" * (bar_len - filled)
    conf_color = "green" if last_confidence >= 0.7 else "yellow" if last_confidence >= 0.4 else "red"

    # Assemble
    content = Text()
    content.append_text(header)
    content.append("\n")

    inner = Panel.fit(
        agent_table,
        border_style="bright_blue",
    )

    # Build final panel
    from rich.console import Group
    from rich.text import Text as T

    sections = Group(
        header,
        Text(""),
        agent_table,
        Text(""),
        Text(f"  TOOLS  {tools_text}", style="dim"),
        Text(f"  KG     {kg_text}", style="dim"),
        Text(f"  MEMORY {mem_text}", style="dim"),
        Text(f"  TEACH  {teachers_text}", style="dim"),
        Text(f"  CONF   [{conf_color}]{conf_bar}[/] {last_confidence:.0%}", style="dim"),
    )

    return Panel(sections, title="[bold bright_cyan]⫸ CORTEX LIVE ⫷[/]", border_style="bright_blue",
                 box=box.DOUBLE_EDGE)
