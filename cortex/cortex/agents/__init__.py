"""CORTEX Agents Package — Agent registry and factory."""

from .orchestrator import AgentOrchestrator
from .triage import TriageAgent
from .researcher import ResearcherAgent
from .coder import CoderAgent
from .verifier import VerifierAgent
from .planner import PlannerAgent
from .architect import ArchitectAgent


def create_agent_orchestrator(
    council=None,
    memory_manager=None,
    tool_registry=None,
    trace_dir: str = "Z:/cortex_data/agent_traces",
) -> AgentOrchestrator:
    """Create orchestrator with all agents registered."""
    orchestrator = AgentOrchestrator(
        council=council,
        memory_manager=memory_manager,
        tool_registry=tool_registry,
        trace_dir=trace_dir,
    )

    # Register all agents
    orchestrator.register(TriageAgent())
    orchestrator.register(ResearcherAgent())
    orchestrator.register(CoderAgent())
    orchestrator.register(VerifierAgent())
    orchestrator.register(PlannerAgent())
    orchestrator.register(ArchitectAgent())

    return orchestrator


__all__ = [
    "AgentOrchestrator", "create_agent_orchestrator",
    "TriageAgent", "ResearcherAgent", "CoderAgent",
    "VerifierAgent", "PlannerAgent", "ArchitectAgent",
]
