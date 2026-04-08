"""Sharded Knowledge Graph for billion-scale CORTEX.

Extends the existing KnowledgeGraph to support distributed FAISS shards
while maintaining backwards compatibility with single-store mode.
"""

import asyncio
import json
import numpy as np
import faiss
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from sentence_transformers import SentenceTransformer
import logging

from .storage import LocalStorage
from .graph import KnowledgeGraph as SingleGraph

logger = logging.getLogger(__name__)


class ShardedKnowledgeGraph:
    """
    Billion-scale knowledge graph using 256 FAISS shards.

    Architecture:
    - 256 shards distributed by ID hash prefix
    - Each shard: independent FAISS index + metadata store
    - Search: parallel query all shards → merge top-K results
    - Store: hash ID → write to correct shard

    Backwards compatible: can fall back to single-store mode.
    """

    def __init__(
        self,
        storage: Optional[LocalStorage] = None,
        embedding_model: str = "all-MiniLM-L6-v2",
        shard_count: int = 256,
        use_faiss: bool = True,
        base_path: str = None
    ):
        self.storage = storage
        self.embedding_model_name = embedding_model
        self.shard_count = shard_count
        self.use_faiss = use_faiss
        self.base_path = Path(base_path or (storage.base_path if storage else "Z:/cortex_data"))

        # Embedding model (lazy)
        self.embedder = None

        # Shard tracking
        self.shards: Dict[str, faiss.Index] = {}
        self.shard_metadata: Dict[str, List[Dict[str, Any]]] = {}
        self.shard_paths: Dict[str, Path] = {}

        # For backwards compatibility with single-store mode
        self.single_graph: Optional[SingleGraph] = None
        self.sharded_mode = False  # Set to True if shard structure exists

        print(f"[SHARDED KG] Initializing (shard_count={shard_count})")

    def _get_embedder(self):
        """Lazy load embedding model."""
        if self.embedder is None:
            self.embedder = SentenceTransformer(self.embedding_model_name)
        return self.embedder

    def _shard_for_id(self, entry_id: str) -> str:
        """Get shard hex for entry ID."""
        shard_idx = int(entry_id[:2], 16) % self.shard_count
        return f"{shard_idx:02x}"

    def _init_shard_structure(self):
        """Initialize or load shard structure."""
        knowledge_dir = self.base_path / "knowledge_graph"

        # Check if sharded structure exists
        shards_dir = knowledge_dir / "shards"
        if not shards_dir.exists():
            print("[SHARDED KG] No sharded structure found, using single-store mode")
            self.single_graph = SingleGraph(
                storage=self.storage,
                embedding_model=self.embedding_model_name,
                use_faiss=self.use_faiss
            )
            return

        self.sharded_mode = True
        print(f"[SHARDED KG] Sharded mode active with {self.shard_count} shards")

        # Load shard indexes and metadata
        for i in range(self.shard_count):
            shard_hex = f"{i:02x}"
            shard_dir = shards_dir / shard_hex

            if not shard_dir.exists():
                continue

            # FAISS index
            index_path = self.base_path / "knowledge_graph" / "indexes" / f"faiss_shard_{shard_hex}.index"
            if index_path.exists():
                self.shards[shard_hex] = faiss.read_index(str(index_path))
            else:
                # Create empty index
                dim = self._get_embedder().get_sentence_embedding_dimension()
                self.shards[shard_hex] = faiss.IndexFlatL2(dim)

            # Metadata (load from meta.json)
            meta_path = shard_dir / "meta.json"
            if meta_path.exists():
                with open(meta_path, 'r') as f:
                    self.shard_metadata[shard_hex] = []  # Could load full metadata if stored

            self.shard_paths[shard_hex] = shard_dir

        print(f"[SHARDED KG] Loaded {len(self.shards)} shard indexes")

    async def search(
        self,
        query: str,
        k: int = 5,
        threshold: float = 0.85,
        use_text: bool = False  # Not supported in sharded mode currently
    ) -> List[Dict[str, Any]]:
        """
        Search across all shards in parallel.

        Returns top-K merged results sorted by similarity.
        """
        if not self.sharded_mode:
            return await self.single_graph.search(query, k, threshold, use_text)

        # Compute query embedding
        query_emb = self._get_embedder().encode(
            query,
            convert_to_numpy=True
        ).astype('float32').reshape(1, -1)

        # Search all shards in parallel
        tasks = []
        for shard_hex, index in self.shards.items():
            if index.ntotal == 0:
                continue
            tasks.append(self._search_shard(shard_hex, query_emb, k * 2))

        shard_results = await asyncio.gather(*tasks)

        # Merge results
        all_hits = []
        for shard_hex, hits in shard_results:
            for dist, faiss_id in zip(*hits):
                similarity = 1.0 / (1.0 + dist)
                if similarity >= threshold:
                    # Retrieve full metadata
                    entry = await self._get_entry_by_shard_faiss_id(shard_hex, faiss_id)
                    if entry:
                        entry['similarity'] = similarity
                        entry['shard'] = shard_hex
                        all_hits.append(entry)

        # Sort by similarity and return top K
        all_hits.sort(key=lambda x: x['similarity'], reverse=True)
        return all_hits[:k]

    async def _search_shard(
        self,
        shard_hex: str,
        query_emb: np.ndarray,
        k: int
    ) -> Tuple[str, Tuple[np.ndarray, np.ndarray]]:
        """Search single shard."""
        index = self.shards[shard_hex]
        if index.ntotal == 0:
            return shard_hex, (np.array([]), np.array([]))
        distances, ids = index.search(query_emb, min(k, index.ntotal))
        return shard_hex, (distances, ids)

    async def _get_entry_by_shard_faiss_id(
        self,
        shard_hex: str,
        faiss_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve full entry by FAISS ID within shard.
        TODO: Implement actual metadata lookup (store metadata files or query global DB).
        For now, can reconstruct from JSONL files.
        """
        # Option 1: Load from JSONL files by index position
        shard_dir = self.shard_paths[shard_hex]
        # We need to map faiss_id → (file, line)
        # Could use meta.json with file offsets or binary search

        # For prototype, return placeholder
        return {
            'id': f"{shard_hex}_{faiss_id}",
            'question': '(placeholder - implement metadata lookup)',
            'answer': '',
            'similarity': 0.0,
            'match_type': 'vector'
        }

    async def store(
        self,
        question: str,
        answer: str,
        metadata: Optional[Dict[str, Any]] = None,
        source_teacher: Optional[str] = None,
        verification_source: Optional[str] = None,
        topics: Optional[List[str]] = None
    ) -> str:
        """
        Store entry to appropriate shard.

        Returns entry ID.
        """
        # Generate entry ID
        import hashlib
        entry_id = hashlib.sha256(f"{question}:{answer}".encode()).hexdigest()[:32]

        # Determine shard
        shard_hex = self._shard_for_id(entry_id)

        # Prepare entry (without embedding for storage in JSONL)
        entry = {
            'id': entry_id,
            'q': question,
            'a': answer,
            't': topics or ['general'],
            'd': metadata.get('difficulty', 'intermediate') if metadata else 'intermediate',
            's': source_teacher or 'unknown',
            'v': verification_source or '',
            'c': metadata.get('confidence', 0.0) if metadata else 0.0,
            'p': metadata.get('processing_time_ms', 0) if metadata else 0,
            'ts': metadata.get('saved_at') if metadata else ''
        }

        # Append to shard file
        await self._append_to_shard(shard_hex, entry)

        # Update FAISS index
        if self.use_faiss and shard_hex in self.shards:
            embedding = self._get_embedder().encode(question).astype('float32')
            index = self.shards[shard_hex]
            faiss_id = index.ntotal
            index.add(embedding.reshape(1, -1))
            # Save index
            index_path = self.base_path / "knowledge_graph" / "indexes" / f"faiss_shard_{shard_hex}.index"
            faiss.write_index(index, str(index_path))

        return entry_id

    async def _append_to_shard(self, shard_hex: str, entry: Dict[str, Any]):
        """Append entry to shard's JSONL file."""
        shard_dir = self.base_path / "knowledge_graph" / "shards" / shard_hex
        shard_dir.mkdir(parents=True, exist_ok=True)

        # Determine file number (increment from existing)
        existing_files = sorted(shard_dir.glob("*.jsonl.gz"))
        file_num = len(existing_files)
        filepath = shard_dir / f"{file_num}.jsonl.gz"

        import gzip
        with gzip.open(filepath, 'at', compresslevel=6) as f:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')

        # Update shard metadata
        meta_path = shard_dir / "meta.json"
        if meta_path.exists():
            with open(meta_path, 'r') as f:
                meta = json.load(f)
        else:
            meta = {'total_entries': 0, 'file_count': 0}
        meta['total_entries'] += 1
        meta['file_count'] = file_num + 1
        with open(meta_path, 'w') as f:
            json.dump(meta, f)

    def count(self) -> int:
        """Total entries across all shards."""
        if self.sharded_mode:
            total = 0
            for meta in self.shard_metadata.values():
                # Would need actual count from meta
                pass
            # For now, sum from meta files
            shards_dir = self.base_path / "knowledge_graph" / "shards"
            if shards_dir.exists():
                for shard_dir in shards_dir.glob("[0-9a-f][0-9a-f]"):
                    meta_file = shard_dir / "meta.json"
                    if meta_file.exists():
                        with open(meta_file, 'r') as f:
                            meta = json.load(f)
                            total += meta.get('total_entries', 0)
            return total
        return self.single_graph.count() if self.single_graph else 0

    def get_stats(self) -> Dict[str, Any]:
        """Get statistics."""
        if self.sharded_mode:
            return {
                'sharded': True,
                'shard_count': len(self.shards),
                'total_entries': self.count(),
                'base_path': str(self.base_path)
            }
        return self.single_graph.get_stats() if self.single_graph else {}


# Convenience
async def get_sharded_knowledge_graph(
    base_path: str = "Z:/cortex_data",
    shard_count: int = 256
) -> ShardedKnowledgeGraph:
    """Factory: create or load sharded knowledge graph."""
    storage = LocalStorage(base_path=base_path)
    kg = ShardedKnowledgeGraph(
        storage=storage,
        base_path=base_path,
        shard_count=shard_count
    )
    kg._init_shard_structure()
    return kg
