"""Reasoning context and result dataclasses for CORTEX Agent OS."""

import uuid
import time
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional


@dataclass
class ReasoningStep:
    """A single step in the reasoning process."""
    step_num: int
    action: str  # "think", "tool_call", "agent_dispatch", "reflect", "decompose"
    content: str
    tool_result: Optional[str] = None
    agent_result: Optional[str] = None
    agent_name: Optional[str] = None
    tool_name: Optional[str] = None
    duration_ms: float = 0.0
    success: bool = True


@dataclass
class ToolCall:
    """Record of a tool invocation."""
    tool: str
    arguments: Dict[str, Any]
    result: str
    duration_ms: float
    success: bool = True
    error: Optional[str] = None


@dataclass
class TaskResult:
    """Final output from processing a task."""
    task_id: str
    task: str
    answer: str
    source: str  # "memory", "reasoning", "agent_consensus", "verified", "unverified"
    steps_taken: List[ReasoningStep] = field(default_factory=list)
    tools_used: List[ToolCall] = field(default_factory=list)
    agents_involved: List[str] = field(default_factory=list)
    confidence: float = 0.0
    reflection_cycles: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    duration_ms: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "task": self.task,
            "answer": self.answer,
            "source": self.source,
            "steps_count": len(self.steps_taken),
            "tools_used": [t.tool for t in self.tools_used],
            "agents_involved": self.agents_involved,
            "confidence": self.confidence,
            "reflection_cycles": self.reflection_cycles,
            "metadata": self.metadata,
            "duration_ms": self.duration_ms,
        }


class ReasoningContext:
    """Per-task state container that flows through all subsystems."""

    def __init__(self, task: str, task_type: str = "auto", parent_id: Optional[str] = None):
        self.task_id = str(uuid.uuid4())[:12]
        self.task = task
        self.task_type = task_type
        self.parent_id = parent_id
        self.steps_taken: List[ReasoningStep] = []
        self.tools_used: List[ToolCall] = []
        self.agents_involved: List[str] = []
        self.working_memory_entries: List[Dict[str, Any]] = []
        self.confidence: float = 0.0
        self.reflection_count: int = 0
        self.max_reflections: int = 3
        self.metadata: Dict[str, Any] = {}
        self.start_time: float = time.time()

    @property
    def elapsed_ms(self) -> float:
        return (time.time() - self.start_time) * 1000

    def add_step(self, action: str, content: str, **kwargs) -> ReasoningStep:
        """Add a reasoning step to the trace."""
        step = ReasoningStep(
            step_num=len(self.steps_taken) + 1,
            action=action,
            content=content,
            **kwargs
        )
        self.steps_taken.append(step)
        return step

    def add_tool_call(self, tool: str, arguments: Dict[str, Any],
                      result: str, duration_ms: float, success: bool = True,
                      error: Optional[str] = None) -> ToolCall:
        """Record a tool invocation."""
        call = ToolCall(
            tool=tool,
            arguments=arguments,
            result=result,
            duration_ms=duration_ms,
            success=success,
            error=error,
        )
        self.tools_used.append(call)
        return call

    def get_working_context(self, max_tokens: int = 4000) -> str:
        """Return formatted working context for LLM prompts."""
        parts = []
        total_tokens = 0
        for entry in self.working_memory_entries:
            text = entry.get("content", "")
            if total_tokens + len(text.split()) > max_tokens:
                parts.append(f"\n...[context truncated, {total_tokens} tokens]")
                break
            parts.append(f"[{entry.get('type', 'info')}] {text}")
            total_tokens += len(text.split())
        return "\n".join(parts)

    def add_to_working_memory(self, content: str, entry_type: str = "info"):
        """Add entry to working memory (oldest evicted when needed)."""
        self.working_memory_entries.append({
            "content": content,
            "type": entry_type,
            "timestamp": time.time(),
        })

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "task": self.task,
            "task_type": self.task_type,
            "parent_id": self.parent_id,
            "steps": len(self.steps_taken),
            "tools_used": len(self.tools_used),
            "agents": self.agents_involved,
            "working_memory_entries": len(self.working_memory_entries),
            "confidence": self.confidence,
            "elapsed_ms": self.elapsed_ms,
        }
