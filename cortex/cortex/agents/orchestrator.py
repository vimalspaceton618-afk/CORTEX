"""Agent Orchestrator — Central dispatcher and lifecycle manager.

Manages agent registration, task routing, message passing,
step budgets, and execution traces for training data.
"""

import asyncio
import time
import json
from typing import Dict, List, Optional, Any
from pathlib import Path
from datetime import datetime

from .base import BaseAgent, AgentTask, AgentResult, AgentStatus


class AgentOrchestrator:
    """
    Central dispatcher that manages all agent lifecycles.

    Responsibilities:
    - Register and hold references to all agents
    - Route tasks to the best agent (or specific agent by name)
    - Handle agent-to-agent delegation (forwarding subtasks)
    - Enforce global step budgets and timeouts
    - Collect execution traces for LLM training data
    """

    def __init__(
        self,
        council=None,
        memory_manager=None,
        tool_registry=None,
        trace_dir: str = "Z:/cortex_data/agent_traces",
    ):
        self.agents: Dict[str, BaseAgent] = {}
        self.council = council
        self.memory = memory_manager
        self.tools = tool_registry
        self.trace_dir = Path(trace_dir)
        self.trace_dir.mkdir(parents=True, exist_ok=True)

        # Execution history for this session
        self.session_tasks: List[Dict[str, Any]] = []

    def register(self, agent: BaseAgent):
        """Register an agent and inject shared dependencies."""
        agent.council = self.council
        agent.memory = self.memory
        agent.tools = self.tools
        agent.orchestrator = self
        self.agents[agent.name] = agent

    def get_agent(self, name: str) -> Optional[BaseAgent]:
        """Get agent by name."""
        return self.agents.get(name)

    def list_agents(self) -> List[str]:
        """List registered agent names."""
        return list(self.agents.keys())

    def get_agent_descriptions(self) -> Dict[str, str]:
        """Get agent name → description mapping."""
        return {name: agent.description for name, agent in self.agents.items()}

    async def dispatch(self, query: str, context: str = "", agent_name: str = None) -> AgentResult:
        """
        Main entry point: dispatch a query to the best agent.

        If agent_name is specified, routes directly to that agent.
        Otherwise, uses TriageAgent to determine the best handler.
        """
        task = AgentTask(query=query, context=context)

        if agent_name and agent_name in self.agents:
            return await self.dispatch_to_agent(agent_name, task)

        # Use triage agent if available
        if "triage" in self.agents:
            return await self.dispatch_to_agent("triage", task)

        # Fallback: find best agent by can_handle score
        best_agent = None
        best_score = 0.0
        for name, agent in self.agents.items():
            score = agent.can_handle(task)
            if score > best_score:
                best_score = score
                best_agent = name

        if best_agent:
            return await self.dispatch_to_agent(best_agent, task)

        # Last resort: direct council query
        if self.council:
            result = await self.council.process_question(query)
            return AgentResult(
                task_id=task.task_id,
                agent_name="council",
                success=True,
                answer=result.get("answer", ""),
                confidence=result.get("confidence", 0.5),
            )

        return AgentResult(
            task_id=task.task_id,
            agent_name="none",
            success=False,
            answer="No agents available to handle this request.",
        )

    async def dispatch_to_agent(self, agent_name: str, task: AgentTask) -> AgentResult:
        """Dispatch a task to a specific agent."""
        agent = self.agents.get(agent_name)
        if not agent:
            return AgentResult(
                task_id=task.task_id,
                agent_name=agent_name,
                success=False,
                answer=f"Agent '{agent_name}' not found.",
            )

        # Execute
        result = await agent.execute(task)

        # Save trace for LLM training
        self._save_trace(task, result)

        # Track in session history
        self.session_tasks.append({
            "task_id": task.task_id,
            "query": task.query[:200],
            "agent": agent_name,
            "success": result.success,
            "confidence": result.confidence,
            "steps": result.steps_taken,
            "duration_ms": result.duration_ms,
            "timestamp": datetime.utcnow().isoformat(),
        })

        return result

    def _save_trace(self, task: AgentTask, result: AgentResult):
        """Save execution trace as JSONL for future LLM training."""
        try:
            trace_file = self.trace_dir / f"traces_{datetime.utcnow().strftime('%Y-%m-%d')}.jsonl"
            trace_entry = {
                "task_id": task.task_id,
                "query": task.query,
                "context": task.context[:500],
                "agent": result.agent_name,
                "answer": result.answer[:2000],
                "confidence": result.confidence,
                "steps_taken": result.steps_taken,
                "tools_used": result.tools_used,
                "agents_delegated": result.agents_delegated,
                "duration_ms": result.duration_ms,
                "success": result.success,
                "full_trace": result.full_trace[:20],  # Cap trace size
                "timestamp": datetime.utcnow().isoformat(),
            }
            with open(trace_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(trace_entry, ensure_ascii=False) + "\n")
        except Exception:
            pass  # Don't let trace saving crash the system

    def get_session_stats(self) -> Dict[str, Any]:
        """Get stats for current session."""
        if not self.session_tasks:
            return {"total_tasks": 0}

        return {
            "total_tasks": len(self.session_tasks),
            "successful": sum(1 for t in self.session_tasks if t["success"]),
            "failed": sum(1 for t in self.session_tasks if not t["success"]),
            "agents_used": list(set(t["agent"] for t in self.session_tasks)),
            "avg_confidence": sum(t["confidence"] for t in self.session_tasks) / len(self.session_tasks),
            "avg_steps": sum(t["steps"] for t in self.session_tasks) / len(self.session_tasks),
            "total_duration_ms": sum(t["duration_ms"] for t in self.session_tasks),
        }
