#!/usr/bin/env python3
"""
FASTEST 100k TRAINING - NO EXTERNAL API CALLS

Strategy:
1. Use pre-extracted Q&A from DOCX (already has answers)
2. Compute embeddings locally (GPU)
3. Store directly to sharded knowledge graph
4. Skip teacher verification (already high quality dataset)
5. Use bulk write for maximum speed

Expected time: 2-4 hours for 100k entries (no API rate limits)
"""

import asyncio
import json
import gzip
import hashlib
import numpy as np
import time
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any
import faiss
from sentence_transformers import SentenceTransformer


class Fast100kTrainer:
    """Rapid trainer for pre-answered Q&A dataset."""

    def __init__(
        self,
        input_jsonl: str = "training_data_100k.jsonl",
        output_dir: str = "Z:/cortex_data",
        embedding_model: str = "all-MiniLM-L6-v2",
        batch_size: int = 1000,
        shard_count: int = 1  # For 100k, single shard is fine
    ):
        self.input_jsonl = Path(input_jsonl)
        self.output_dir = Path(output_dir)
        self.batch_size = batch_size
        self.shard_count = shard_count

        # Setup paths
        self.knowledge_dir = self.output_dir / "knowledge_graph"
        self.shards_dir = self.knowledge_dir / "shards"
        self.indexes_dir = self.knowledge_dir / "indexes"

        # Create directories
        self.shards_dir.mkdir(parents=True, exist_ok=True)
        self.indexes_dir.mkdir(parents=True, exist_ok=True)

        # Initialize embedding model
        print(f"[FAST100K] Loading embedding model: {embedding_model}")
        self.embedder = SentenceTransformer(embedding_model)
        self.embedding_dim = self.embedder.get_sentence_embedding_dimension()
        print(f"[FAST100K] Embedding dimension: {self.embedding_dim}")

        # GPU check
        import torch
        if torch.cuda.is_available():
            try:
                self.embedder = self.embedder.to('cuda')
                print(f"[FAST100K] Using GPU: {torch.cuda.get_device_name(0)}")
            except Exception as e:
                print(f"[FAST100K] GPU available but failed to move model: {e}")
                print("[FAST100K] Falling back to CPU")
        else:
            print("[FAST100K] Using CPU (slower)")

        # FAISS index (single shard for 100k)
        self.faiss_index = faiss.IndexFlatL2(self.embedding_dim)
        self.faiss_id_map = {}  # faiss_id -> entry_id

        # Stats
        self.stats = {
            'total_loaded': 0,
            'total_stored': 0,
            'start_time': datetime.utcnow().isoformat()
        }

    def _compute_embeddings_batch(self, questions: List[str]) -> np.ndarray:
        """Compute embeddings for batch of questions."""
        embeddings = self.embedder.encode(
            questions,
            batch_size=min(128, len(questions)),
            convert_to_numpy=True,
            show_progress_bar=False
        )
        return embeddings.astype('float32')

    def _generate_entry_id(self, question: str, answer: str) -> str:
        """Generate deterministic ID."""
        return hashlib.sha256(f"{question}|{answer}".encode()).hexdigest()[:16]

    async def load_and_store(self, limit: int = None):
        """
        Main pipeline: load Q&A from JSONL, compute embeddings, store to shards.
        """
        print("\n" + "="*70)
        print("FAST 100k TRAINING STARTING (NO API CALLS)")
        print("="*70)

        # Read all entries
        print(f"[LOAD] Reading {self.input_jsonl}...")
        entries = []

        with open(self.input_jsonl, 'r', encoding='utf-8') as f:
            for i, line in enumerate(f):
                if limit and i >= limit:
                    break
                try:
                    entry = json.loads(line.strip())
                    # Normalize fields
                    normalized = {
                        'id': self._generate_entry_id(entry.get('question', ''), entry.get('answer', '')),
                        'q': entry.get('question', '')[:5000],
                        'a': entry.get('answer', '')[:20000],
                        't': entry.get('topics', ['general'])[:5],
                        'd': entry.get('difficulty', 'intermediate'),
                        's': entry.get('source_teacher', 'docx_dataset'),
                        'v': entry.get('verification_source', 'AI_Training_QA_Dataset_100K.docx'),
                        'c': float(entry.get('confidence', 0.95)),  # Assume high quality
                        'p': 0,  # No processing time recorded
                        'ts': entry.get('timestamp', datetime.utcnow().isoformat())
                    }
                    entries.append(normalized)
                except Exception as e:
                    print(f"[WARN] Failed to parse line {i+1}: {e}")
                    continue

        total = len(entries)
        print(f"[LOAD] Loaded {total:,} Q&A pairs")

        # Process in batches
        batches = (total + self.batch_size - 1) // self.batch_size

        print(f"[PROCESS] Processing {batches} batches...")
        start_time = time.time()

        for batch_idx in range(batches):
            batch_start = time.time()
            batch_entries = entries[batch_idx * self.batch_size : (batch_idx + 1) * self.batch_size]

            if not batch_entries:
                break

            # Extract questions for embedding
            questions = [e['q'] for e in batch_entries]

            # Compute embeddings (GPU accelerated)
            embeddings = self._compute_embeddings_batch(questions)

            # Store to JSONL shard (compressed) and FAISS
            await self._store_batch(batch_entries, embeddings)

            # Progress
            processed = min((batch_idx + 1) * self.batch_size, total)
            elapsed = time.time() - start_time
            rate = processed / (elapsed / 60) if elapsed > 0 else 0
            remaining = total - processed
            eta_min = remaining / rate if rate > 0 else 0

            print(
                f"\r[Batch {batch_idx+1}/{batches}] "
                f"Processed: {processed:,}/{total:,} ({processed/total*100:.1f}%) | "
                f"Rate: {rate:.1f}/min | ETA: {eta_min:.0f}min | "
                f"Embed+Store: {(time.time()-batch_start)*1000:.0f}ms/batch",
                end='', flush=True
            )

        print("\n\n" + "="*70)
        print("PROCESSING COMPLETE")
        print("="*70)

        # Save FAISS index
        faiss_path = self.indexes_dir / "faiss_single.index"
        faiss.write_index(self.faiss_index, str(faiss_path))
        print(f"[FAISS] Index saved to {faiss_path} ({self.faiss_index.ntotal:,} vectors)")

        # Save ID map
        id_map_path = self.knowledge_dir / "faiss_id_map.json"
        with open(id_map_path, 'w') as f:
            json.dump(self.faiss_id_map, f, indent=2)
        print(f"[FAISS] ID map saved ({len(self.faiss_id_map):,} entries)")

        # Also write to traditional JSONL storage for compatibility
        await self._write_flat_jsonl(entries)

        # Final stats
        total_time = time.time() - start_time
        print(f"\n[DONE] Total time: {total_time/60:.1f} minutes")
        print(f"[DONE] Average: {total_time/total:.2f}s per entry")
        print(f"[DONE] Knowledge graph entries: {total:,}")
        print(f"[DONE] Storage location: {self.output_dir}")

    async def _store_batch(self, entries: List[Dict[str, Any]], embeddings: np.ndarray):
        """
        Store batch to:
        1. FAISS index (in-memory)
        2. Sharded JSONL (for durability)
        """
        # Add to FAISS
        faiss_ids = []
        for emb in embeddings:
            faiss_id = self.faiss_index.ntotal
            self.faiss_index.add(emb.reshape(1, -1))
            faiss_ids.append(faiss_id)

        # Map FAISS IDs to entry IDs
        for entry, faiss_id in zip(entries, faiss_ids):
            self.faiss_id_map[str(faiss_id)] = entry['id']

        # Write to sharded JSONL (single shard for 100k)
        shard_hex = "00"  # All in one shard
        shard_dir = self.shards_dir / shard_hex
        shard_dir.mkdir(parents=True, exist_ok=True)

        # Determine file number
        existing_files = list(shard_dir.glob("*.jsonl.gz"))
        file_num = len(existing_files)
        jsonl_path = shard_dir / f"{file_num}.jsonl.gz"

        # Append entries (without embeddings)
        import gzip
        with gzip.open(jsonl_path, 'at', compresslevel=6, encoding='utf-8') as f:
            for entry in entries:
                f.write(json.dumps(entry, ensure_ascii=False) + '\n')

        # Update shard metadata
        meta_path = shard_dir / "meta.json"
        if meta_path.exists():
            with open(meta_path, 'r') as f:
                meta = json.load(f)
        else:
            meta = {'total_entries': 0, 'file_count': 0}
        meta['total_entries'] += len(entries)
        meta['file_count'] = file_num + 1
        with open(meta_path, 'w') as f:
            json.dump(meta, f, indent=2)

    async def _write_flat_jsonl(self, entries: List[Dict[str, Any]]):
        """Also write to flat JSONL for compatibility with existing KnowledgeGraph."""
        flat_file = self.knowledge_dir / "training_data_flat.jsonl"
        with open(flat_file, 'a', encoding='utf-8') as f:  # Append mode in case called multiple times
            for entry in entries:
                f.write(json.dumps(entry, ensure_ascii=False) + '\n')
        print(f"[FLAT] Wrote {len(entries):,} entries to {flat_file}")


async def main():
    import argparse
    import time

    parser = argparse.ArgumentParser(description="Fast 100k training - no API calls")
    parser.add_argument(
        '--input',
        default='training_data_100k.jsonl',
        help='Input JSONL file with Q&A pairs'
    )
    parser.add_argument(
        '--output-dir',
        default='Z:/cortex_data',
        help='Output directory for knowledge store'
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=1000,
        help='Batch size for embedding computation'
    )
    parser.add_argument(
        '--limit',
        type=int,
        help='Limit number of entries (for testing)'
    )

    args = parser.parse_args()

    trainer = Fast100kTrainer(
        input_jsonl=args.input,
        output_dir=args.output_dir,
        batch_size=args.batch_size
    )

    await trainer.load_and_store(limit=args.limit)

    print("\n[NEXT STEPS]")
    print("1. Test knowledge graph:")
    print("   python cortex/cli.py ask 'What are SFT?'")
    print("2. Check status:")
    print("   python cortex/cli.py status")
    print("="*70)


if __name__ == "__main__":
    asyncio.run(main())
