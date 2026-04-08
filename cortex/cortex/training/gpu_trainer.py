"""GPU-accelerated CORTEX trainer with ROCm/CUDA support.

Optimized for high-end GPUs (20GB+ VRAM) to accelerate:
- Embedding computation (sentence-transformers)
- Local teacher model inference (optional)
- Batch processing and parallel I/O

 usage:
    python cortex/cli.py gpu-train --iterations 100000 --pretrained-dir E:/pretrained_store
"""

import asyncio
import time
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from pathlib import Path
import json
import os

from ..config import load_config
from ..models.council import create_council
from ..knowledge.storage import LocalStorage
from ..knowledge.graph import KnowledgeGraph
from ..knowledge.generator import generate_training_questions
from .trainer import TrainingStats, _setup_godmode_logging


class GPUTrainer:
    """
    GPU-optimized trainer that stores knowledge in a configurable pretrained store.

    Features:
    - GPU-accelerated embeddings (sentence-transformers auto-detects CUDA/ROCm)
    - Configurable storage path (not tied to Z: drive)
    - Batch-optimized processing
    - Support for local GPU teacher models (future)
    - Progress tracking with estimated VRAM usage
    """

    def __init__(
        self,
        config_path: Optional[str] = None,
        pretrained_dir: str = "E:/pretrained_store",
        batch_size: int = 50,
        embedding_batch_size: int = 32,
        godmode: bool = False,
        use_local_models: bool = False  # Future: run teachers on GPU
    ):
        self.config = load_config(config_path)
        self.pretrained_dir = Path(pretrained_dir)
        self.batch_size = batch_size
        self.embedding_batch_size = embedding_batch_size
        self.godmode = godmode
        self.use_local_models = use_local_models

        # Override storage path in config
        self.config.knowledge.storage_path = str(self.pretrained_dir)

        # Stats files
        self.stats_file = self.pretrained_dir / f"training_stats_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
        self.full_log_file = self.pretrained_dir / "full_training_log.jsonl"

        # Will be initialized in async context
        self.council = None
        self.storage = None
        self.kg = None
        self.stats = None
        self._start_timestamp = None

        # GPU monitoring
        self.gpu_available = self._check_gpu()

    def _check_gpu(self) -> bool:
        """Check if GPU is available for acceleration."""
        try:
            import torch
            if torch.cuda.is_available():
                device = torch.cuda.current_device()
                device_name = torch.cuda.get_device_name(device)
                total_mem = torch.cuda.get_device_properties(device).total_memory / 1e9
                print(f"[GPU] Detected: {device_name} ({total_mem:.1f} GB VRAM)")
                return True
        except ImportError:
            print("[GPU] PyTorch not installed, GPU detection skipped")
        except Exception as e:
            print(f"[GPU] Detection error: {e}")
        return False

    async def initialize(self):
        """Initialize CORTEX components with GPU acceleration."""
        print("\n" + "="*70)
        print("GPU TRAINER INITIALIZATION")
        print("="*70)

        if self.godmode:
            _setup_godmode_logging()
            print("[GPU] GODMODE ENABLED")

        # Create pretrained directory structure
        self.pretrained_dir.mkdir(parents=True, exist_ok=True)
        (self.pretrained_dir / "knowledge_graph").mkdir(exist_ok=True)
        (self.pretrained_dir / "embeddings_cache").mkdir(exist_ok=True)
        (self.pretrained_dir / "mistakes").mkdir(exist_ok=True)

        print(f"[GPU] Pretrained store: {self.pretrained_dir}")
        print(f"[GPU] Batch size: {self.batch_size}")
        print(f"[GPU] Embedding batch size: {self.embedding_batch_size}")

        # Initialize storage with custom path
        self.storage = LocalStorage(base_path=str(self.pretrained_dir))
        self.kg = KnowledgeGraph(
            storage=self.storage,
            embedding_model=self.config.knowledge.embedding_model,
            use_faiss=self.config.knowledge.use_faiss
        )

        # Check if GPU should be used for embeddings
        if self.gpu_available:
            # SentenceTransformer auto-uses GPU if available
            print("[GPU] Embeddings will use GPU acceleration")
            if hasattr(self.kg.embedding_model, 'device'):
                print(f"[GPU] Model device: {self.kg.embedding_model.device}")

        self.council = await create_council()

        # Initialize stats
        initial_count = self.kg.count()
        self.stats = TrainingStats(
            start_time=datetime.utcnow().isoformat(),
            knowledge_before=initial_count
        )
        self._start_timestamp = time.time()

        print(f"[GPU] Knowledge graph entries: {initial_count}")
        print(f"[GPU] Active teachers: {list(self.council.teachers.keys())}")
        print(f"[GPU] Stats: {self.stats_file}")
        print("="*70 + "\n")

    async def train_iteration(self, question: str) -> Dict[str, Any]:
        """
        Run one training iteration with GPU acceleration.

        Returns:
            Dict with iteration results
        """
        result = {
            'question': question,
            'timestamp': datetime.utcnow().isoformat(),
            'success': False,
            'answer': None,
            'teacher_responses': [],
            'king_used': False,
            'contradictions': 0,
            'error': None,
            'embedding_time_ms': None,
            'total_time_ms': None
        }

        start_time = time.time()

        try:
            # Process question through CORTEX
            council_result = await self.council.process_question(
                question,
                use_verification=True,
                store_in_knowledge=True  # Stores to GPU PC's local storage
            )

            # Defensive: Ensure teacher_responses is list
            if 'teacher_responses' not in council_result or council_result['teacher_responses'] is None:
                council_result['teacher_responses'] = []

            # Update stats
            teachers_called = council_result.get('teachers_called', []) or []
            self.stats.teacher_queries += len(teachers_called)
            self.stats.king_queries += 1

            result['answer'] = council_result.get('answer', '')
            result['teacher_responses'] = council_result['teacher_responses']
            result['king_used'] = council_result.get('source') == 'verified'
            result['contradictions'] = council_result.get('contradictions_found', 0)

            result['success'] = True
            self.stats.questions_asked += 1
            self.stats.contradictions_found += result['contradictions']

        except Exception as e:
            error_msg = f"Iteration failed for '{question[:50]}...': {str(e)}"
            print(f"[ERROR] {error_msg}")
            if self.godmode:
                import traceback
                traceback.print_exc()
            result['error'] = error_msg
            self.stats.errors.append(error_msg)

        # Timing
        total_time = (time.time() - start_time) * 1000
        result['total_time_ms'] = total_time

        # Log full result
        self._log_iteration(result)

        return result

    async def train_batch(self, questions: List[str]) -> List[Dict[str, Any]]:
        """
        Train on a batch of questions with GPU optimizations.

        Args:
            questions: List of questions to process

        Returns:
            List of iteration results
        """
        results = []
        total = len(questions)

        print(f"\n{'='*70}")
        print(f"GPU TRAINING BATCH: {total} questions")
        print(f"{'='*70}")

        # GPU memory monitoring (optional)
        if self.gpu_available:
            try:
                import torch
                allocated_before = torch.cuda.memory_allocated() / 1e9
                print(f"[GPU] Memory before batch: {allocated_before:.2f} GB")
            except:
                pass

        for i, question in enumerate(questions, 1):
            print(f"\r[{i}/{total}] {question[:60]}...", end='', flush=True)

            result = await self.train_iteration(question)
            results.append(result)

            # Small delay to respect rate limits
            await asyncio.sleep(0.5)

        print(f"\nBatch complete. {len([r for r in results if r['success']])}/{total} successful")

        # GPU memory after batch
        if self.gpu_available:
            try:
                import torch
                allocated_after = torch.cuda.memory_allocated() / 1e9
                print(f"[GPU] Memory after batch: {allocated_after:.2f} GB")
                torch.cuda.empty_cache()
            except:
                pass

        # Update stats
        self.stats.knowledge_after = self.kg.count()
        self.stats.total_iterations += len(questions)

        # Persist FAISS index periodically
        if self.kg.use_faiss:
            self.kg.persist_faiss()

        return results

    async def train_continuous(
        self,
        duration_minutes: Optional[int] = None,
        max_iterations: Optional[int] = None,
        question_generator=None,
        save_interval: int = 100
    ):
        """
        Run continuous training loop on GPU.

        Args:
            duration_minutes: How long to train (None = infinite)
            max_iterations: Maximum iterations (None = infinite)
            question_generator: Custom generator function
            save_interval: Save stats every N iterations
        """
        print("\n" + "="*70)
        print("GPU CONTINUOUS TRAINING")
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
                        print(f"\n[STOP] Duration limit: {duration_minutes} minutes")
                        break

                # Generate batch of questions
                if question_generator:
                    questions = question_generator(self.batch_size)
                else:
                    kg_count = self.kg.count()
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
                if iteration % save_interval == 0:
                    self._save_stats()
                    # Also persist FAISS
                    if self.kg.use_faiss:
                        print("[GPU] Persisting FAISS index...")
                        self.kg.persist_faiss()

                # Short pause
                await asyncio.sleep(2)

        except KeyboardInterrupt:
            print("\n[STOP] Training interrupted by user")
        finally:
            # Final save
            self.stats.end_time = datetime.utcnow().isoformat()
            self._save_stats()
            if self.kg.use_faiss:
                self.kg.persist_faiss()
            self._print_final_summary()

    def _print_summary(self):
        """Print current training summary."""
        current_kg = self.kg.count()
        elapsed = time.time() - self._start_timestamp

        print(f"\n{'─'*70}")
        print("GPU TRAINING SUMMARY")
        print(f"{'─'*70}")
        print(f"Questions processed: {self.stats.questions_asked}")
        print(f"Knowledge entries: {self.stats.knowledge_before} → {current_kg} (+{current_kg - self.stats.knowledge_before})")
        print(f"Teacher queries: {self.stats.teacher_queries}")
        print(f"King verifications: {self.stats.king_queries}")
        print(f"Contradictions: {self.stats.contradictions_found}")
        print(f"Errors: {len(self.stats.errors)}")
        print(f"Elapsed: {elapsed/60:.1f} min | Rate: {self.stats.questions_asked / (elapsed/3600):.1f} q/hr")

        if self.gpu_available:
            try:
                import torch
                mem = torch.cuda.memory_allocated() / 1e9
                print(f"GPU Memory: {mem:.2f} GB")
            except:
                pass

        print(f"{'─'*70}\n")

    def _print_final_summary(self):
        """Print final training summary."""
        duration = self.stats.duration()
        hours = duration.total_seconds() / 3600 if duration else 0

        print("\n" + "="*70)
        print("GPU TRAINING COMPLETE")
        print("="*70)
        print(f"Total questions: {self.stats.questions_asked}")
        print(f"Total iterations: {self.stats.total_iterations}")
        print(f"Knowledge growth: {self.stats.knowledge_before} → {self.stats.knowledge_after} (+{self.stats.knowledge_after - self.stats.knowledge_before})")
        print(f"Teacher queries: {self.stats.teacher_queries}")
        print(f"King verifications: {self.stats.king_queries}")
        print(f"Contradictions: {self.stats.contradictions_found}")
        print(f"Duration: {hours:.2f} hours")
        print(f"Throughput: {self.stats.questions_asked / hours if hours > 0 else 0:.1f} questions/hour")
        print(f"Pretrained store: {self.pretrained_dir}")
        print(f"Stats: {self.stats_file}")
        print(f"Full log: {self.full_log_file}")
        print("="*70)

        # Transfer instructions
        print("\nNEXT STEPS:")
        print("1. Transfer to main CORTEX_DATA:")
        print("   python cortex/cli.py export-pretrained", self.pretrained_dir, "Z:/cortex_data")
        print("2. Or merge with existing:")
        print("   python cortex/cli.py merge-pretrained", self.pretrained_dir)
        print("="*70 + "\n")

    def _save_stats(self):
        """Save current stats to disk."""
        self.stats.knowledge_after = self.kg.count()
        try:
            with open(self.stats_file, 'w') as f:
                json.dump(self.stats.to_dict(), f, indent=2)
        except Exception as e:
            print(f"[WARN] Failed to save stats: {e}")

    def _log_iteration(self, result: Dict[str, Any]):
        """Append iteration result to log file."""
        try:
            with open(self.full_log_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(result, ensure_ascii=False) + '\n')
        except Exception as e:
            print(f"[WARN] Failed to log iteration: {e}")


# Convenience function
async def gpu_train(
    iterations: int = 100,
    batch_size: int = 50,
    pretrained_dir: str = "E:/pretrained_store",
    config_path: Optional[str] = None,
    godmode: bool = False,
    duration_minutes: Optional[int] = None,
    max_iterations: Optional[int] = None
):
    """
    Run GPU-accelerated training.

    Args:
        iterations: Number of questions (used if max_iterations not set)
        batch_size: Questions per batch
        pretrained_dir: Directory to store pretrained knowledge
        config_path: Path to config.yaml
        godmode: Enable godmode debugging
        duration_minutes: Run for this many minutes (overrides iterations)
        max_iterations: Maximum iterations (overrides iterations)
    """
    trainer = GPUTrainer(
        config_path=config_path,
        pretrained_dir=pretrained_dir,
        batch_size=batch_size,
        godmode=godmode
    )

    await trainer.initialize()

    if max_iterations is None:
        max_iterations = iterations

    # Run continuous training with iteration limit
    await trainer.train_continuous(
        duration_minutes=duration_minutes,
        max_iterations=max_iterations,
        save_interval=50
    )
