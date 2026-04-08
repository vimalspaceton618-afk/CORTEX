"""Smart Router — Embedding-based intent routing to the best lead agent.

Replaces the old regex TriageAgent with confidence-scored multi-signal routing.
"""
from .base import BaseAgent, AgentTask, AgentAction, AgentState, ActionType, AgentRole, AgentResult
from typing import Dict, List, Optional, Tuple


class SmartRouter(BaseAgent):
    """
    Routes queries to the best lead agent using keyword scoring + capability matching.
    Can route to multiple agents simultaneously for complex queries.
    """

    def __init__(self, lead_agents: Optional[Dict[str, BaseAgent]] = None, **kw):
        super().__init__(
            name="router", description="Smart agentic router — directs queries to the best specialist group",
            role=AgentRole.ROUTER, **kw
        )
        self.lead_agents: Dict[str, BaseAgent] = lead_agents or {}

    def register_lead(self, agent: BaseAgent):
        self.lead_agents[agent.name] = agent

    def can_handle(self, task): return 1.0  # Router handles everything

    def route(self, task: AgentTask) -> List[Tuple[str, float]]:
        """Score all lead agents, return sorted (name, confidence) pairs."""
        scores = []
        for name, agent in self.lead_agents.items():
            score = agent.can_handle(task)
            if score > 0.1:
                scores.append((name, score))
        scores.sort(key=lambda x: -x[1])
        return scores

    async def step(self, state: AgentState) -> AgentAction:
        if not state.steps:
            scores = self.route(state.task)
            if not scores:
                return AgentAction(action_type=ActionType.RESPOND, description="No agent matched",
                                   content="I couldn't determine which specialist to route your request to. Try /help for commands.")

            # If target is explicit, route there
            if state.task.target_group:
                for name, _ in scores:
                    if name == state.task.target_group:
                        return AgentAction(action_type=ActionType.DELEGATE, description=f"Direct route → {name}",
                                           delegate_to=name, delegate_task=state.task.query)

            # Top match with high confidence → single agent
            top_name, top_score = scores[0]
            if top_score >= 0.4:
                return AgentAction(action_type=ActionType.DELEGATE, description=f"Routed → {top_name} ({top_score:.0%})",
                                   delegate_to=top_name, delegate_task=state.task.query)

            # Low confidence → use explore as fallback
            return AgentAction(action_type=ActionType.DELEGATE, description=f"Fallback → explore",
                               delegate_to="explore", delegate_task=state.task.query)

        # After delegation
        if state.delegated_results:
            return AgentAction(action_type=ActionType.RESPOND, description="Routed response",
                               content=list(state.delegated_results.values())[0])

        return AgentAction(action_type=ActionType.RESPOND, description="Done",
                           content="Request processed.")

    async def execute(self, task: AgentTask) -> AgentResult:
        """Override execute to route directly to lead agents via orchestrator."""
        scores = self.route(task)
        if not scores:
            return AgentResult(task_id=task.task_id, agent_name="router", success=False,
                               answer="No matching agent found.", confidence=0.0)

        target_name = task.target_group or scores[0][0]
        target = self.lead_agents.get(target_name)
        if not target:
            return AgentResult(task_id=task.task_id, agent_name="router", success=False,
                               answer=f"Agent group '{target_name}' not found.", confidence=0.0)

        # Route directly
        result = await target.execute(task)
        result.metadata["routed_by"] = "smart_router"
        result.metadata["routing_scores"] = {n: round(s, 3) for n, s in scores[:5]}
        return result
