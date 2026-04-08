"""TriageAgent — Routes queries to specialist agents.

The gateway agent. Analyzes user intent and dispatches
to the best specialist (researcher, coder, verifier, planner, architect).
"""

import re
from .base import BaseAgent, AgentTask, AgentAction, AgentState, ActionType


# Intent detection keywords
INTENT_PATTERNS = {
    "coder": [
        r"\b(write|code|implement|function|class|script|program|debug|fix|refactor)\b",
        r"\b(python|javascript|rust|bash|powershell|typescript|node)\b",
        r"```", r"\bdef\b", r"\bfunction\b", r"\bconst\b",
    ],
    "researcher": [
        r"\b(what|how|why|explain|describe|compare|difference|meaning)\b",
        r"\b(docs|documentation|tutorial|guide|reference)\b",
        r"\b(dns|api|http|rest|graphql|oauth)\b",
    ],
    "verifier": [
        r"\b(verify|check|validate|confirm|is it true|fact.check|correct)\b",
        r"\b(accurate|reliable|trustworthy|source)\b",
    ],
    "planner": [
        r"\b(plan|steps|roadmap|strategy|breakdown|decompose|workflow)\b",
        r"\b(project|milestone|phase|stage|timeline)\b",
    ],
    "architect": [
        r"\b(design|architect|structure|system|scale|infrastructure)\b",
        r"\b(database|microservice|monolith|pattern|diagram)\b",
    ],
}


class TriageAgent(BaseAgent):
    """
    Routes user queries to the best specialist agent.

    Decision process:
    1. Keyword/pattern matching for quick intent detection
    2. If ambiguous, asks council for classification
    3. Can invoke multiple agents for complex queries
    4. Merges results if multi-agent dispatch
    """

    def __init__(self, **kwargs):
        super().__init__(
            name="triage",
            description="Analyzes queries and routes to specialist agents",
            capabilities=["intent_detection", "multi_agent_dispatch"],
            **kwargs,
        )

    def can_handle(self, task: AgentTask) -> float:
        """Triage can handle everything — it's the default router."""
        return 0.9

    def _detect_intent(self, query: str) -> dict:
        """Score each agent's relevance to the query."""
        scores = {}
        query_lower = query.lower()

        for agent, patterns in INTENT_PATTERNS.items():
            score = 0
            for pattern in patterns:
                matches = re.findall(pattern, query_lower, re.IGNORECASE)
                score += len(matches) * 0.15
            scores[agent] = min(1.0, score)

        return scores

    async def step(self, state: AgentState) -> AgentAction:
        """
        Triage step logic:
        Step 0: Analyze intent → decide target agent
        Step 1: Delegate to target agent
        Step 2: Return delegated result
        """
        step_num = len(state.steps)

        if step_num == 0:
            # Analyze intent
            scores = self._detect_intent(state.task.query)
            best_agent = max(scores, key=scores.get) if scores else "researcher"
            best_score = scores.get(best_agent, 0)

            # If very low score on everything, default to researcher
            if best_score < 0.1:
                best_agent = "researcher"

            return AgentAction(
                action_type=ActionType.DELEGATE,
                description=f"Routing to {best_agent} (score: {best_score:.2f})",
                delegate_to=best_agent,
                delegate_task=state.task.query,
                content=f"Intent analysis: {scores}",
            )

        elif step_num == 1:
            # Check if delegation returned a result
            if state.delegated_results:
                results = list(state.delegated_results.values())
                answer = results[0] if results else "No result from delegated agent."
                return AgentAction(
                    action_type=ActionType.RESPOND,
                    description="Returning delegated result",
                    content=answer,
                )

            # No delegation result — fall back to direct council query
            return AgentAction(
                action_type=ActionType.RESPOND,
                description="Fallback response",
                content="I wasn't able to route this query to a specialist. Please try rephrasing.",
            )

        else:
            # Should not reach here
            return AgentAction(
                action_type=ActionType.RESPOND,
                description="Final response",
                content=state.observations[-1] if state.observations else "Processing complete.",
            )
