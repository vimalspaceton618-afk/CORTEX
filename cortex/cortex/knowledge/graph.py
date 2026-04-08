"""Knowledge Graph: Fast retrieval of verified Q&A pairs with FAISS vector search."""

import asyncio
import sqlite3
import numpy as np
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
import pickle
from pathlib import Path
import json
import faiss
from sentence_transformers import SentenceTransformer
import logging

from .storage import LocalStorage, get_storage

logger = logging.getLogger(__name__)


class KnowledgeGraph:
    """
    Local knowledge repository with vector search using FAISS.
    Stores verified Q&A pairs with fast similarity retrieval.
    """

    def __init__(
        self,
        storage: Optional[LocalStorage] = None,
        embedding_model: str = "all-MiniLM-L6-v2",
        index_dim: int = 384,
        use_faiss: bool = True
    ):
        self.storage = storage or get_storage()
        self.embedding_model = SentenceTransformer(embedding_model)
        self.index_dim = index_dim
        self.use_faiss = use_faiss

        # SQLite database
        self.db_path = self.storage.knowledge_dir / "local_index.db"
        self._init_db()

        # FAISS setup
        if self.use_faiss:
            self.faiss_path = self.storage.knowledge_dir / "faiss.index"
            self.id_map_path = self.storage.knowledge_dir / "faiss_id_map.json"
            self.index = self._load_or_create_faiss()
            self.id_map: Dict[int, str] = self._load_id_map()
            self.next_faiss_id: int = max(self.id_map.keys()) + 1 if self.id_map else 0
            # Sync if DB has entries not in FAISS
            self._sync_faiss_if_needed()
        else:
            self.index = None
            self.id_map = {}
            self.next_faiss_id = 0

    def _init_db(self):
        """Initialize SQLite database schema."""
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()

        cur.execute('''
            CREATE TABLE IF NOT EXISTS entries (
                id TEXT PRIMARY KEY,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                embedding BLOB,
                metadata TEXT,
                source_teacher TEXT,
                verification_source TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cur.execute('''
            CREATE TABLE IF NOT EXISTS topics (
                entry_id TEXT,
                topic TEXT,
                FOREIGN KEY(entry_id) REFERENCES entries(id) ON DELETE CASCADE
            )
        ''')

        conn.commit()
        conn.close()

    # ========== FAISS ID MAP ==========

    def _load_id_map(self) -> Dict[int, str]:
        """Load FAISS ID -> entry_id mapping."""
        if self.id_map_path.exists():
            try:
                with open(self.id_map_path, 'r') as f:
                    data = json.load(f)
                    return {int(k): v for k, v in data.items()}
            except Exception as e:
                logger.warning(f"Failed to load ID map: {e}")
        return {}

    def _save_id_map(self):
        """Save FAISS ID mapping."""
        try:
            serializable = {str(k): v for k, v in self.id_map.items()}
            with open(self.id_map_path, 'w') as f:
                json.dump(serializable, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to save ID map: {e}")

    # ========== FAISS INDEX ==========

    def _load_or_create_faiss(self) -> faiss.Index:
        """Load existing FAISS index or create a new one."""
        if self.faiss_path.exists():
            try:
                logger.info(f"Loading FAISS index from {self.faiss_path}")
                index = faiss.read_index(str(self.faiss_path))
                if isinstance(index, faiss.IndexIDMap):
                    return index
                # Wrap if needed
                return faiss.IndexIDMap(index)
            except Exception as e:
                logger.warning(f"FAISS load failed: {e}. Creating new.")
        logger.info(f"Creating new FAISS index (dim={self.index_dim})")
        return faiss.IndexIDMap(faiss.IndexFlatL2(self.index_dim))

    def _save_faiss(self):
        """Save FAISS index to disk."""
        if self.index and self.index.ntotal > 0:
            try:
                faiss.write_index(self.index, str(self.faiss_path))
            except Exception as e:
                logger.warning(f"Failed to save FAISS index: {e}")

    def _rebuild_faiss_from_db(self):
        """Rebuild FAISS index and ID map from all SQLite entries."""
        if not self.use_faiss or not self.index:
            return

        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()
        cur.execute("SELECT id, embedding FROM entries WHERE embedding IS NOT NULL")
        rows = cur.fetchall()
        conn.close()

        if not rows:
            logger.info("No entries to index in FAISS")
            self.id_map = {}
            self.next_faiss_id = 0
            self._save_id_map()
            return

        logger.info(f"Rebuilding FAISS index from {len(rows)} entries...")
        self.index.reset()
        self.id_map = {}

        embeddings = []
        ids = []
        for idx, (entry_id, emb_blob) in enumerate(rows):
            try:
                emb = pickle.loads(emb_blob)
                embeddings.append(emb)
                faiss_id = idx
                ids.append(faiss_id)
                self.id_map[faiss_id] = entry_id
            except Exception as e:
                logger.warning(f"Failed to load embedding for {entry_id}: {e}")

        if embeddings:
            embeddings_np = np.array(embeddings, dtype='float32')
            ids_np = np.array(ids, dtype='int64')
            self.index.add_with_ids(embeddings_np, ids_np)
            self.next_faiss_id = len(embeddings)
            logger.info(f"FAISS index rebuilt with {self.index.ntotal} vectors")
            self._save_faiss()
            self._save_id_map()

    def _sync_faiss_if_needed(self):
        """Add any new DB entries to FAISS that are missing."""
        if not self.use_faiss or not self.index:
            return

        # Get all entry IDs from DB
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()
        cur.execute("SELECT id, embedding FROM entries")
        all_rows = cur.fetchall()
        conn.close()

        all_entry_ids = set(row[0] for row in all_rows if row[1] is not None)
        already_have = set(self.id_map.values())
        missing_ids = all_entry_ids - already_have

        if missing_ids:
            logger.info(f"Syncing {len(missing_ids)} missing entries to FAISS")
            # Fetch only missing entries
            conn = sqlite3.connect(self.db_path)
            cur = conn.cursor()
            placeholders = ','.join('?' for _ in missing_ids)
            cur.execute(
                f"SELECT id, embedding FROM entries WHERE id IN ({placeholders})",
                list(missing_ids)
            )
            rows = cur.fetchall()
            conn.close()

            new_embeddings = []
            new_ids = []
            for entry_id, emb_blob in rows:
                try:
                    emb = pickle.loads(emb_blob)
                    faiss_id = self.next_faiss_id
                    self.next_faiss_id += 1
                    new_embeddings.append(emb)
                    new_ids.append(faiss_id)
                    self.id_map[faiss_id] = entry_id
                except Exception as e:
                    logger.warning(f"Failed to load embedding for {entry_id}: {e}")

            if new_embeddings:
                embeddings_np = np.array(new_embeddings, dtype='float32')
                ids_np = np.array(new_ids, dtype='int64')
                self.index.add_with_ids(embeddings_np, ids_np)
                self._save_faiss()
                self._save_id_map()
                logger.info(f"Added {len(new_embeddings)} vectors to FAISS")

    # ========== PUBLIC API ==========

    def compute_embedding(self, text: str) -> np.ndarray:
        """Compute embedding for a text string."""
        embedding = self.embedding_model.encode(text, convert_to_numpy=True)
        return embedding.astype('float32')

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
        Store a Q&A pair in knowledge graph.

        Returns:
            Entry ID
        """
        # Compute embedding
        embedding = self.compute_embedding(question)

        # Generate deterministic entry ID
        import hashlib
        entry_id = hashlib.sha256(f"{question}:{answer}".encode()).hexdigest()[:32]

        # Prepare metadata
        if metadata is None:
            metadata = {}
        metadata_json = json.dumps(metadata)

        # Store in SQLite
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()

        try:
            cur.execute('''
                INSERT OR REPLACE INTO entries
                (id, question, answer, embedding, metadata, source_teacher, verification_source)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                entry_id,
                question,
                answer,
                pickle.dumps(embedding),
                metadata_json,
                source_teacher,
                verification_source
            ))

            # Store topics
            if topics:
                cur.execute("DELETE FROM topics WHERE entry_id = ?", (entry_id,))
                for topic in topics:
                    cur.execute("INSERT INTO topics (entry_id, topic) VALUES (?, ?)", (entry_id, topic))

            conn.commit()
        finally:
            conn.close()

        # Add to FAISS index (if enabled)
        if self.use_faiss and self.index:
            # Check if entry already in FAISS (via id_map)
            existing_faiss_ids = [fid for fid, eid in self.id_map.items() if eid == entry_id]
            if existing_faiss_ids:
                # Entry already indexed - could update but FAISS doesn't support it easily.
                # For now, leave as is (duplicate content okay)
                pass
            else:
                # Add new entry to FAISS
                faiss_id = self.next_faiss_id
                self.next_faiss_id += 1
                self.index.add_with_ids(
                    embedding.reshape(1, -1),
                    np.array([faiss_id], dtype='int64')
                )
                self.id_map[faiss_id] = entry_id
                self._save_faiss()
                self._save_id_map()

        # Also persist to file storage (backup)
        entry = {
            'id': entry_id,
            'question': question,
            'answer': answer,
            'embedding': embedding.tolist(),
            'metadata': metadata,
            'source_teacher': source_teacher,
            'verification_source': verification_source,
            'topics': topics or [],
            'saved_at': datetime.utcnow().isoformat()
        }
        # Fire and forget storage write
        asyncio.create_task(self.storage.save_entry(entry))

        return entry_id

    async def search(
        self,
        query: str,
        k: int = 5,
        threshold: float = 0.85,
        use_text: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Search knowledge graph for similar questions.

        Returns list of entries with similarity scores.
        """
        results = []
        query_emb = self.compute_embedding(query)

        # FAISS vector search
        if self.use_faiss and self.index and self.index.ntotal > 0:
            # Search more to allow for duplicates and threshold filtering
            search_k = min(k * 3, self.index.ntotal)
            distances, faiss_ids = self.index.search(query_emb.reshape(1, -1), search_k)

            # Map FAISS IDs back to entry IDs
            seen_entry_ids = set()
            for dist, faiss_id in zip(distances[0], faiss_ids[0]):
                if faiss_id == -1:  # FAISS null
                    continue
                entry_id = self.id_map.get(faiss_id)
                if not entry_id or entry_id in seen_entry_ids:
                    continue
                seen_entry_ids.add(entry_id)

                # Convert L2 distance to similarity (0-1)
                similarity = 1.0 / (1.0 + dist)

                if similarity >= threshold:
                    entry = await self.get_by_id(entry_id)
                    if entry:
                        entry['similarity'] = similarity
                        entry['match_type'] = 'vector'
                        results.append(entry)

        # Text search fallback
        if use_text and len(results) < k:
            text_results = await self._text_search(query, k=k - len(results))
            for entry in text_results:
                if entry['id'] not in {r['id'] for r in results}:
                    entry['match_type'] = 'text'
                    results.append(entry)

        # Sort by similarity (descending)
        results.sort(key=lambda x: x.get('similarity', 0), reverse=True)
        return results[:k]

    async def _text_search(self, query: str, k: int = 5) -> List[Dict[str, Any]]:
        """Simple text search using SQLite LIKE."""
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()

        search_term = f'%{query}%'
        cur.execute('''
            SELECT * FROM entries
            WHERE question LIKE ? OR answer LIKE ?
            LIMIT ?
        ''', (search_term, search_term, k))

        rows = cur.fetchall()
        conn.close()

        results = []
        for row in rows:
            entry = self._row_to_dict(row)
            entry['similarity'] = 0.7  # Fixed for text match
            results.append(entry)

        return results

    def _row_to_dict(self, row) -> Dict[str, Any]:
        """Convert SQLite row to dict."""
        columns = [
            'id', 'question', 'answer', 'embedding', 'metadata',
            'source_teacher', 'verification_source', 'created_at'
        ]
        entry = dict(zip(columns, row))
        entry['embedding'] = None
        entry['metadata'] = json.loads(entry['metadata']) if entry['metadata'] else {}
        return entry

    async def get_by_id(self, entry_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve entry by ID."""
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()
        cur.execute("SELECT * FROM entries WHERE id = ?", (entry_id,))
        row = cur.fetchone()
        conn.close()

        if row:
            return self._row_to_dict(row)
        return None

    async def delete(self, entry_id: str):
        """Delete an entry."""
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()
        cur.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
        cur.execute("DELETE FROM topics WHERE entry_id = ?", (entry_id,))
        conn.commit()
        conn.close()

        # Note: FAISS doesn't support deletion; we'll just leave the vector
        # and filter it out via id_map removal next time
        # For now, rebuild FAISS to keep it clean
        if self.use_faiss:
            self._rebuild_faiss_from_db()

    def count(self) -> int:
        """Total number of entries."""
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM entries")
        count = cur.fetchone()[0]
        conn.close()
        return count

    def get_stats(self) -> Dict[str, Any]:
        """Get statistics."""
        total = self.count()
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()

        cur.execute("SELECT source_teacher, COUNT(*) FROM entries GROUP BY source_teacher")
        by_teacher = dict(cur.fetchall())

        cur.execute("SELECT topic, COUNT(*) FROM topics GROUP BY topic LIMIT 10")
        top_topics = cur.fetchall()

        conn.close()

        return {
            'total_entries': total,
            'by_teacher': by_teacher,
            'top_topics': top_topics,
            'faiss_index_size': self.index.ntotal if self.index else 0,
            'faiss_id_map_size': len(self.id_map)
        }

    def persist_faiss(self):
        """Explicitly save FAISS state."""
        if self.use_faiss:
            self._save_faiss()
            self._save_id_map()


# Convenience
def get_knowledge_graph() -> KnowledgeGraph:
    storage = get_storage()
    return KnowledgeGraph(storage=storage)
