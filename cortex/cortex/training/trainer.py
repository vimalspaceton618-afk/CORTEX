"""CORTEX Self-Training Loop with comprehensive statistics."""

import asyncio
import time
import traceback
import logging
import sys
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import json
from pathlib import Path


def _setup_godmode_logging():
    """Configure detailed logging and global exception hook for godmode."""
    logging.basicConfig(
        level=logging.DEBUG,
        format='[%(asctime)s] %(levelname)s %(name)s %(funcName)s:%(lineno)d - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    logging.getLogger().setLevel(logging.DEBUG)

    def _global_excepthook(exc_type, exc_value, exc_tb):
        print(f"\n{'='*70}")
        print("UNCAUGHT EXCEPTION (GODMODE)")
        print(f"{'='*70}")
        traceback.print_exception(exc_type, exc_value, exc_tb)
        print(f"{'='*70}\n")
    sys.excepthook = _global_excepthook
    print("[GODMODE] Debug logging and global exception hook enabled")

from ..config import load_config
from ..models.council import create_council
from ..knowledge.storage import LocalStorage
from ..knowledge.graph import KnowledgeGraph
from ..knowledge.generator import generate_training_questions


@dataclass
class TrainingStats:
    """Statistics for a training session."""
    start_time: str
    end_time: Optional[str] = None
    total_iterations: int = 0
    questions_asked: int = 0
    knowledge_before: int = 0
    knowledge_after: int = 0
    teacher_queries: int = 0
    teacher_errors: int = 0
    king_queries: int = 0
    contradictions_found: int = 0
    mistakes_registered: int = 0
    errors: List[str] = None
    groq_full_responses: List[Dict[str, Any]] = None  # Store full GROQ responses

    def __post_init__(self):
        if self.errors is None:
            self.errors = []
        if self.groq_full_responses is None:
            self.groq_full_responses = []

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def duration(self) -> Optional[timedelta]:
        if self.end_time:
            start = datetime.fromisoformat(self.start_time)
            end = datetime.fromisoformat(self.end_time)
            return end - start
        return None


class CORTEXTrainer:
    """
    Self-training loop for CORTEX.
    Continuously asks questions, verifies with King, stores knowledge.
    """

    def __init__(
        self,
        config_path: Optional[str] = None,
        stats_file: Optional[str] = None,
        batch_size: int = 10,
        godmode: bool = False
    ):
        self.config = load_config(config_path)
        self.batch_size = batch_size
        self.godmode = godmode

        # Storage paths
        self.stats_file = Path(stats_file or f"Z:/cortex_data/training_stats_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json")
        self.full_log_file = Path("Z:/cortex_data/full_training_log.jsonl")

        # Will be initialized in async context
        self.council = None
        self.storage = None
        self.kg = None
        self.stats = None

    async def initialize(self):
        """Initialize CORTEX components."""
        print("[TRAINER] Initializing CORTEX components...")
        if self.godmode:
            _setup_godmode_logging()
            print("[TRAINER] GODMODE ENABLED")

        self.storage = LocalStorage(base_path=self.config.knowledge.storage_path)
        self.kg = KnowledgeGraph(
            storage=self.storage,
            embedding_model=self.config.knowledge.embedding_model,
            use_faiss=self.config.knowledge.use_faiss
        )
        self.council = await create_council()

        # Initialize stats
        initial_count = self.kg.count()
        self.stats = TrainingStats(
            start_time=datetime.utcnow().isoformat(),
            knowledge_before=initial_count
        )
        # Accurate start time for elapsed measurements
        self._start_timestamp = time.time()

        print(f"[TRAINER] Knowledge graph has {initial_count} entries")
        print(f"[TRAINER] Active teachers: {list(self.council.teachers.keys())}")
        print(f"[TRAINER] Training stats will be saved to: {self.stats_file}")

    async def train_iteration(self, question: str) -> Dict[str, Any]:
        """
        Run one training iteration: ask question, verify, store.

        Returns:
            Dict with iteration results including full GROQ response
        """
        result = {
            'question': question,
            'timestamp': datetime.utcnow().isoformat(),
            'success': False,
            'answer': None,
            'teacher_responses': [],
            'king_used': False,
            'contradictions': 0,
            'error': None
        }

        try:
            # Process question through CORTEX
            council_result = await self.council.process_question(
                question,
                use_verification=True,
                store_in_knowledge=True
            )

            # Defensive: Ensure teacher_responses in council_result is a list
            if 'teacher_responses' not in council_result or council_result['teacher_responses'] is None:
                if self.godmode:
                    print("[GODMODE] council_result missing teacher_responses or None, fixing")
                council_result['teacher_responses'] = []

            # Update stats
            teachers_called = council_result.get('teachers_called', [])
            if teachers_called is None:
                teachers_called = []
            self.stats.teacher_queries += len(teachers_called)
            self.stats.king_queries += 1  # We assume King was called

            result['answer'] = council_result.get('answer', '')
            result['teacher_responses'] = council_result.get('teacher_responses', [])
            # Double-check: ensure result teacher_responses not None
            if result['teacher_responses'] is None:
                if self.godmode:
                    print("[GODMODE] result teacher_responses became None after get, fixing")
                result['teacher_responses'] = []
            result['king_used'] = council_result.get('source') == 'verified'
            result['contradictions'] = council_result.get('contradictions_found', 0)

            # Extract GROQ full response if present
            groq_response = None
            for tr in result['teacher_responses']:
                if tr.get('teacher') == 'GroqLlama':
                    groq_response = tr.get('content', '')
                    break
            if groq_response:
                result['groq_full_response'] = groq_response  # Full, untruncated

            result['success'] = True
            self.stats.questions_asked += 1
            self.stats.contradictions_found += result['contradictions']

        except Exception as e:
            error_msg = f"Iteration failed for '{question[:50]}...': {str(e)}"
            print(f"[ERROR] {error_msg}")
            if self.godmode:
                print("[ERROR] Full traceback:")
                traceback.print_exc()
            result['error'] = error_msg
            result['error_traceback'] = traceback.format_exc()
            self.stats.errors.append(error_msg)

        # Log full result to disk (append)
        self._log_iteration(result)

        return result

    def _log_iteration(self, result: Dict[str, Any]):
        """Append iteration result to log file."""
        try:
            with open(self.full_log_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(result, ensure_ascii=False) + '\n')
        except Exception as e:
            print(f"[WARN] Failed to log iteration: {e}")

    async def train_batch(self, questions: List[str]) -> List[Dict[str, Any]]:
        """
        Train on a batch of questions.

        Args:
            questions: List of questions to process

        Returns:
            List of iteration results
        """
        results = []
        total = len(questions)

        print(f"\n{'='*70}")
        print(f"TRAINING BATCH: {total} questions")
        print(f"{'='*70}")

        for i, question in enumerate(questions, 1):
            print(f"\r[{i}/{total}] {question[:60]}...", end='', flush=True)

            result = await self.train_iteration(question)
            results.append(result)

            # Small delay to avoid rate limits
            await asyncio.sleep(0.5)

        print(f"\nBatch complete. {len([r for r in results if r['success']])}/{total} successful")

        # Update final knowledge count
        self.stats.knowledge_after = self.kg.count()
        self.stats.total_iterations += len(questions)

        return results

    async def train_continuous(
        self,
        duration_minutes: Optional[int] = None,
        max_iterations: Optional[int] = None,
        question_generator=None
    ):
        """
        Run continuous training loop.

        Args:
            duration_minutes: How long to train (None = infinite)
            max_iterations: Maximum number of questions (None = infinite)
            question_generator: Optional custom generator function
        """
        print("\n" + "="*70)
        print("CORTEX CONTINUOUS TRAINING")
        print("="*70)

        start_time = time.time()
        iteration = 0

        try:
            while True:
                iteration += 1

                # Check stop conditions
                if max_iterations and iteration > max_iterations:
                    print(f"\n[STOP] Reached max iterations: {max_iterations}")
                    break

                if duration_minutes:
                    elapsed = (time.time() - start_time) / 60
                    if elapsed >= duration_minutes:
                        print(f"\n[STOP] Duration limit reached: {duration_minutes} minutes")
                        break

                # Generate batch of questions
                if question_generator:
                    questions = question_generator(self.batch_size)
                else:
                    # Use built-in generator with curriculum
                    kg_count = self.kg.count()
                    stage = self._get_curriculum_stage(kg_count)
                    questions = generate_training_questions(
                        count=self.batch_size,
                        knowledge_graph=self.kg
                    )

                # Run batch
                results = await self.train_batch(questions)

                # Print periodic summary
                if iteration % 5 == 0:
                    self._print_summary()

                # Save stats periodically
                if iteration % 10 == 0:
                    self._save_stats()

                # Short pause between batches
                await asyncio.sleep(2)

        except KeyboardInterrupt:
            print("\n[STOP] Training interrupted by user")
        finally:
            # Final save
            self.stats.end_time = datetime.utcnow().isoformat()
            self._save_stats()
            self._print_final_summary()

    def _get_curriculum_stage(self, knowledge_size: int) -> str:
        """Determine curriculum based on current knowledge."""
        if knowledge_size < 100:
            return 'beginner'
        elif knowledge_size < 1000:
            return 'intermediate'
        elif knowledge_size < 10000:
            return 'advanced'
        else:
            return 'expert'

    def _print_summary(self):
        """Print current training summary."""
        current_kg = self.kg.count()
        elapsed = time.time() - getattr(self, '_start_timestamp', time.time())

        print(f"\n{'─'*70}")
        print("TRAINING SUMMARY")
        print(f"{'─'*70}")
        print(f"Questions processed: {self.stats.questions_asked}")
        print(f"Knowledge entries: {self.stats.knowledge_before} → {current_kg} (+{current_kg - self.stats.knowledge_before})")
        print(f"Teacher queries: {self.stats.teacher_queries}")
        print(f"King queries: {self.stats.king_queries}")
        print(f"Contradictions: {self.stats.contradictions_found}")
        print(f"Errors: {len(self.stats.errors)}")
        print(f"Elapsed: {elapsed/60:.1f} minutes")
        print(f"{'─'*70}\n")

    def _print_final_summary(self):
        """Print final training summary and save stats."""
        # Ensure stats are saved
        self._save_stats()

        duration = self.stats.duration()
        hours = duration.total_seconds() / 3600 if duration else 0

        print("\n" + "="*70)
        print("TRAINING COMPLETE")
        print("="*70)
        print(f"Total questions: {self.stats.questions_asked}")
        print(f"Total iterations: {self.stats.total_iterations}")
        print(f"Knowledge growth: {self.stats.knowledge_before} → {self.stats.knowledge_after} (+{self.stats.knowledge_after - self.stats.knowledge_before})")
        print(f"Teacher queries: {self.stats.teacher_queries}")
        print(f"King verifications: {self.stats.king_queries}")
        print(f"Contradictions detected: {self.stats.contradictions_found}")
        print(f"Duration: {hours:.2f} hours")
        print(f"Rate: {self.stats.questions_asked / hours if hours > 0 else 0:.1f} questions/hour")
        print(f"Stats saved to: {self.stats_file}")
        print(f"Full log: {self.full_log_file}")
        print("="*70)

    def _save_stats(self):
        """Save current stats to disk."""
        self.stats.knowledge_after = self.kg.count()
        try:
            with open(self.stats_file, 'w') as f:
                json.dump(self.stats.to_dict(), f, indent=2)
        except Exception as e:
            print(f"[WARN] Failed to save stats: {e}")


# Convenience function
async def train(
    iterations: int = 100,
    batch_size: int = 10,
    config_path: Optional[str] = None,
    godmode: bool = False
):
    """
    Run a training session.

    Args:
        iterations: Number of questions to process
        batch_size: Questions per batch
        config_path: Path to config.yaml
        godmode: Enable godmode debugging
    """
    trainer = CORTEXTrainer(config_path=config_path, batch_size=batch_size, godmode=godmode)
    await trainer.initialize()

    # Generate questions (or use default generator)
    questions = generate_training_questions(count=iterations, knowledge_graph=trainer.kg)

    # Run training
    await trainer.train_batch(questions)

    # Final save
    trainer._save_stats()
    trainer._print_final_summary()


if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="CORTEX Self-Training")
    parser.add_argument(
        '--iterations',
        type=int,
        default=100,
        help='Number of questions to process'
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=10,
        help='Questions per batch'
    )
    parser.add_argument(
        '--config',
        default='config.yaml',
        help='Path to config.yaml'
    )
    parser.add_argument(
        '--godmode',
        action='store_true',
        help='Enable godmode debugging'
    )

    args = parser.parse_args()

    asyncio.run(train(
        iterations=args.iterations,
        batch_size=args.batch_size,
        config_path=args.config,
        godmode=args.godmode
    ))
