"""CORTEX Agent Framework — Base Protocol & Data Models.

Every subagent in CORTEX inherits from BaseAgent and communicates
through Pydantic-validated messages. This ensures type safety across
the entire agent pipeline and generates clean training data for
future LLM fine-tuning.
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
    RESPOND = "respond"
    SEARCH = "search"
    VERIFY = "verify"
    EXECUTE = "execute"
    PLAN = "plan"
    REFLECT = "reflect"


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


class AgentAction(BaseModel):
    """Single step/action taken by an agent."""
    action_type: ActionType
    description: str
    tool_name: Optional[str] = None
    tool_input: Optional[Dict[str, Any]] = None
    delegate_to: Optional[str] = None
    delegate_task: Optional[str] = None
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
    memory_context: str = ""
    current_plan: Optional[List[Dict[str, Any]]] = None
    reflection_notes: List[str] = Field(default_factory=list)


class AgentResult(BaseModel):
    """Final output from an agent."""
    task_id: str
    agent_name: str
    success: bool
    answer: str
    confidence: float = 0.0
    confidence_level: str = ""
    confidence_factors: List[str] = Field(default_factory=list)
    steps_taken: int = 0
    tools_used: List[str] = Field(default_factory=list)
    agents_delegated: List[str] = Field(default_factory=list)
    duration_ms: float = 0
    error: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    # For training data collection
    full_trace: List[Dict[str, Any]] = Field(default_factory=list)


# ─── Base Agent ──────────────────────────────────────────────────────────────

class BaseAgent(ABC):
    """
    Abstract base for all CORTEX subagents.

    Every agent follows the loop:
        1. Perceive (read task + memory context)
        2. Reason (decide next action)
        3. Act (execute tool / delegate / respond)
        4. Observe (read result)
        5. Reflect (check for flaws)
        6. Repeat or respond

    Subclasses must implement:
        - step(state) -> AgentAction
        - can_handle(task) -> float
    """

    def __init__(
        self,
        name: str,
        description: str,
        capabilities: Optional[List[str]] = None,
        max_steps: int = 15,
        council=None,
        memory_manager=None,
        tool_registry=None,
        orchestrator=None,
    ):
        self.name = name
        self.description = description
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
        """
        Single reasoning step. Must return the next action.
        Override in every subclass.
        """
        raise NotImplementedError

    @abstractmethod
    def can_handle(self, task: AgentTask) -> float:
        """
        Return 0.0-1.0 confidence that this agent can handle the task.
        Used by TriageAgent to route queries.
        """
        raise NotImplementedError

    async def execute(self, task: AgentTask) -> AgentResult:
        """
        Main entry point. Runs the agent loop until response or budget exhausted.
        """
        start_time = time.time()
        self.status = AgentStatus.RUNNING

        # Initialize state
        state = AgentState(task=task)

        # Load memory context if available
        if self.memory:
            try:
                memories = await self.memory.retrieve(task.query, k=3)
                state.memory_context = memories.combined_summary()
            except Exception:
                pass

        trace = []
        tools_used = set()
        agents_delegated = set()
        final_answer = ""
        error_msg = None
        success = True

        try:
            for step_num in range(min(task.max_steps, self.max_steps)):
                # Get next action from subclass
                action = await self.step(state)
                state.steps.append(action)

                # Record trace for training data
                trace.append({
                    "step": step_num + 1,
                    "action": action.model_dump(),
                    "timestamp": action.timestamp,
                })

                # Execute action
                if action.action_type == ActionType.RESPOND:
                    final_answer = action.content
                    break

                elif action.action_type == ActionType.TOOL_CALL:
                    tool_result = await self._execute_tool(action)
                    state.tool_results.append(tool_result)
                    state.observations.append(
                        f"Tool {action.tool_name}: {'OK' if tool_result.success else 'FAIL'} — {tool_result.stdout[:200]}"
                    )
                    tools_used.add(action.tool_name)
                    trace[-1]["tool_result"] = tool_result.model_dump()

                elif action.action_type == ActionType.DELEGATE:
                    if self.orchestrator and action.delegate_to:
                        sub_result = await self.orchestrator.dispatch_to_agent(
                            action.delegate_to,
                            AgentTask(
                                query=action.delegate_task or action.content,
                                context=task.context,
                                parent_agent=self.name,
                                parent_task_id=task.task_id,
                            )
                        )
                        state.delegated_results[action.delegate_to] = sub_result.answer
                        agents_delegated.add(action.delegate_to)
                        state.observations.append(
                            f"Delegated to {action.delegate_to}: {sub_result.answer[:200]}"
                        )
                        trace[-1]["delegate_result"] = sub_result.model_dump()

                elif action.action_type == ActionType.THINK:
                    state.observations.append(f"Thought: {action.content[:200]}")

                elif action.action_type == ActionType.REFLECT:
                    flaws = await self.reflect(state)
                    state.reflection_notes.extend(flaws)
                    state.observations.append(f"Reflection: {'; '.join(flaws)}")

                else:
                    state.observations.append(f"{action.action_type}: {action.content[:200]}")

            else:
                # Budget exhausted — synthesize from what we have
                if not final_answer:
                    final_answer = await self._synthesize_from_state(state)

        except Exception as e:
            error_msg = f"{self.name} failed: {str(e)}\n{traceback.format_exc()}"
            success = False
            if not final_answer:
                final_answer = f"Agent {self.name} encountered an error: {str(e)}"

        duration = (time.time() - start_time) * 1000
        self.status = AgentStatus.COMPLETED if success else AgentStatus.FAILED

        # Compute confidence (if calibrator available)
        confidence = 0.5
        confidence_level = "medium"
        confidence_factors = []

        result = AgentResult(
            task_id=task.task_id,
            agent_name=self.name,
            success=success,
            answer=final_answer,
            confidence=confidence,
            confidence_level=confidence_level,
            confidence_factors=confidence_factors,
            steps_taken=len(state.steps),
            tools_used=list(tools_used),
            agents_delegated=list(agents_delegated),
            duration_ms=duration,
            error=error_msg,
            full_trace=trace,
        )

        # Store episode in memory for future learning
        if self.memory and success:
            try:
                from ..memory.episodic import Episode
                episode = Episode(
                    task=task.query,
                    task_id=task.task_id,
                    answer=final_answer[:500],
                    outcome_score=confidence,
                    task_type=self.name,
                    steps_taken=len(state.steps),
                    agents_involved=[self.name] + list(agents_delegated),
                    tools_used=list(tools_used),
                )
                await self.memory.store("episodic", episode)
            except Exception:
                pass

        return result

    async def reflect(self, state: AgentState) -> List[str]:
        """
        Self-reflection: identify flaws in current approach.
        Default implementation — override for smarter reflection.
        """
        flaws = []
        if len(state.steps) > 5:
            flaws.append("Taking many steps — consider synthesizing a response")
        failed_tools = [r for r in state.tool_results if not r.success]
        if failed_tools:
            flaws.append(f"{len(failed_tools)} tool(s) failed — try different approach")
        if not state.observations:
            flaws.append("No observations yet — need more information")
        return flaws

    async def _execute_tool(self, action: AgentAction) -> ToolCallResult:
        """Execute a tool call via the tool registry."""
        if not self.tools or not action.tool_name:
            return ToolCallResult(
                tool_name=action.tool_name or "unknown",
                success=False,
                stderr="Tool system not available",
                exit_code=1,
            )

        tool = self.tools.get(action.tool_name)
        if not tool:
            return ToolCallResult(
                tool_name=action.tool_name,
                success=False,
                stderr=f"Tool '{action.tool_name}' not found",
                exit_code=1,
            )

        try:
            result = await tool.execute(action.tool_input or {})
            return result
        except Exception as e:
            return ToolCallResult(
                tool_name=action.tool_name,
                success=False,
                stderr=str(e),
                exit_code=1,
            )

    async def _synthesize_from_state(self, state: AgentState) -> str:
        """Fallback: synthesize answer from accumulated observations."""
        if state.delegated_results:
            parts = [f"From {agent}: {result}" for agent, result in state.delegated_results.items()]
            return "\n\n".join(parts)
        if state.tool_results:
            successful = [r for r in state.tool_results if r.success and r.stdout]
            if successful:
                return successful[-1].stdout
        if state.observations:
            return "\n".join(state.observations[-3:])
        return "Unable to generate a complete answer within the step budget."

    def __repr__(self):
        return f"<{self.__class__.__name__} name='{self.name}' status={self.status.value}>"
