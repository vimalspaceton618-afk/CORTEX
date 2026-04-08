"""Local file storage for knowledge repository using Z: drive."""

import os
import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
import aiofiles
import asyncio


class LocalStorage:
    """
    Writes knowledge entries to local filesystem (Z: drive).
    Organizes data in a directory structure with date-based partitioning.
    """

    def __init__(self, base_path: str = "Z:/cortex_data"):
        """
        Initialize storage.

        Args:
            base_path: Root directory for all CORTEX data (e.g., Z:/cortex_data)
        """
        self.base_path = Path(base_path)
        self.knowledge_dir = self.base_path / "knowledge_graph"
        self.mistake_dir = self.base_path / "mistakes"
        self.embeddings_dir = self.base_path / "embeddings_cache"

        # Ensure directories exist
        self.knowledge_dir.mkdir(parents=True, exist_ok=True)
        self.mistake_dir.mkdir(parents=True, exist_ok=True)
        self.embeddings_dir.mkdir(parents=True, exist_ok=True)

    def _generate_filename(self, question: str) -> str:
        """Generate unique filename from question."""
        # Create safe filename from question hash
        question_hash = hashlib.sha256(question.encode()).hexdigest()[:16]
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        return f"{timestamp}_{question_hash}.json"

    def _get_partition_path(self, date: Optional[datetime] = None) -> Path:
        """Get partition directory based on date (year/month)."""
        if date is None:
            date = datetime.utcnow()
        year = date.strftime("%Y")
        month = date.strftime("%m")
        partition = self.knowledge_dir / year / month
        partition.mkdir(parents=True, exist_ok=True)
        return partition

    async def save_entry(self, entry: Dict[str, Any]) -> str:
        """
        Save a knowledge entry to disk.

        Args:
            entry: Dictionary containing question, answer, metadata, embeddings, etc.

        Returns:
            Path to saved file (relative to base_path)
        """
        # Add metadata
        entry['saved_at'] = datetime.utcnow().isoformat()
        if 'id' not in entry:
            entry['id'] = self._generate_id(entry['question'])

        # Determine partition and filename
        partition = self._get_partition_path()
        filename = self._generate_filename(entry['question'])
        filepath = partition / filename

        # Write atomically
        temp_path = filepath.with_suffix('.tmp')
        async with aiofiles.open(temp_path, 'w') as f:
            await f.write(json.dumps(entry, indent=2))
        temp_path.rename(filepath)

        return str(filepath.relative_to(self.base_path))

    def _generate_id(self, question: str) -> str:
        """Generate deterministic ID from question."""
        return hashlib.sha256(question.encode()).hexdigest()[:32]

    async def load_entry(self, filepath: str) -> Optional[Dict[str, Any]]:
        """Load a knowledge entry from disk."""
        full_path = self.base_path / filepath
        try:
            async with aiofiles.open(full_path, 'r') as f:
                content = await f.read()
                return json.loads(content)
        except Exception as e:
            print(f"[ERROR] Failed to load {filepath}: {e}")
            return None

    async def list_entries(self, date_filter: Optional[str] = None) -> List[str]:
        """
        List all knowledge entry filepaths.

        Args:
            date_filter: Optional date string like "2025-04" to filter by month
        """
        entries = []

        if date_filter:
            # Parse YYYY-MM
            year, month = date_filter.split('-')
            search_dir = self.knowledge_dir / year / month
        else:
            search_dir = self.knowledge_dir

        if not search_dir.exists():
            return []

        for root, dirs, files in os.walk(search_dir):
            for file in files:
                if file.endswith('.json'):
                    full_path = Path(root) / file
                    entries.append(str(full_path.relative_to(self.base_path)))

        return entries

    async def save_mistake(self, mistake: Dict[str, Any]) -> str:
        """Save a mistake registry entry."""
        mistake['saved_at'] = datetime.utcnow().isoformat()
        filename = self._generate_filename(mistake.get('pattern', 'mistake')) + '.json'
        filepath = self.mistake_dir / filename

        async with aiofiles.open(filepath, 'w') as f:
            await f.write(json.dumps(mistake, indent=2))

        return str(filepath.relative_to(self.base_path))

    async def load_all_mistakes(self) -> List[Dict[str, Any]]:
        """Load all mistake entries."""
        mistakes = []
        for root, dirs, files in os.walk(self.mistake_dir):
            for file in files:
                if file.endswith('.json'):
                    filepath = Path(root) / file
                    async with aiofiles.open(filepath, 'r') as f:
                        content = await f.read()
                        mistakes.append(json.loads(content))
        return mistakes

    def get_embeddings_cache_path(self, key: str) -> Path:
        """Get path for cached embedding."""
        key_hash = hashlib.sha256(key.encode()).hexdigest()[:16]
        return self.embeddings_dir / f"{key_hash}.npy"

    async def cache_embedding(self, key: str, embedding: Any):
        """Cache an embedding vector."""
        import numpy as np
        cache_path = self.get_embeddings_cache_path(key)
        np.save(cache_path, embedding)

    async def load_cached_embedding(self, key: str) -> Optional[Any]:
        """Load cached embedding if exists."""
        import numpy as np
        cache_path = self.get_embeddings_cache_path(key)
        if cache_path.exists():
            return np.load(cache_path)
        return None

    def get_storage_stats(self) -> Dict[str, Any]:
        """Get statistics about stored knowledge."""
        total_files = 0
        total_size = 0
        for root, dirs, files in os.walk(self.knowledge_dir):
            for file in files:
                if file.endswith('.json'):
                    total_files += 1
                    total_size += (Path(root) / file).stat().st_size

        mistake_files = sum(1 for _ in self.mistake_dir.glob('**/*.json'))

        return {
            'knowledge_entries': total_files,
            'knowledge_size_mb': total_size / (1024*1024),
            'mistake_entries': mistake_files,
            'base_path': str(self.base_path)
        }


# Global storage instance (can be overridden)
_storage: Optional[LocalStorage] = None


def get_storage(base_path: str = "Z:/cortex_data") -> LocalStorage:
    """Get or create global storage instance."""
    global _storage
    if _storage is None:
        _storage = LocalStorage(base_path=base_path)
    return _storage
