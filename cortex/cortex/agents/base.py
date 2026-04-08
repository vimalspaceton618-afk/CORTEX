"""CORTEX Agent Framework v3.0 — Hierarchical Agent Protocol.

Supports Lead Agents with autonomous SubAgents. Each lead agent
can spawn, coordinate, and synthesize results from its subagents.

Copyright (c) 2026 vimalspaceton618-afk. All Rights Reserved.
"""

import asyncio
import time
import uuid
import traceback
from abc import ABC, abstractmethod
from enum import Enum
from typing import List, Dict, Any, Optional, Type
from datetime import datetime

from pydantic import BaseModel, Field


# ─── Enums ───────────────────────────────────────────────────────────────────

class ActionType(str, Enum):
    THINK = "think"
    TOOL_CALL = "tool_call"
    DELEGATE = "delegate"
    DELEGATE_SUB = "delegate_sub"    # Lead → SubAgent
    RESPOND = "respond"
    SEARCH = "search"
    VERIFY = "verify"
    EXECUTE = "execute"
    PLAN = "plan"
    REFLECT = "reflect"
    PARALLEL = "parallel"            # Run multiple subagents simultaneously
    DEBATE = "debate"                # Multi-agent consensus


class TaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AgentStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    WAITING = "waiting"
    COMPLETED = "completed"
    FAILED = "failed"


class AgentRole(str, Enum):
    LEAD = "lead"       # Orchestrates subagents
    SUB = "sub"         # Executes specialized tasks
    SOLO = "solo"       # Standalone (backward compat)
    ROUTER = "router"   # Smart routing only


# ─── Pydantic Models ────────────────────────────────────────────────────────

class AgentTask(BaseModel):
    """Input task for an agent."""
    task_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    query: str
    context: str = ""
    constraints: List[str] = Field(default_factory=list)
    parent_agent: Optional[str] = None
    parent_task_id: Optional[str] = None
    priority: TaskPriority = TaskPriority.MEDIUM
    max_steps: int = 15
    timeout_seconds: int = 120
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    # v3: additional routing hints
    target_group: Optional[str] = None    # "explore", "dev", "quality", etc.
    target_subagent: Optional[str] = None # Direct subagent name


class AgentAction(BaseModel):
    """Single step/action taken by an agent."""
    action_type: ActionType
    description: str
    tool_name: Optional[str] = None
    tool_input: Optional[Dict[str, Any]] = None
    delegate_to: Optional[str] = None
    delegate_task: Optional[str] = None
    subagent_tasks: Optional[List[Dict[str, str]]] = None  # For PARALLEL
    content: str = ""
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class ToolCallResult(BaseModel):
    """Result from a tool execution."""
    tool_name: str
    success: bool
    stdout: str = ""
    stderr: str = ""
    exit_code: int = 0
    artifacts: List[str] = Field(default_factory=list)
    duration_ms: float = 0


class AgentState(BaseModel):
    """Accumulated state during agent execution."""
    task: AgentTask
    steps: List[AgentAction] = Field(default_factory=list)
    tool_results: List[ToolCallResult] = Field(default_factory=list)
    observations: List[str] = Field(default_factory=list)
    delegated_results: Dict[str, Any] = Field(default_factory=dict)
    subagent_results: Dict[str, Any] = Field(default_factory=dict)
    memory_context: str = ""
    current_plan: Optional[List[Dict[str, Any]]] = None
    reflection_notes: List[str] = Field(default_factory=list)


class AgentResult(BaseModel):
    """Final output from an agent."""
    task_id: str
    agent_name: str
    agent_group: str = ""
    agent_role: str = "solo"
    success: bool
    answer: str
    confidence: float = 0.0
    confidence_level: str = ""
    confidence_factors: List[str] = Field(default_factory=list)
    steps_taken: int = 0
    tools_used: List[str] = Field(default_factory=list)
    agents_delegated: List[str] = Field(default_factory=list)
    subagents_used: List[str] = Field(default_factory=list)
    duration_ms: float = 0
    error: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    full_trace: List[Dict[str, Any]] = Field(default_factory=list)


# ─── Base Agent ──────────────────────────────────────────────────────────────

class BaseAgent(ABC):
    """Abstract base for all CORTEX agents (lead, sub, or solo)."""

    def __init__(
        self,
        name: str,
        description: str,
        group: str = "",
        role: AgentRole = AgentRole.SOLO,
        capabilities: Optional[List[str]] = None,
        max_steps: int = 15,
        council=None,
        memory_manager=None,
        tool_registry=None,
        orchestrator=None,
    ):
        self.name = name
        self.description = description
        self.group = group
        self.role = role
        self.capabilities = capabilities or []
        self.max_steps = max_steps
        self.status = AgentStatus.IDLE

        # Injected dependencies
        self.council = council
        self.memory = memory_manager
        self.tools = tool_registry
        self.orchestrator = orchestrator

    @abstractmethod
    async def step(self, state: AgentState) -> AgentAction:
        raise NotImplementedError

    @abstractmethod
    def can_handle(self, task: AgentTask) -> float:
        raise NotImplementedError

    async def execute(self, task: AgentTask) -> AgentResult:
        """Main entry — runs the perceive-reason-act loop."""
        start_time = time.time()
        self.status = AgentStatus.RUNNING
        state = AgentState(task=task)

        # Load memory context
        if self.memory:
            try:
                memories = await self.memory.retrieve(task.query, k=3)
                state.memory_context = memories.combined_summary()
            except Exception:
                pass

        trace, tools_used, agents_delegated, subagents_used = [], set(), set(), set()
        final_answer, error_msg, success = "", None, True

        try:
            for step_num in range(min(task.max_steps, self.max_steps)):
                action = await self.step(state)
                state.steps.append(action)
                trace.append({"step": step_num + 1, "action": action.model_dump()})

                if action.action_type == ActionType.RESPOND:
                    final_answer = action.content
                    break
                elif action.action_type == ActionType.TOOL_CALL:
                    result = await self._execute_tool(action)
                    state.tool_results.append(result)
                    state.observations.append(
                        f"Tool {action.tool_name}: {'OK' if result.success else 'FAIL'} — {result.stdout[:200]}"
                    )
                    tools_used.add(action.tool_name)
                    trace[-1]["tool_result"] = result.model_dump()
                elif action.action_type == ActionType.DELEGATE:
                    if self.orchestrator and action.delegate_to:
                        sub_result = await self.orchestrator.dispatch_to_agent(
                            action.delegate_to,
                            AgentTask(query=action.delegate_task or action.content,
                                      context=task.context, parent_agent=self.name,
                                      parent_task_id=task.task_id)
                        )
                        state.delegated_results[action.delegate_to] = sub_result.answer
                        agents_delegated.add(action.delegate_to)
                        state.observations.append(f"Delegated to {action.delegate_to}: {sub_result.answer[:200]}")
                elif action.action_type == ActionType.DELEGATE_SUB:
                    if hasattr(self, 'subagents') and action.delegate_to:
                        sub = self.subagents.get(action.delegate_to)
                        if sub:
                            sub_result = await sub.execute(
                                AgentTask(query=action.delegate_task or action.content,
                                          context=task.context, parent_agent=self.name,
                                          parent_task_id=task.task_id)
                            )
                            state.subagent_results[action.delegate_to] = sub_result.answer
                            subagents_used.add(action.delegate_to)
                            state.observations.append(f"SubAgent {action.delegate_to}: {sub_result.answer[:200]}")
                elif action.action_type == ActionType.PARALLEL:
                    if hasattr(self, 'subagents') and action.subagent_tasks:
                        results = await self._run_parallel_subagents(action.subagent_tasks, task)
                        for name, answer in results.items():
                            state.subagent_results[name] = answer
                            subagents_used.add(name)
                            state.observations.append(f"SubAgent {name}: {answer[:150]}")
                elif action.action_type == ActionType.THINK:
                    state.observations.append(f"Thought: {action.content[:200]}")
                elif action.action_type == ActionType.REFLECT:
                    flaws = await self.reflect(state)
                    state.reflection_notes.extend(flaws)
                else:
                    state.observations.append(f"{action.action_type}: {action.content[:200]}")
            else:
                if not final_answer:
                    final_answer = await self._synthesize_from_state(state)
        except Exception as e:
            error_msg = f"{self.name} failed: {e}\n{traceback.format_exc()}"
            success = False
            if not final_answer:
                final_answer = f"Agent {self.name} error: {e}"

        duration = (time.time() - start_time) * 1000
        self.status = AgentStatus.COMPLETED if success else AgentStatus.FAILED

        result = AgentResult(
            task_id=task.task_id, agent_name=self.name, agent_group=self.group,
            agent_role=self.role.value, success=success, answer=final_answer,
            confidence=0.5, steps_taken=len(state.steps),
            tools_used=list(tools_used), agents_delegated=list(agents_delegated),
            subagents_used=list(subagents_used), duration_ms=duration,
            error=error_msg, full_trace=trace,
        )

        # Store episode
        if self.memory and success:
            try:
                from ..memory.episodic import Episode
                await self.memory.store("episodic", Episode(
                    task=task.query, task_id=task.task_id, answer=final_answer[:500],
                    outcome_score=0.5, task_type=self.name,
                    steps_taken=len(state.steps),
                    agents_involved=[self.name] + list(agents_delegated) + list(subagents_used),
                    tools_used=list(tools_used),
                ))
            except Exception:
                pass

        return result

    async def _run_parallel_subagents(self, tasks: List[Dict[str, str]], parent: AgentTask) -> Dict[str, str]:
        """Run multiple subagents simultaneously."""
        if not hasattr(self, 'subagents'):
            return {}
        coros = []
        names = []
        for t in tasks:
            name = t.get("agent", "")
            query = t.get("query", "")
            sub = self.subagents.get(name)
            if sub:
                coros.append(sub.execute(AgentTask(
                    query=query, context=parent.context,
                    parent_agent=self.name, parent_task_id=parent.task_id,
                )))
                names.append(name)
        if not coros:
            return {}
        results = await asyncio.gather(*coros, return_exceptions=True)
        output = {}
        for name, res in zip(names, results):
            if isinstance(res, Exception):
                output[name] = f"Error: {res}"
            else:
                output[name] = res.answer
        return output

    async def reflect(self, state: AgentState) -> List[str]:
        flaws = []
        if len(state.steps) > 5:
            flaws.append("Many steps — consider synthesizing")
        failed = [r for r in state.tool_results if not r.success]
        if failed:
            flaws.append(f"{len(failed)} tool(s) failed")
        return flaws

    async def _execute_tool(self, action: AgentAction) -> ToolCallResult:
        if not self.tools or not action.tool_name:
            return ToolCallResult(tool_name=action.tool_name or "unknown", success=False,
                                  stderr="Tool system not available", exit_code=1)
        tool = self.tools.get(action.tool_name)
        if not tool:
            return ToolCallResult(tool_name=action.tool_name, success=False,
                                  stderr=f"Tool '{action.tool_name}' not found", exit_code=1)
        try:
            return await tool.execute(action.tool_input or {})
        except Exception as e:
            return ToolCallResult(tool_name=action.tool_name, success=False,
                                  stderr=str(e), exit_code=1)

    async def _synthesize_from_state(self, state: AgentState) -> str:
        if state.subagent_results:
            parts = [f"**{agent}**: {result}" for agent, result in state.subagent_results.items()]
            return "\n\n".join(parts)
        if state.delegated_results:
            parts = [f"**{agent}**: {result}" for agent, result in state.delegated_results.items()]
            return "\n\n".join(parts)
        if state.tool_results:
            ok = [r for r in state.tool_results if r.success and r.stdout]
            if ok:
                return ok[-1].stdout
        if state.observations:
            return "\n".join(state.observations[-3:])
        return "Unable to complete within step budget."

    def __repr__(self):
        return f"<{self.__class__.__name__} {self.name} [{self.role.value}] status={self.status.value}>"


# ─── Lead Agent ──────────────────────────────────────────────────────────────

class LeadAgent(BaseAgent):
    """
    A Lead Agent that manages a team of SubAgents.
    
    Lead agents:
    - Own a registry of subagents
    - Route subtasks to the best subagent
    - Can run subagents in parallel
    - Synthesize results from multiple subagents
    """

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("role", AgentRole.LEAD)
        super().__init__(*args, **kwargs)
        self.subagents: Dict[str, BaseAgent] = {}

    def register_subagent(self, agent: BaseAgent):
        """Register a subagent under this lead."""
        agent.council = self.council
        agent.memory = self.memory
        agent.tools = self.tools
        agent.orchestrator = self.orchestrator
        self.subagents[agent.name] = agent

    def list_subagents(self) -> List[str]:
        return list(self.subagents.keys())

    def get_subagent_descriptions(self) -> Dict[str, str]:
        return {n: a.description for n, a in self.subagents.items()}

    def _best_subagent(self, task: AgentTask) -> Optional[str]:
        """Find the best subagent for a task."""
        best, best_score = None, 0.0
        for name, agent in self.subagents.items():
            score = agent.can_handle(task)
            if score > best_score:
                best_score = score
                best = name
        return best if best_score > 0.1 else None

    def inject_deps(self, council=None, memory=None, tools=None, orchestrator=None):
        """Inject dependencies into lead and all subagents."""
        self.council = council or self.council
        self.memory = memory or self.memory
        self.tools = tools or self.tools
        self.orchestrator = orchestrator or self.orchestrator
        for sub in self.subagents.values():
            sub.council = self.council
            sub.memory = self.memory
            sub.tools = self.tools
            sub.orchestrator = self.orchestrator


class SubAgent(BaseAgent):
    """A SubAgent owned by a LeadAgent. Focused on a single specialty."""

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("role", AgentRole.SUB)
        super().__init__(*args, **kwargs)
