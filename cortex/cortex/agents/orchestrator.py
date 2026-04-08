"""CORTEX Agent Orchestrator v3.0 — Hierarchical agent management.

Manages 9 Lead Agents, each with their own subagents.
Routes via SmartRouter. Saves full traces for LLM training.
"""

import json, time, os, uuid
from pathlib import Path
from typing import Dict, List, Any, Optional

from .base import BaseAgent, LeadAgent, AgentTask, AgentResult
from .router import SmartRouter


class AgentOrchestrator:
    """Central brain — manages lead agents, routes queries, saves traces."""

    def __init__(self, council=None, memory_manager=None, tool_registry=None):
        self.council = council
        self.memory = memory_manager
        self.tools = tool_registry
        self.leads: Dict[str, LeadAgent] = {}
        self.router = SmartRouter()
        self.trace_dir = Path(os.environ.get("CORTEX_TRACE_DIR", "Z:/cortex_data/agent_traces"))
        self.trace_dir.mkdir(parents=True, exist_ok=True)

    def register_lead(self, agent: LeadAgent):
        """Register a lead agent and inject dependencies."""
        agent.inject_deps(
            council=self.council,
            memory=self.memory,
            tools=self.tools,
            orchestrator=self,
        )
        self.leads[agent.name] = agent
        self.router.register_lead(agent)

    def list_agents(self) -> List[str]:
        """List all lead agent names."""
        return list(self.leads.keys())

    def list_all_agents(self) -> Dict[str, List[str]]:
        """Full agent tree: {lead: [subagents]}."""
        tree = {}
        for name, lead in self.leads.items():
            if hasattr(lead, 'subagents'):
                tree[name] = lead.list_subagents()
            else:
                tree[name] = []
        return tree

    def get_agent_descriptions(self) -> Dict[str, str]:
        return {n: a.description for n, a in self.leads.items()}

    def get_full_descriptions(self) -> Dict[str, Dict[str, str]]:
        """Full descriptions including subagents."""
        result = {}
        for name, lead in self.leads.items():
            result[name] = {
                "description": lead.description,
                "role": lead.role.value,
                "subagents": lead.get_subagent_descriptions() if hasattr(lead, 'subagents') else {},
            }
        return result

    async def dispatch(self, query: str, agent_name: str = None, **kw) -> AgentResult:
        """Dispatch a query — either to a specific agent or via smart routing."""
        task = AgentTask(query=query, target_group=agent_name, **kw)
        start = time.time()

        if agent_name and agent_name in self.leads:
            result = await self.leads[agent_name].execute(task)
        else:
            result = await self.router.execute(task)

        result.duration_ms = (time.time() - start) * 1000
        self._save_trace(query, result)
        return result

    async def dispatch_to_agent(self, agent_name: str, task: AgentTask) -> AgentResult:
        """Direct dispatch for inter-agent delegation."""
        agent = self.leads.get(agent_name)
        if not agent:
            return AgentResult(task_id=task.task_id, agent_name=agent_name, success=False,
                               answer=f"Agent '{agent_name}' not found.")
        return await agent.execute(task)

    def _save_trace(self, query: str, result: AgentResult):
        """Save execution trace for LLM training data."""
        try:
            from datetime import date
            trace_file = self.trace_dir / f"traces_{date.today().isoformat()}.jsonl"
            trace = {
                "id": uuid.uuid4().hex[:12],
                "query": query,
                "agent": result.agent_name,
                "agent_group": result.agent_group,
                "agent_role": result.agent_role,
                "answer": result.answer[:5000],
                "success": result.success,
                "confidence": result.confidence,
                "steps_taken": result.steps_taken,
                "tools_used": result.tools_used,
                "subagents_used": result.subagents_used,
                "agents_delegated": result.agents_delegated,
                "duration_ms": result.duration_ms,
                "full_trace": result.full_trace[:50],
                "metadata": result.metadata,
            }
            with open(trace_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(trace, default=str) + "\n")
        except Exception:
            pass

    def agent_count(self) -> Dict[str, int]:
        """Count leads and total subagents."""
        total_sub = sum(len(l.subagents) for l in self.leads.values() if hasattr(l, 'subagents'))
        return {"leads": len(self.leads), "subagents": total_sub, "total": len(self.leads) + total_sub}


def create_agent_orchestrator(council=None, memory_manager=None, tool_registry=None) -> AgentOrchestrator:
    """Factory: create orchestrator and register all 9 lead agent groups."""
    orch = AgentOrchestrator(council=council, memory_manager=memory_manager, tool_registry=tool_registry)

    from .explore import ExploreAgent
    from .plan import PlanAgent
    from .help import HelpGuideAgent
    from .developers import DevLeadAgent
    from .quality import QualityLeadAgent
    from .devops import DevOpsLeadAgent
    from .workflow import PMSpecAgent
    from .docs import DocumentAgent
    from .browser import BrowserUIAgent

    orch.register_lead(ExploreAgent())
    orch.register_lead(PlanAgent())
    orch.register_lead(HelpGuideAgent())
    orch.register_lead(DevLeadAgent())
    orch.register_lead(QualityLeadAgent())
    orch.register_lead(DevOpsLeadAgent())
    orch.register_lead(PMSpecAgent())
    orch.register_lead(DocumentAgent())
    orch.register_lead(BrowserUIAgent())

    return orch
