#!/usr/bin/env python3
"""
BULK LOADER FOR BILLION-SCALE CORTEX
Optimized for maximum throughput with sharding, compression, and parallel embedding.
"""

import asyncio
import json
import gzip
import hashlib
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, AsyncIterator
from datetime import datetime
import aiomultiprocess
from sentence_transformers import SentenceTransformer
import faiss
import pickle


class BillionScaleLoader:
    """
    High-throughput loader for billion-entry knowledge graphs.

    Features:
    - Parallel embedding computation (GPU batches)
    - Sharded JSONL.GZ storage (256 shards)
    - Incremental FAISS index building
    - Resume from checkpoint
    - Memory-mapped embedding cache
    """

    def __init__(
        self,
        output_dir: str = "Z:/cortex_data",
        embedding_model: str = "all-MiniLM-L6-v2",
        shard_count: int = 256,
        batch_size: int = 1000,
        gpu_batch_size: int = 128,
        compression_level: int = 6
    ):
        self.output_dir = Path(output_dir)
        self.shard_count = shard_count
        self.batch_size = batch_size
        self.gpu_batch_size = gpu_batch_size
        self.compression_level = compression_level

        # Create directory structure
        self.shards_dir = self.output_dir / "knowledge_graph" / "shards"
        self.indexes_dir = self.output_dir / "knowledge_graph" / "indexes"
        self.shards_dir.mkdir(parents=True, exist_ok=True)
        self.indexes_dir.mkdir(parents=True, exist_ok=True)

        # Create shard directories
        for i in range(shard_count):
            shard_hex = f"{i:02x}"
            (self.shards_dir / shard_hex).mkdir(exist_ok=True)

        # Initialize embedding model (auto GPU if available)
        print(f"[LOADER] Loading embedding model: {embedding_model}")
        self.embedder = SentenceTransformer(embedding_model)
        self.embedding_dim = self.embedder.get_sentence_embedding_dimension()
        print(f"[LOADER] Embedding dimension: {self.embedding_dim}")

        # FAISS indexes per shard
        self.faiss_shards = {}
        self._init_faiss_shards()

        # Checkpoint tracking
        self.checkpoint_file = self.output_dir / "bulk_load_checkpoint.json"
        self.stats = {
            'total_processed': 0,
            'shards_written': [0] * shard_count,
            'start_time': datetime.utcnow().isoformat()
        }

    def _init_faiss_shards(self):
        """Initialize or load existing FAISS shard indexes."""
        for i in range(self.shard_count):
            shard_hex = f"{i:02x}"
            index_path = self.indexes_dir / f"faiss_shard_{shard_hex}.index"

            if index_path.exists():
                print(f"[LOADER] Loading existing FAISS shard {shard_hex}")
                index = faiss.read_index(str(index_path))
            else:
                # Create new index (FlatL2 for accuracy; switch to HNSW for >10M)
                if self.shard_count >= 100:  # Use HNSW for large-scale
                    index = faiss.IndexHNSWFlat(self.embedding_dim, 32)
                else:
                    index = faiss.IndexFlatL2(self.embedding_dim)

            self.faiss_shards[shard_hex] = index

    def _get_shard_for_id(self, entry_id: str) -> str:
        """Determine shard from entry ID (first 2 hex chars)."""
        shard_idx = int(entry_id[:2], 16) % self.shard_count
        return f"{shard_idx:02x}"

    def _compute_embedding_batch(self, texts: List[str]) -> np.ndarray:
        """Compute embeddings for a batch of texts (GPU accelerated)."""
        embeddings = self.embedder.encode(
            texts,
            batch_size=self.gpu_batch_size,
            convert_to_numpy=True,
            show_progress_bar=False
        )
        return embeddings.astype('float32')

    async def _write_shard_batch(
        self,
        shard_hex: str,
        entries: List[Dict[str, Any]],
        embeddings: np.ndarray
    ) -> int:
        """
        Write a batch of entries to a shard (compressed JSONL + FAISS update).

        Returns: number of entries written
        """
        shard_path = self.shards_dir / shard_hex
        meta_path = shard_path / "meta.json"

        # Load or initialize shard metadata
        if meta_path.exists():
            with open(meta_path, 'r') as f:
                meta = json.load(f)
        else:
            meta = {
                'total_entries': 0,
                'file_count': 0,
                'size_bytes': 0,
                'first_entry_ts': None,
                'last_entry_ts': None
            }

        # Determine file number for this batch
        file_num = meta['file_count']
        jsonl_path = shard_path / f"{file_num}.jsonl.gz"

        # Prepare entries with embeddings
        lines = []
        for entry, emb in zip(entries, embeddings):
            # Add embedding as base64? Store separately?
            # For speed: keep in-memory only, store in FAISS
            entry['_emb_dim'] = self.embedding_dim  # Mark embedding dim

            # Remove embedding from JSON (keep in FAISS only)
            # But we need to store it for FAISS, so pass separately
            lines.append(json.dumps(entry, ensure_ascii=False))

        # Append compressed
        with gzip.open(jsonl_path, 'at', compresslevel=self.compression_level) as f:
            f.write('\n'.join(lines) + '\n')

        # Update FAISS index for this shard
        faiss_index = self.faiss_shards[shard_hex]
        faiss_index.add(embeddings)

        # Save FAISS index incrementally (every batch)
        faiss.write_index(faiss_index, str(self.indexes_dir / f"faiss_shard_{shard_hex}.index"))

        # Update metadata
        meta['total_entries'] += len(entries)
        meta['file_count'] = file_num + 1
        meta['size_bytes'] = jsonl_path.stat().st_size if jsonl_path.exists() else 0
        if not meta['first_entry_ts'] and entries:
            meta['first_entry_ts'] = entries[0].get('ts')
        if entries:
            meta['last_entry_ts'] = entries[-1].get('ts')

        with open(meta_path, 'w') as f:
            json.dump(meta, f, indent=2)

        return len(entries)

    async def process_qa_stream(
        self,
        qa_stream: AsyncIterator[Dict[str, Any]],
        checkpoint_interval: int = 10000
    ) -> Dict[str, Any]:
        """
        Main entry: process streaming Q&A pairs with sharding.

        Args:
            qa_stream: Async iterator yielding {"question":..., "answer":..., ...}
            checkpoint_interval: Save checkpoint every N entries

        Returns:
            Stats dict
        """
        batch = []
        batch_questions = []
        processed = 0

        async for qa in qa_stream:
            # Normalize entry
            entry = self._normalize_entry(qa)
            if not entry:
                continue

            batch.append(entry)
            batch_questions.append(entry['q'])

            if len(batch) >= self.batch_size:
                # Process batch
                await self._process_batch(batch, batch_questions)
                processed += len(batch)
                batch = []
                batch_questions = []

                # Checkpoint
                if processed % checkpoint_interval == 0:
                    await self._save_checkpoint(processed)
                    print(f"[LOADER] Processed {processed:,} entries...")

        # Final batch
        if batch:
            await self._process_batch(batch, batch_questions)
            processed += len(batch)

        # Final checkpoint
        await self._save_checkpoint(processed)

        # Build global FAISS ID map
        await self._build_global_id_map()

        return self.stats

    def _normalize_entry(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Convert raw Q&A to normalized entry with ID."""
        question = raw.get('question', '').strip()
        answer = raw.get('answer', '').strip()

        if not question or not answer:
            return None

        # Generate deterministic ID
        id_hash = hashlib.sha256(f"{question}|{answer}".encode()).hexdigest()[:16]

        return {
            'id': id_hash,
            'q': question[:5000],  # Limit size
            'a': answer[:20000],
            't': raw.get('topics', ['general'])[:5],
            'd': raw.get('difficulty', 'intermediate'),
            's': raw.get('source_teacher', 'unknown'),
            'v': raw.get('verification_source', '')[:500],
            'c': float(raw.get('confidence', 0.0)),
            'p': int(raw.get('processing_time_ms', 0)),
            'ts': raw.get('timestamp', datetime.utcnow().isoformat())
        }

    async def _process_batch(self, batch: List[Dict[str, Any]], questions: List[str]):
        """Process one batch: compute embeddings, write to shards."""
        # Compute embeddings in parallel (GPU)
        embeddings = self._compute_embedding_batch(questions)

        # Group by shard
        shard_groups = {}
        for entry, emb in zip(batch, embeddings):
            shard = self._get_shard_for_id(entry['id'])
            if shard not in shard_groups:
                shard_groups[shard] = {'entries': [], 'embeddings': []}
            shard_groups[shard]['entries'].append(entry)
            shard_groups[shard]['embeddings'].append(emb)

        # Write each shard batch in parallel
        tasks = []
        for shard_hex, data in shard_groups.items():
            task = self._write_shard_batch(
                shard_hex,
                data['entries'],
                np.array(data['embeddings'])
            )
            tasks.append(task)

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, int):
                self.stats['total_processed'] += r

    async def _save_checkpoint(self, processed: int):
        """Save loading progress checkpoint."""
        checkpoint = {
            'total_processed': processed,
            'shards_written': [
                (self.shards_dir / f"{i:02x}" / "meta.json")
                .exists() and json.load(open(self.shards_dir / f"{i:02x}" / "meta.json")).get('total_entries', 0)
                or 0
                for i in range(self.shard_count)
            ],
            'timestamp': datetime.utcnow().isoformat()
        }
        with open(self.checkpoint_file, 'w') as f:
            json.dump(checkpoint, f, indent=2)

    async def _build_global_id_map(self):
        """Build global FAISS ID → (shard, entry_id) mapping."""
        print("[LOADER] Building global FAISS ID map...")
        id_map = {}
        global_faiss_id = 0

        # Load each shard's index and map
        for i in range(self.shard_count):
            shard_hex = f"{i:02x}"
            index_path = self.indexes_dir / f"faiss_shard_{shard_hex}.index"
            meta_path = self.shards_dir / shard_hex / "meta.json"

            if not index_path.exists() or not meta_path.exists():
                continue

            # Read shard metadata to get entry count
            with open(meta_path, 'r') as f:
                meta = json.load(f)

            shard_entry_count = meta['total_entries']

            # Map FAISS IDs in this shard
            index = faiss.read_index(str(index_path))
            if hasattr(index, 'ntotal') and index.ntotal > 0:
                # FAISS IDs are sequential per index
                for local_id in range(index.ntotal):
                    # Would need to map back to actual entry ID
                    # For now, use sequential global ID → shard mapping
                    id_map[str(global_faiss_id)] = {
                        'shard': shard_hex,
                        'local_id': local_id
                    }
                    global_faiss_id += 1

        # Save global map
        with open(self.output_dir / "knowledge_graph" / "faiss_id_map.json", 'w') as f:
            json.dump(id_map, f, indent=2)

        print(f"[LOADER] Global ID map built: {len(id_map):,} entries")

    def get_stats(self) -> Dict[str, Any]:
        """Get current loading statistics."""
        total_entries = 0
        total_size = 0

        for i in range(self.shard_count):
            shard_hex = f"{i:02x}"
            meta_path = self.shards_dir / shard_hex / "meta.json"
            if meta_path.exists():
                with open(meta_path, 'r') as f:
                    meta = json.load(f)
                total_entries += meta['total_entries']
                    # Calculate approximate size from meta or file size
                    if 'size_bytes' in meta:
                        total_size += meta['size_bytes'] * meta['file_count']
                    else:
                        total_size += meta.get('total_bytes', 0)
            else:
                # Fall back to actual filesize
                for f in (self.shards_dir / shard_hex).glob("*.jsonl.gz"):
                    total_size += f.stat().st_size

        return {
            'total_entries': total_entries,
            'shards_used': sum(1 for i in range(self.shard_count) if (self.shards_dir / f"{i:02x}" / "meta.json").exists()),
            'total_size_gb': total_size / (1024**3),
            'checkpoint': self.checkpoint_file.exists()
        }


# ==================== STREAM GENERATORS ====================

async def stream_from_questions_file(
    filepath: str,
    max_lines: int = None
) -> AsyncIterator[Dict[str, Any]]:
    """Stream Q&A from questions file (answer generated on-the-fly)."""
    from cortex.models.council import create_council
    from cortex.config import load_config

    config = load_config()
    council = await create_council()

    with open(filepath, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f):
            if max_lines and i >= max_lines:
                break
            question = line.strip()
            if not question or question.startswith('#'):
                continue

            # Generate answer via teacher (slow, for small datasets)
            print(f"[LOADER] Generating answer {i+1}: {question[:50]}...")
            try:
                result = await council.process_question(
                    question,
                    use_verification=True,
                    store_in_knowledge=False  # Don't store during bulk load
                )
                yield {
                    'question': question,
                    'answer': result['answer'],
                    'source_teacher': result.get('teachers_called', ['unknown'])[0] if result.get('teachers_called') else 'unknown',
                    'verification_source': result.get('verification_summary', ''),
                    'confidence': result.get('confidence', 0.0),
                    'timestamp': datetime.utcnow().isoformat()
                }
            except Exception as e:
                print(f"[WARN] Failed to generate answer for '{question[:50]}': {e}")
                continue


async def stream_from_jsonl(filepath: str) -> AsyncIterator[Dict[str, Any]]:
    """Stream pre-existing JSONL entries."""
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                entry = json.loads(line.strip())
                yield entry
            except json.JSONDecodeError:
                continue


async def stream_from_verified_qa(filepath: str) -> AsyncIterator[Dict[str, Any]]:
    """Stream from verified Q&A dataset (already has answers)."""
    # Assuming format: {"question": "...", "answer": "...", "topics": [...], ...}
    async for entry in stream_from_jsonl(filepath):
        # Normalize if needed
        if 'question' in entry and 'answer' in entry:
            yield entry


# ==================== MAIN ====================

async def main():
    """Example usage for billion-scale loading."""
    import argparse

    parser = argparse.ArgumentParser(description="Billion-scale bulk loader")
    parser.add_argument('input', help='Input file (questions.txt or jsonl)')
    parser.add_argument('--format', choices=['questions', 'jsonl', 'verified'],
                        default='questions', help='Input format')
    parser.add_argument('--max-entries', type=int, help='Maximum entries to load')
    parser.add_argument('--output-dir', default='Z:/cortex_data', help='Output directory')
    parser.add_argument('--batch-size', type=int, default=1000, help='Processing batch size')
    parser.add_argument('--gpu-batch-size', type=int, default=128, help='GPU embedding batch size')
    parser.add_argument('--checkpoint-interval', type=int, default=10000, help='Checkpoint frequency')

    args = parser.parse_args()

    loader = BillionScaleLoader(
        output_dir=args.output_dir,
        batch_size=args.batch_size,
        gpu_batch_size=args.gpu_batch_size
    )

    print(f"[LOADER] Starting bulk load from {args.input}")
    print(f"[LOADER] Format: {args.format}")
    print(f"[LOADER] Max entries: {args.max_entries or 'unlimited'}")

    # Choose stream source
    if args.format == 'questions':
        stream = stream_from_questions_file(args.input, max_lines=args.max_entries)
    elif args.format == 'verified':
        stream = stream_from_verified_qa(args.input)
    else:
        stream = stream_from_jsonl(args.input)

    # Process
    stats = await loader.process_qa_stream(
        stream,
        checkpoint_interval=args.checkpoint_interval
    )

    print("\n" + "="*70)
    print("BULK LOAD COMPLETE")
    print("="*70)
    print(f"Total entries: {stats['total_entries']:,}")
    print(f"Shards used: {stats['shards_used']}/256")
    print(f"Total size: {stats['total_size_gb']:.2f} GB")
    print(f"Output: {args.output_dir}/knowledge_graph/shards/")
    print("="*70)

    # Next steps
    print("\nNEXT STEPS:")
    print("1. Run GPU training to enhance:")
    print("   python cortex/cli.py gpu-train --iterations 100000 --pretrained-dir", args.output_dir)
    print("2. Merge with main store:")
    print("   python cortex/cli.py merge-pretrained", args.output_dir)
    print("="*70)


if __name__ == "__main__":
    import sys
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    asyncio.run(main())
