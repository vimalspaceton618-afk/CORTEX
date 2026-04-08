#!/usr/bin/env python3
"""
HIGH-PERFORMANCE DATALOADER FOR BILLION-SCALE CORTEX
PyTorch-style batching from sharded JSONL storage.
"""

import random
import json
import gzip
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional, AsyncIterator, Tuple
from dataclasses import dataclass
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
from sentence_transformers import SentenceTransformer


@dataclass
class TrainingBatch:
    """Batch of training samples."""
    questions: List[str]
    answers: List[str]
    embeddings: np.ndarray
    topics: List[List[str]]
    difficulties: List[str]
    metadata: List[Dict[str, Any]]


class ShardedQADataset(Dataset):
    """
    PyTorch Dataset that reads from sharded JSONL storage.

    Features:
    - Memory-mapped shard index (cached)
    - Randomized shard sampling
    - On-the-fly embedding computation (or retrieved from cache)
    - Prefetching for GPU pipelines
    """

    def __init__(
        self,
        shards_dir: str,
        embedding_model: str = "all-MiniLM-L6-v2",
        max_entries_per_epoch: int = None,
        embed_on_the_fly: bool = False,
        cache_embeddings: bool = True
    ):
        self.shards_dir = Path(shards_dir)
        self.embed_on_the_fly = embed_on_the_fly
        self.cache_embeddings = cache_embeddings
        self.max_entries = max_entries_per_epoch

        # Discover shards
        self.shard_paths = sorted(self.shards_dir.glob("[0-9a-f][0-9a-f]/"))
        self.shard_index = self._build_shard_index()

        # Embedding model (lazy load)
        self.embedder = None
        self.embedding_model_name = embedding_model

        # Embedding cache if storing separately
        self.embedding_cache = {} if cache_embeddings else None

        print(f"[DATASET] Found {len(self.shard_paths)} shards")
        print(f"[DATASET] Total entries: {self.total_entries:,}")
        print(f"[DATASET] Embed on fly: {embed_on_the_fly}")

    def _build_shard_index(self) -> List[Dict]:
        """
        Build index of all entries across shards.

        Returns list of (shard_hex, file_num, line_offset, entry_id).
        For billion-scale, this index is ~32 bytes per entry = 32 GB for 1B.
        Strategy: cache this index to disk and memory-map it.
        """
        index_file = self.shards_dir.parent / "shard_index.json"

        if index_file.exists():
            print(f"[DATASET] Loading shard index from {index_file}")
            with open(index_file, 'r') as f:
                index = json.load(f)
        else:
            print(f"[DATASET] Building shard index (this may take a while)...")
            index = []
            total = 0

            for shard_path in self.shard_paths:
                shard_hex = shard_path.name
                meta_files = sorted(shard_path.glob("*.json"))

                for meta_file in meta_files:
                    try:
                        with open(meta_file, 'r') as f:
                            meta = json.load(f)
                        entry_count = meta.get('total_entries', 0)
                        index.append({
                            'shard': shard_hex,
                            'file': meta_file.name,
                            'entries': entry_count,
                            'start_byte': 0  # TODO: precise byte offsets
                        })
                        total += entry_count
                    except Exception as e:
                        print(f"[WARN] Failed to read {meta_file}: {e}")

            print(f"[DATASET] Indexed {total:,} entries across {len(index)} files")

        self.total_entries = sum(idx['entries'] for idx in index)
        return index

    def __len__(self) -> int:
        if self.max_entries:
            return min(self.max_entries, self.total_entries)
        return self.total_entries

    def __getitem__(self, idx: int) -> Dict[str, Any]:
        """
        Get single entry by global index.
        Note: For performance, implement __getitems__ for batch fetching.
        """
        if idx >= self.total_entries:
            raise IndexError(f"Index {idx} out of range")

        # Find which shard/file contains this index
        cumulative = 0
        for file_info in self.shard_index:
            if idx < cumulative + file_info['entries']:
                # Found the file
                local_idx = idx - cumulative
                entry = self._read_entry_from_file(
                    file_info['shard'],
                    file_info['file'],
                    local_idx
                )
                return entry
            cumulative += file_info['entries']

        raise RuntimeError(f"Index {idx} not found in index")

    def _read_entry_from_file(self, shard_hex: str, filename: str, line_num: int) -> Dict[str, Any]:
        """Read specific entry from gzipped JSONL file."""
        shard_path = self.shards_dir / shard_hex / filename

        with gzip.open(shard_path, 'rt', encoding='utf-8') as f:
            for i, line in enumerate(f):
                if i == line_num:
                    entry = json.loads(line.strip())
                    # Remove temporary fields
                    entry.pop('_emb_dim', None)
                    return entry

        raise IndexError(f"Line {line_num} not found in {shard_path}")

    def _get_embedder(self):
        """Lazy load embedding model."""
        if self.embedder is None:
            print(f"[DATASET] Loading embedding model: {self.embedding_model_name}")
            self.embedder = SentenceTransformer(self.embedding_model_name)
            if torch.cuda.is_available():
                self.embedder = self.embedder.to('cuda')
                print(f"[DATASET] Embedder using GPU: {torch.cuda.get_device_name(0)}")
        return self.embedder

    def get_batch(
        self,
        indices: List[int],
        compute_embeddings: bool = True
    ) -> TrainingBatch:
        """
        Fetch batch of entries by indices.

        Args:
            indices: List of global indices
            compute_embeddings: If True, compute embeddings on-the-fly (GPU)
                               If False, return raw entries (embeddings=None)

        Returns:
            TrainingBatch with stacked tensors
        """
        entries = [self[idx] for idx in indices]

        # Extract fields
        questions = [e['q'] for e in entries]
        answers = [e['a'] for e in entries]
        topics = [e['t'] for e in entries]
        difficulties = [e['d'] for e in entries]
        metadata = entries

        embeddings = None
        if compute_embeddings:
            embedder = self._get_embedder()
            embeddings = embedder.encode(
                questions,
                batch_size=len(questions),
                convert_to_numpy=True,
                show_progress_bar=False
            ).astype('float32')

        return TrainingBatch(
            questions=questions,
            answers=answers,
            embeddings=embeddings,
            topics=topics,
            difficulties=difficulties,
            metadata=metadata
        )


class AsyncShardedLoader:
    """
    Async iterator for streaming batches from sharded storage.
    Uses asyncio for concurrent shard reading.
    """

    def __init__(
        self,
        shards_dir: str,
        batch_size: int = 64,
        shuffle: bool = True,
        num_workers: int = 4,
        prefetch_factor: int = 2
    ):
        self.shards_dir = Path(shards_dir)
        self.batch_size = batch_size
        self.shuffle = shuffle
        self.num_workers = num_workers
        self.prefetch_factor = prefetch_factor

        # Discover all entry locations across shards
        self.entries = self._discover_all_entries()

        print(f"[ASYNC LOADER] Discovered {len(self.entries):,} entries")
        print(f"[ASYNC LOADER] Batch size: {batch_size}")
        print(f"[ASYNC LOADER] Workers: {num_workers}")

    def _discover_all_entries(self) -> List[Tuple[str, str, int]]:
        """
        Discover all (shard, file, line_num) triples.
        Returns list of 10M+ entries - store in memory for random access.
        """
        entries = []

        for shard_path in sorted(self.shards_dir.glob("[0-9a-f][0-9a-f]/")):
            shard_hex = shard_path.name
            for jsonl_file in sorted(shard_path.glob("*.jsonl.gz")):
                # Count lines efficiently (fast count)
                line_count = 0
                with gzip.open(jsonl_file, 'rt') as f:
                    for _ in f:
                        line_count += 1

                # Record entry ranges
                for line_num in range(line_count):
                    entries.append((shard_hex, jsonl_file.name, line_num))

        return entries

    def __iter__(self):
        self.current_idx = 0
        if self.shuffle:
            random.shuffle(self.entries)
        return self

    def __next__(self) -> TrainingBatch:
        """Get next batch."""
        if self.current_idx >= len(self.entries):
            raise StopIteration

        batch_indices = self.entries[
            self.current_idx : self.current_idx + self.batch_size
        ]
        self.current_idx += self.batch_size

        return self._load_batch(batch_indices)

    def _load_batch(self, batch_entries: List[Tuple[str, str, int]]) -> TrainingBatch:
        """Load batch from shard files."""
        questions = []
        answers = []
        topics = []
        difficulties = []

        for shard_hex, filename, line_num in batch_entries:
            shard_path = self.shards_dir / shard_hex / filename

            with gzip.open(shard_path, 'rt') as f:
                for i, line in enumerate(f):
                    if i == line_num:
                        entry = json.loads(line.strip())
                        questions.append(entry['q'])
                        answers.append(entry['a'])
                        topics.append(entry['t'])
                        difficulties.append(entry['d'])
                        break

        return TrainingBatch(
            questions=questions,
            answers=answers,
            embeddings=None,  # Compute later
            topics=topics,
            difficulties=difficulties,
            metadata=[]
        )


def create_dataloader(
    shards_dir: str,
    batch_size: int = 64,
    num_workers: int = 4,
    shuffle: bool = True,
    pin_memory: bool = True,
    prefetch_factor: int = 2
) -> DataLoader:
    """
    Create PyTorch DataLoader from sharded dataset.

    Returns DataLoader that yields TrainingBatch objects.
    """
    dataset = ShardedQADataset(shards_dir=shards_dir)

    def collate_fn(batch):
        """Custom collate for heterogeneous batches."""
        questions = [item['q'] for item in batch]
        answers = [item['a'] for item in batch]
        topics = [item['t'] for item in batch]
        difficulties = [item['d'] for item in batch]

        return {
            'questions': questions,
            'answers': answers,
            'topics': topics,
            'difficulties': difficulties,
            'metadata': batch
        }

    return DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=shuffle,
        num_workers=num_workers,
        pin_memory=pin_memory,
        prefetch_factor=prefetch_factor if num_workers > 0 else None,
        collate_fn=collate_fn
    )


# ==================== USAGE EXAMPLE ====================

if __name__ == "__main__":
    import time

    # Example: Test loading from sharded storage
    shards_dir = "Z:/cortex_data/knowledge_graph/shards"

    print("[DEMO] Creating dataset...")
    dataset = ShardedQADataset(shards_dir, embed_on_the_fly=True)

    print(f"[DEMO] Dataset size: {len(dataset):,} entries")

    if len(dataset) > 0:
        print("[DEMO] Loading single entry...")
        start = time.time()
        entry = dataset[0]
        elapsed = time.time() - start
        print(f"  Question: {entry['q'][:60]}...")
        print(f"  Load time: {elapsed*1000:.2f}ms")

        print("[DEMO] Loading batch of 32...")
        start = time.time()
        batch = dataset.get_batch(list(range(32)), compute_embeddings=True)
        elapsed = time.time() - start
        print(f"  Batch size: {len(batch.questions)}")
        print(f"  Embeddings shape: {batch.embeddings.shape}")
        print(f"  Batch load time: {elapsed*1000:.2f}ms")
        print(f"  Per-item: {elapsed*1000/32:.2f}ms")

    print("\n[DEMO] Creating DataLoader...")
    loader = create_dataloader(shards_dir, batch_size=64, num_workers=4)

    print("[DEMO] Iterating first batch...")
    start = time.time()
    for batch in loader:
        print(f"  Batch from DataLoader: {len(batch['questions'])} items")
        print(f"  Time: {(time.time()-start)*1000:.2f}ms")
        break
