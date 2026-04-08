"""Async event bus for decoupled subsystem communication in CORTEX."""

import asyncio
from typing import Callable, Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Event:
    """An event emitted on the bus."""
    event_type: str
    data: Any
    task_id: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())


class EventBus:
    """
    Async pub/sub event bus for inter-subsystem communication.

    Event types:
    - "reasoning.step"       -- A reasoning step was taken
    - "tool.call"            -- A tool was invoked
    - "tool.result"         -- Tool execution completed
    - "agent.spawned"       -- A new agent was created
    - "agent.complete"      -- An agent finished its task
    - "memory.stored"       -- A memory was persisted
    - "memory.retrieved"    -- Memory was retrieved
    - "plan.step_start"     -- A plan step began
    - "plan.step_complete"  -- A plan step finished
    - "plan.failed"         -- A plan step failed
    - "reflection"          -- A reflection cycle completed
    - "task.complete"       -- The entire task completed
    - "stream"              -- Generic event for WebSocket streaming
    """

    def __init__(self):
        self._subscribers: Dict[str, List[Callable]] = {}
        self._history: List[Event] = []

    def subscribe(self, event_type: str, handler: Callable[[Event], Any]):
        """Subscribe to events of a given type."""
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        self._subscribers[event_type].append(handler)

    def unsubscribe(self, event_type: str, handler: Callable):
        """Remove a specific handler."""
        if event_type in self._subscribers:
            self._subscribers[event_type] = [
                h for h in self._subscribers[event_type] if h is not handler
            ]

    async def publish(self, event_type: str, data: Any, task_id: Optional[str] = None):
        """Publish an event to all subscribers."""
        event = Event(event_type=event_type, data=data, task_id=task_id)
        self._history.append(event)
        # Keep history bounded
        if len(self._history) > 1000:
            self._history = self._history[-500:]

        handlers = self._subscribers.get(event_type, [])
        tasks = []
        for handler in handlers:
            try:
                result = handler(event)
                if asyncio.iscoroutine(result):
                    tasks.append(result)
                # Otherwise it's sync -- result ignored
            except Exception as e:
                # Don't let handler errors kill the bus
                print(f"[EventBus] Handler error on {event_type}: {e}")

        if tasks:
            await asyncio.gather(*tasks)

    def get_history(self, task_id: Optional[str] = None,
                    event_type: Optional[str] = None) -> List[Event]:
        """Get event history, optionally filtered."""
        events = self._history
        if task_id:
            events = [e for e in events if e.task_id == task_id]
        if event_type:
            events = [e for e in events if e.event_type == event_type]
        return events

    def clear_history(self, task_id: Optional[str] = None):
        """Clear event history, optionally limited to a task."""
        if task_id:
            self._history = [e for e in self._history if e.task_id != task_id]
        else:
            self._history.clear()
