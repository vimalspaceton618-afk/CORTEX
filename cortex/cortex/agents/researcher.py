"""ResearcherAgent — Deep research via Teachers + King + Knowledge Graph.

Multi-hop research: query → KG lookup → teacher query → King verify → synthesize.
"""

from .base import BaseAgent, AgentTask, AgentAction, AgentState, ActionType


class ResearcherAgent(BaseAgent):
    """
    Conducts deep research using all available knowledge sources.

    Pipeline:
    1. Search knowledge graph for existing answers
    2. Query teacher models for new insights
    3. Verify via King of Browser (ground truth)
    4. Synthesize final answer with confidence scoring
    """

    def __init__(self, **kwargs):
        super().__init__(
            name="researcher",
            description="Deep research using Teachers, King verification, and Knowledge Graph",
            capabilities=["knowledge_search", "teacher_query", "king_verify", "web_search"],
            **kwargs,
        )

    def can_handle(self, task: AgentTask) -> float:
        """Good at factual questions, explanations, comparisons."""
        query = task.query.lower()
        keywords = ["what", "how", "why", "explain", "describe", "compare", "difference",
                     "dns", "api", "protocol", "documentation", "meaning"]
        score = sum(0.15 for kw in keywords if kw in query)
        return min(1.0, max(0.1, score))

    async def step(self, state: AgentState) -> AgentAction:
        step_num = len(state.steps)

        if step_num == 0:
            # Step 1: Search knowledge graph
            return AgentAction(
                action_type=ActionType.SEARCH,
                description="Searching knowledge graph",
                content=state.task.query,
            )

        elif step_num == 1:
            # Step 2: Query council (teachers + verification)
            if self.council:
                try:
                    result = await self.council.process_question(
                        state.task.query,
                        use_verification=True,
                        store_in_knowledge=True,
                    )
                    answer = result.get("answer", "")
                    verification = result.get("verification_summary", "")
                    teachers = result.get("teachers_called", [])
                    source = result.get("source", "council")

                    # Build comprehensive response
                    parts = [answer]
                    if verification and verification != "No verification data":
                        parts.append(f"\n\n**Verification**: {verification}")
                    if teachers:
                        parts.append(f"\n**Sources**: {', '.join(teachers)}")

                    return AgentAction(
                        action_type=ActionType.RESPOND,
                        description=f"Research complete via {source} ({len(teachers)} teachers)",
                        content="\n".join(parts),
                    )
                except Exception as e:
                    return AgentAction(
                        action_type=ActionType.THINK,
                        description=f"Council query failed: {e}",
                        content=f"Error querying teachers: {e}",
                    )
            else:
                return AgentAction(
                    action_type=ActionType.RESPOND,
                    description="No council available",
                    content="Research infrastructure not initialized. Cannot query teachers.",
                )

        elif step_num == 2:
            # Step 3: If previous step was a think (error), try web search fallback
            return AgentAction(
                action_type=ActionType.TOOL_CALL,
                description="Falling back to web search",
                tool_name="web_search",
                tool_input={"query": state.task.query},
            )

        else:
            # Synthesize from whatever we have
            parts = []
            for obs in state.observations:
                parts.append(obs)
            for result in state.tool_results:
                if result.success:
                    parts.append(result.stdout[:500])

            return AgentAction(
                action_type=ActionType.RESPOND,
                description="Synthesized from available data",
                content="\n\n".join(parts) if parts else "Unable to find sufficient information.",
            )
