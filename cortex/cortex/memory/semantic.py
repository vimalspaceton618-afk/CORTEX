"""Semantic Memory for CORTEX -- wraps existing KnowledgeGraph for facts/concepts."""

from typing import List, Dict, Any, Optional


class SemanticMemory:
    """
    Facts and concepts. Directly wraps the existing KnowledgeGraph
    for read access -- zero new storage, maximum reuse.

    Extracts and returns structured concept-level knowledge
    rather than raw Q&A pairs.
    """

    def __init__(self, knowledge_graph):
        self.kg = knowledge_graph

    async def retrieve(self, query: str, k: int = 10) -> List[Dict]:
        """Search the knowledge graph for relevant facts."""
        results = await self.kg.search(query, k=k, threshold=0.7)
        return results or []

    async def extract_concepts(self, text: str) -> List[Dict[str, str]]:
        """
        Extract key concepts/facts from arbitrary text.
        Returns list of {concept, description} dicts.

        This is a simplified extractor -- in production, use an LLM
        via the council to do better extraction.
        """
        # Simple heuristic: extract sentences that look like definitions/facts
        sentences = [s.strip() for s in text.replace('\n', '. ').split('.') if s.strip()]
        concepts = []

        indicator_phrases = [
            'is a', 'is the', 'refers to', 'defines', 'means',
            'consists of', 'comprises', 'describes', 'implements',
        ]

        for sentence in sentences:
            if len(sentence) < 20 or len(sentence) > 300:
                continue
            lower = sentence.lower()
            if any(phrase in lower for phrase in indicator_phrases):
                # Try to extract subject
                words = sentence.split()
                concept_name = ' '.join(words[:3]) if len(words) >= 3 else words[0]
                concepts.append({
                    'concept': concept_name,
                    'description': sentence,
                })

        return concepts[:10]

    async def get_top_topics(self, n: int = 10) -> List[tuple]:
        """Get the most common topics in the knowledge graph."""
        stats = self.kg.get_stats()
        return stats.get('top_topics', [])[:n]

    async def count(self) -> int:
        """Count entries in semantic memory (same as KG count)."""
        return self.kg.count()
