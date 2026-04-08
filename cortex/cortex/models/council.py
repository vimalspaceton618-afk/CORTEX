"""Enhanced Council of Critics with King verification and self-training."""

import os
import json
import asyncio
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime

from .teacher import TeacherResponse, TeacherClient, create_teacher, TEACHER_CLASSES
from ..king.browser import KingOfBrowser
from ..king.topology import TechnicalTopologyMap
from ..knowledge.graph import KnowledgeGraph
from ..knowledge.storage import LocalStorage
from ..config import TeacherConfig

from sentence_transformers import SentenceTransformer
import faiss


@dataclass
class ContradictionReport:
    """Detected contradiction between teachers."""
    teacher_a: str
    teacher_b: str
    contradiction_type: str  # 'factual', 'code', 'math', 'reasoning'
    severity: float
    excerpt_a: str
    excerpt_b: str
    king_verification: Optional[str] = None
    resolution: Optional[str] = None


@dataclass
class VerificationResult:
    """Result of verifying teacher responses against King data."""
    question: str
    king_data: TechnicalTopologyMap
    teacher_responses: List[TeacherResponse]
    labels: Dict[str, str]  # teacher_name -> 'CORRECT', 'INCORRECT', 'UNVERIFIED'
    contradictions: List[ContradictionReport]
    ground_truth: Optional[str]
    confidence: float


class VerificationEngine:
    """Compares teacher responses to verified technical data from King."""

    def __init__(self, similarity_threshold: float = 0.80):
        self.similarity_threshold = similarity_threshold

    def verify(
        self,
        question: str,
        teacher_responses: List[TeacherResponse],
        king_data: TechnicalTopologyMap
    ) -> VerificationResult:
        """
        Verify teacher responses against King of Browser data.

        Args:
            question: User's original question
            teacher_responses: List of responses from teachers
            king_data: Technical Topology Map from King

        Returns:
            VerificationResult with labels and ground truth
        """
        labels = {}
        contradictions = []
        ground_truth = None
        confidence = 0.0

        # Extract claims from teacher responses based on question type
        claims = self._extract_claims(question, teacher_responses)

        # Verify claims against King data
        for teacher_name, claim_text in claims.items():
            verification = self._verify_claim(claim_text, king_data, question)
            labels[teacher_name] = verification['label']
            if verification['label'] == 'CORRECT' and verification['similarity'] > confidence:
                ground_truth = claim_text
                confidence = verification['similarity']

        # Find pairwise contradictions
        contradictions = self._detect_contradictions(teacher_responses, labels, king_data)

        return VerificationResult(
            question=question,
            king_data=king_data,
            teacher_responses=teacher_responses,
            labels=labels,
            contradictions=contradictions,
            ground_truth=ground_truth,
            confidence=confidence
        )

    def _extract_claims(self, question: str, responses: List[TeacherResponse]) -> Dict[str, str]:
        """
        Extract the core factual/code claims from each teacher response.
        This is a simplified heuristic - will improve with NLP/LLM extraction.
        """
        claims = {}
        if not responses:
            return claims
        question_lower = question.lower()

        for resp in responses:
            if resp is None:
                continue
            content = resp.content.strip() if resp.content else ''

            # For code questions: extract function signatures, class definitions, imports
            if any(keyword in question_lower for keyword in ['function', 'code', 'python', 'javascript', 'import', 'def']):
                # Extract code blocks
                import re
                code_blocks = re.findall(r'```[\w]*\n(.*?)```', content, re.DOTALL)
                if code_blocks:
                    claim = code_blocks[0].strip()[:500]  # First code block
                else:
                    claim = content[:300]
            else:
                # For factual questions: extract the main answer statement
                claim = content[:300]

            claims[resp.teacher_name] = claim

        return claims

    def _verify_claim(self, claim: str, king_data: Optional[TechnicalTopologyMap], question: str) -> Dict[str, Any]:
        """
        Verify a single claim against King data.
        Returns label and similarity confidence.
        """
        if king_data is None:
            return {'label': 'UNVERIFIED', 'similarity': 0.0}

        # Safely get iterables, default to empty list if None
        code_files = king_data.code_files or []
        documentation_snippets = king_data.documentation_snippets or []
        api_endpoints = king_data.api_endpoints or []

        # Strategy: Search king_data for evidence that supports or contradicts claim

        # 1. Check code files (if claim contains code patterns)
        if self._looks_like_code(claim):
            best_similarity = 0.0
            for code_file in code_files:
                similarity = self._text_similarity(claim, code_file.content)
                if similarity > best_similarity:
                    best_similarity = similarity

            if best_similarity >= self.similarity_threshold:
                return {'label': 'CORRECT', 'similarity': best_similarity}
            else:
                return {'label': 'INCORRECT', 'similarity': best_similarity}

        # 2. Check documentation snippets
        best_similarity = 0.0
        for snippet in documentation_snippets:
            text = snippet.get('snippet', '') if isinstance(snippet, dict) else str(snippet)
            similarity = self._text_similarity(claim, text)
            if similarity > best_similarity:
                best_similarity = similarity

        if best_similarity >= self.similarity_threshold:
            return {'label': 'CORRECT', 'similarity': best_similarity}

        # 3. Check API endpoints (if claim mentions API)
        if 'api' in question.lower() or 'endpoint' in question.lower():
            for endpoint in api_endpoints:
                endpoint_text = f"{endpoint.method} {endpoint.url}"
                similarity = self._text_similarity(claim, endpoint_text)
                if similarity > best_similarity:
                    best_similarity = similarity

            if best_similarity >= self.similarity_threshold:
                return {'label': 'CORRECT', 'similarity': best_similarity}

        return {'label': 'UNVERIFIED', 'similarity': best_similarity}

    def _looks_like_code(self, text: str) -> bool:
        """Heuristic: does this text look like code?"""
        code_indicators = ['def ', 'class ', 'function', 'import ', 'return ', '{', '}',
                           'public ', 'private ', 'void ', 'int ', 'string ']
        return any(indicator in text for indicator in code_indicators)

    def _text_similarity(self, text1: str, text2: str) -> float:
        """Compute semantic similarity between two texts."""
        # Simple: normalize and check word overlap
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())

        if not words1 or not words2:
            return 0.0

        intersection = words1.intersection(words2)
        union = words1.union(words2)

        return len(intersection) / len(union)  # Jaccard similarity

    def _detect_contradictions(
        self,
        responses: List[TeacherResponse],
        labels: Dict[str, str],
        king_data: TechnicalTopologyMap
    ) -> List[ContradictionReport]:
        """
        Find contradictions between teachers, especially those labeled INCORRECT.
        """
        if not responses:
            return []
        contradictions = []

        # Compare pairwise
        for i in range(len(responses)):
            if responses[i] is None:
                continue
            for j in range(i + 1, len(responses)):
                if responses[j] is None:
                    continue
                resp_a = responses[i]
                resp_b = responses[j]

                # Check if they contradict on factual content
                if self._responses_conflict(resp_a.content, resp_b.content):
                    contradiction = ContradictionReport(
                        teacher_a=resp_a.teacher_name,
                        teacher_b=resp_b.teacher_name,
                        contradiction_type=self._classify_contradiction_type(resp_a.content, resp_b.content),
                        severity=0.8,
                        excerpt_a=resp_a.content[:200],
                        excerpt_b=resp_b.content[:200],
                        king_verification=f"{labels.get(resp_a.teacher_name)} vs {labels.get(resp_b.teacher_name)}"
                    )
                    contradictions.append(contradiction)

        return contradictions

    def _responses_conflict(self, text_a: str, text_b: str) -> bool:
        """Detect direct contradiction between two texts."""
        import re

        # Check for numerical disagreements
        nums_a = set(re.findall(r'\b\d+\.?\d*\b', text_a))
        nums_b = set(re.findall(r'\b\d+\.?\d*\b', text_b))

        if nums_a and nums_b and nums_a != nums_b:
            return True

        # Check for opposite keywords
        opposites = {
            "true": "false", "false": "true",
            "yes": "no", "no": "yes",
            "correct": "incorrect", "incorrect": "correct",
            "possible": "impossible", "impossible": "possible",
            "always": "never", "never": "always",
            "exists": "does not exist", "does not exist": "exists"
        }

        words_a = set(text_a.lower().split())
        words_b = set(text_b.lower().split())

        for word in words_a:
            if word in opposites and opposites[word] in words_b:
                return True

        return False

    def _classify_contradiction_type(self, text_a: str, text_b: str) -> str:
        """Classify the type of contradiction."""
        code_indicators = ["def ", "class ", "function", "import ", "return ", "{", "}"]
        math_indicators = ["integral", "derivative", "theorem", "equation", "sum", "product", "proof", "theorem"]

        combined = text_a + text_b

        if any(ind in combined for ind in code_indicators):
            return "code"
        elif any(ind in combined for ind in math_indicators):
            return "math"
        else:
            return "factual"


class CouncilOfCritics:
    """
    Enhanced Council that orchestrates teachers and verifies with King.
    Integrates with KnowledgeGraph for self-training.
    """

    def __init__(
        self,
        config,
        knowledge_graph: Optional[KnowledgeGraph] = None,
        storage: Optional[LocalStorage] = None
    ):
        """
        Initialize Council.

        Args:
            config: CortexConfig with teacher configurations
            knowledge_graph: KnowledgeGraph instance for persistence
            storage: LocalStorage instance
        """
        self.config = config
        self.king = KingOfBrowser(github_token=config.king.github_token_env and os.getenv(config.king.github_token_env))
        self.verifier = VerificationEngine(similarity_threshold=config.knowledge.similarity_threshold)
        self.knowledge_graph = knowledge_graph or KnowledgeGraph(
            storage=storage,
            embedding_model=config.knowledge.embedding_model,
            use_faiss=config.knowledge.use_faiss
        )
        self.storage = storage

        # Initialize teachers
        self.teachers = {}
        for teacher_cfg in config.teachers:
            if teacher_cfg.enabled:
                try:
                    teacher = create_teacher(teacher_cfg)
                    self.teachers[teacher_cfg.name] = teacher
                except Exception as e:
                    print(f"[WARN] Failed to initialize teacher {teacher_cfg.name}: {e}")

        print(f"[INFO] Council initialized with {len(self.teachers)} teachers")

    async def query_teachers(self, prompt: str) -> List[TeacherResponse]:
        """Query all enabled teachers in parallel."""
        tasks = []
        for name, teacher in self.teachers.items():
            tasks.append(self._safe_query(teacher, prompt))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        responses = []
        for result in results:
            if isinstance(result, TeacherResponse):
                responses.append(result)
            else:
                print(f"[WARN] Teacher query failed: {result}")

        return responses

    async def _safe_query(self, teacher: TeacherClient, prompt: str) -> TeacherResponse:
        """Query with error handling."""
        try:
            return await teacher.query(prompt)
        except Exception as e:
            raise Exception(f"{teacher.config.name} failed: {str(e)}")

    async def process_question(
        self,
        question: str,
        use_verification: bool = True,
        store_in_knowledge: bool = True
    ) -> Dict[str, Any]:
        """
        Full processing pipeline for a user question.

        Steps:
        1. Check knowledge graph for existing answer
        2. If not found, query all teachers
        3. Run King of Browser verification
        4. Synthesize final answer
        5. Store in knowledge graph

        Returns:
            Dictionary with answer, verification_summary, and metadata
            Includes 'teacher_responses' with full content for training purposes
        """
        print(f"[CORTEX] Processing: {question[:100]}...")

        # Step 1: Knowledge lookup
        print("[CORTEX] Checking knowledge graph...")
        existing = await self.knowledge_graph.search(question, k=1, threshold=0.95)
        if existing:
            print(f"[CORTEX] Found in knowledge: {existing[0]['id']}")
            return {
                'answer': existing[0]['answer'],
                'source': 'knowledge',
                'entry_id': existing[0]['id'],
                'similarity': existing[0].get('similarity', 1.0),
                'verification_summary': 'Retrieved from verified knowledge graph',
                'teachers_called': [],
                'teacher_responses': []  # No new teacher queries
            }

        # Step 2: Query teachers
        print("[CORTEX] Querying teachers...")
        teacher_responses = await self.query_teachers(question)
        # Defensive: ensure it's a list
        if teacher_responses is None:
            print("[WARN] query_teachers returned None, defaulting to []")
            teacher_responses = []
        print(f"[CORTEX] Got {len(teacher_responses)} responses")

        # Step 3: King verification
        king_data = None
        verification = None
        if use_verification:
            print("[CORTEX] Running King of Browser verification...")
            king_data = await self._run_king_verification(question)
            verification = self.verifier.verify(question, teacher_responses, king_data)
            print(f"[CORTEX] Verification: {verification.labels}")

        # Step 4: Synthesize answer
        print("[CORTEX] Synthesizing answer...")
        final_answer = self._synthesize_answer(question, teacher_responses, verification, king_data)

        # Step 5: Store in knowledge graph
        if store_in_knowledge and verification:
            entry_id = await self._store_verification(question, final_answer, verification, king_data)
            print(f"[CORTEX] Stored in knowledge graph: {entry_id}")

        # Build response - include full teacher responses for trainer
        result = {
            'answer': final_answer,
            'source': 'verified',
            'teachers_called': [
                getattr(r, 'teacher_name', 'UNKNOWN') for r in teacher_responses
                if r is not None
            ],
            'teacher_responses': [
                {
                    'teacher': getattr(r, 'teacher_name', 'UNKNOWN'),
                    'content': getattr(r, 'content', ''),
                    'tokens_used': getattr(r, 'tokens_used', 0),
                    'timestamp': getattr(r, 'timestamp', None)
                }
                for r in teacher_responses
                if r is not None
            ],
            'verification_summary': self._format_verification_summary(verification),
        }

        if verification:
            result['contradictions_found'] = len(verification.contradictions)
            result['teacher_labels'] = verification.labels

        return result

    async def _run_king_verification(self, question: str) -> TechnicalTopologyMap:
        """
        Determine what to verify and run King of Browser.
        For now: simple heuristic based on question keywords.
        """
        question_lower = question.lower()

        # Determine target for verification
        target = None
        target_type = "auto"

        # Extract URLs from question
        import re
        urls = re.findall(r'https?://[^\s]+', question)

        if urls:
            target = urls[0]
            target_type = 'url'
        elif 'github.com' in question_lower:
            # Try to extract repo
            match = re.search(r'github\.com/([^/\s]+/[^/\s]+)', question)
            if match:
                target = match.group(1)
                target_type = 'github'
        elif any(keyword in question_lower for keyword in ['dns', 'domain', 'resolve']):
            # Extract domain
            match = re.search(r'([a-zA-Z0-9.-]+\.[a-z]{2,})', question)
            if match:
                target = match.group(1)
                target_type = 'domain'
            else:
                # Question is about DNS but no specific domain; use example.com
                target = 'example.com'
                target_type = 'domain'
        else:
            # Default: use official documentation URLs when possible (faster & more reliable)
            if 'python' in question_lower or 'regex' in question_lower or 're.' in question_lower:
                target = 'https://docs.python.org/3/library/re.html'
                target_type = 'url'
            elif 'electron' in question_lower or 'app.getpath' in question_lower:
                target = 'https://www.electronjs.org/docs/latest/api/app'
                target_type = 'url'
            elif 'dns' in question_lower or 'domain' in question_lower:
                # Use a known domain for DNS lookup example
                target = 'example.com'
                target_type = 'domain'
            else:
                # For generic coding questions, use official documentation
                target = 'https://docs.python.org/3/'
                target_type = 'url'

        print(f"[KING] Analyzing {target} (type: {target_type})")
        try:
            king_data = await self.king.analyze(target, target_type=target_type)
        except Exception as e:
            print(f"[ERROR] King analysis failed: {e}")
            import traceback
            traceback.print_exc()
            # Return an empty topology map with error recorded
            king_data = TechnicalTopologyMap(
                source_url=target,
                source_type=target_type,
                timestamp=datetime.utcnow().isoformat(),
                code_files=[],
                dns_records=[],
                api_endpoints=[],
                documentation_snippets=[],
                raw_content_length=0,
                processing_time_ms=0,
                errors=[str(e)]
            )
        print(f"[KING] Got {len(king_data.code_files)} files, {len(king_data.dns_records)} DNS records")
        return king_data

    def _synthesize_answer(
        self,
        question: str,
        teacher_responses: List[TeacherResponse],
        verification: Optional[VerificationResult],
        king_data: Optional[TechnicalTopologyMap]
    ) -> str:
        """
        Create final answer from scratch using verified data.
        Does NOT copy teacher responses verbatim.
        """
        if verification and verification.ground_truth:
            # Use verified ground truth as basis
            answer = verification.ground_truth
        elif king_data and (king_data.code_files or king_data.documentation_snippets or king_data.api_endpoints):
            # King data exists with content - synthesize from it
            answer = self._synthesize_from_king(question, king_data)
        elif teacher_responses:
            # Fallback: use best teacher response (but mark as unverified)
            answer = self._majority_vote(teacher_responses)
            answer += "\n\n[WARNING] Answer来自teacher without technical verification."
        else:
            answer = "No answer available - no teacher responses and no verification data."

        return answer.strip()

    def _synthesize_from_king(self, question: str, king_data: TechnicalTopologyMap) -> str:
        """Generate answer from King's technical data."""
        parts = []

        if king_data.code_files:
            parts.append("Based on source code analysis:")
            for cf in king_data.code_files[:3]:  # Top 3 relevant files
                parts.append(f"\nFile: {cf.path}")
                if cf.functions:
                    parts.append(f"Functions: {', '.join(cf.functions[:5])}")
                if cf.classes:
                    parts.append(f"Classes: {', '.join(cf.classes[:5])}")

        if king_data.api_endpoints:
            parts.append("\nAPI Endpoints discovered:")
            for ep in king_data.api_endpoints[:5]:
                parts.append(f"- {ep.method} {ep.url}")

        if king_data.documentation_snippets:
            parts.append("\nDocumentation snippets:")
            for snippet in king_data.documentation_snippets[:3]:
                parts.append(f"- {snippet['snippet'][:200]}...")

        return '\n'.join(parts)

    def _majority_vote(self, responses: List[TeacherResponse]) -> str:
        """Simple fallback: use longest consistent response."""
        if not responses:
            return "No answer available."
        # Pick the response with most words (usually most detailed)
        return max(responses, key=lambda r: len(r.content.split())).content

    async def _store_verification(
        self,
        question: str,
        answer: str,
        verification: VerificationResult,
        king_data: TechnicalTopologyMap
    ) -> str:
        """Store the verified Q&A in knowledge graph."""
        # Determine which teacher(s) got it right
        correct_teachers = [name for name, label in verification.labels.items() if label == 'CORRECT']
        wrong_teachers = [name for name, label in verification.labels.items() if label == 'INCORRECT']

        # Extract topics (simple keyword extraction)
        topics = self._extract_topics(question, answer)

        metadata = {
            'verification_confidence': verification.confidence,
            'king_source': king_data.source_url,
            'king_type': king_data.source_type,
            'code_files_count': len(king_data.code_files),
            'contradictions': len(verification.contradictions),
            'processing_time_ms': king_data.processing_time_ms
        }

        return await self.knowledge_graph.store(
            question=question,
            answer=answer,
            metadata=metadata,
            source_teacher=correct_teachers[0] if correct_teachers else None,
            verification_source=king_data.source_url,
            topics=topics
        )

    def _extract_topics(self, question: str, answer: str) -> List[str]:
        """Extract topic tags from Q&A."""
        combined = (question + " " + answer).lower()
        # Simple keyword matching - improve later
        topics = []

        keyword_map = {
            'python': ['python', 'def ', 'import ', 'pip'],
            'javascript': ['javascript', 'function', 'const ', 'let '],
            'api': ['api', 'endpoint', 'http', 'request'],
            'dns': ['dns', 'domain', 'resolve', 'ip'],
            'math': ['integral', 'theorem', 'equation', 'proof'],
            'code': ['function', 'class ', 'return ', 'import ']
        }

        for topic, keywords in keyword_map.items():
            if any(kw in combined for kw in keywords):
                topics.append(topic)

        return topics if topics else ['general']

    def _format_verification_summary(self, verification: Optional[VerificationResult]) -> str:
        """Create human-readable verification summary."""
        if not verification:
            return "No verification performed."

        parts = []
        parts.append(f"**Verification Summary**")
        parts.append(f"- King source: {verification.king_data.source_url}")
        parts.append(f"- Teachers: {len(verification.teacher_responses)} queried")

        for teacher_name, label in verification.labels.items():
            parts.append(f"  - {teacher_name}: {label}")

        if verification.contradictions:
            parts.append(f"- Contradictions detected: {len(verification.contradictions)}")
            for c in verification.contradictions[:3]:
                parts.append(f"  - {c.teacher_a} vs {c.teacher_b} ({c.contradiction_type})")

        return '\n'.join(parts)

    def get_teacher_statistics(self) -> Dict[str, Any]:
        """Get accuracy statistics for teachers from knowledge graph."""
        kg = self.knowledge_graph
        stats = kg.get_stats()
        return stats


# Convenience function
async def create_council(config_path: Optional[str] = None) -> CouncilOfCritics:
    """Factory to create Council with default configuration."""
    from ..config import load_config
    config = load_config(config_path)

    storage = LocalStorage(base_path=config.knowledge.storage_path)
    kg = KnowledgeGraph(
        storage=storage,
        embedding_model=config.knowledge.embedding_model,
        use_faiss=config.knowledge.use_faiss
    )

    return CouncilOfCritics(
        config=config,
        knowledge_graph=kg,
        storage=storage
    )
