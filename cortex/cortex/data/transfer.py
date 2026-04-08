"""
Knowledge Transfer and Merge Utility for CORTEX.

Allows transferring pretrained knowledge from GPU training store to main CORTEX_DATA.
Supports multiple modes:
- Copy: Replace destination with source
- Merge: Combine source and destination, deduplicate by entry ID
- Sync: Incremental sync (only new entries from source)
"""

import shutil
import sqlite3
import json
import pickle
import numpy as np
from pathlib import Path
from typing import Dict, List, Any, Optional, Set
from datetime import datetime
import faiss
from dataclasses import dataclass


@dataclass
class TransferStats:
    """Statistics for a transfer operation."""
    source_entries: int
    dest_entries_before: int
    dest_entries_after: int
    entries_copied: int
    entries_skipped: int
    entries_merged: int
    errors: List[str]
    duration_seconds: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            'source_entries': self.source_entries,
            'dest_entries_before': self.dest_entries_before,
            'dest_entries_after': self.dest_entries_after,
            'entries_copied': self.entries_copied,
            'entries_skipped': self.entries_skipped,
            'entries_merged': self.entries_merged,
            'errors': self.errors,
            'duration_seconds': self.duration_seconds
        }


class KnowledgeTransfer:
    """Transfer knowledge between CORTEX stores."""

    def __init__(
        self,
        source_dir: Path,
        dest_dir: Path,
        batch_size: int = 1000
    ):
        """
        Initialize transfer.

        Args:
            source_dir: Source pretrained store (e.g., E:/pretrained_store)
            dest_dir: Destination CORTEX_DATA (e.g., Z:/cortex_data)
            batch_size: Batch size for database operations
        """
        self.source_dir = Path(source_dir)
        self.dest_dir = Path(dest_dir)
        self.batch_size = batch_size
        self.stats = TransferStats(
            source_entries=0,
            dest_entries_before=0,
            dest_entries_after=0,
            entries_copied=0,
            entries_skipped=0,
            entries_merged=0,
            errors=[],
            duration_seconds=0
        )

    def _get_db_path(self, base_dir: Path) -> Path:
        """Get SQLite database path."""
        return base_dir / "knowledge_graph" / "local_index.db"

    def _get_faiss_path(self, base_dir: Path) -> Path:
        """Get FAISS index path."""
        return base_dir / "knowledge_graph" / "faiss.index"

    def _get_id_map_path(self, base_dir: Path) -> Path:
        """Get FAISS ID map path."""
        return base_dir / "knowledge_graph" / "faiss_id_map.json"

    def _get_json_dir(self, base_dir: Path) -> Path:
        """Get JSONL knowledge directory."""
        return base_dir / "knowledge_graph"

    def count_entries(self, base_dir: Path) -> int:
        """Count total entries in a knowledge store."""
        db_path = self._get_db_path(base_dir)
        if not db_path.exists():
            return 0
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM entries")
        count = cur.fetchone()[0]
        conn.close()
        return count

    def get_all_entry_ids(self, db_path: Path) -> Set[str]:
        """Get set of all entry IDs from database."""
        if not db_path.exists():
            return set()
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("SELECT id FROM entries")
        ids = {row[0] for row in cur.fetchall()}
        conn.close()
        return ids

    def copy_file(self, src: Path, dst: Path, overwrite: bool = True):
        """Copy file with error handling."""
        try:
            if overwrite and dst.exists():
                dst.unlink()
            shutil.copy2(src, dst)
            return True
        except Exception as e:
            self.stats.errors.append(f"Failed to copy {src} -> {dst}: {e}")
            return False

    def copy_directory(self, src: Path, dst: Path, overwrite: bool = True):
        """Copy entire directory."""
        try:
            if dst.exists() and overwrite:
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
            return True
        except Exception as e:
            self.stats.errors.append(f"Failed to copy directory {src} -> {dst}: {e}")
            return False

    def transfer_copy_mode(self) -> TransferStats:
        """
        Copy mode: Replace destination entirely with source.

        This is the simplest and fastest - just copy all files.
        """
        print("[TRANSFER] Copy mode: Replacing destination with source")
        start_time = datetime.now()

        # Ensure destination parent exists
        self.dest_dir.parent.mkdir(parents=True, exist_ok=True)

        # Remove destination if exists
        if self.dest_dir.exists():
            print("[TRANSFER] Removing existing destination...")
            shutil.rmtree(self.dest_dir)

        # Copy entire source directory
        print("[TRANSFER] Copying files...")
        success = self.copy_directory(self.source_dir, self.dest_dir)

        if success:
            self.stats.entries_copied = self.count_entries(self.source_dir)
            self.stats.dest_entries_before = 0
            self.stats.dest_entries_after = self.stats.entries_copied
            print(f"[TRANSFER] Copied {self.stats.entries_copied} entries")
        else:
            self.stats.errors.append("Copy mode failed")

        self.stats.duration_seconds = (datetime.now() - start_time).total_seconds()
        return self.stats

    def transfer_merge_mode(
        self,
        deduplicate: bool = True,
        prefer_source: bool = True
    ) -> TransferStats:
        """
        Merge mode: Combine source and destination, deduplicate.

        Args:
            deduplicate: Skip entries that exist in both (based on entry ID)
            prefer_source: When duplicate, keep source version (True) or dest version (False)
        """
        print("[TRANSFER] Merge mode: Combining source and destination")
        start_time = datetime.now()

        source_db = self._get_db_path(self.source_dir)
        dest_db = self._get_db_path(self.dest_dir)

        if not source_db.exists():
            raise FileNotFoundError(f"Source database not found: {source_db}")
        if not dest_db.exists():
            raise FileNotFoundError(f"Dest database not found: {dest_db}")

        # Get entry IDs
        print("[TRANSFER] Scanning entry IDs...")
        source_ids = self.get_all_entry_ids(source_db)
        dest_ids = self.get_all_entry_ids(dest_db)

        self.stats.source_entries = len(source_ids)
        self.stats.dest_entries_before = len(dest_ids)

        print(f"[TRANSFER] Source: {len(source_ids)} entries")
        print(f"[TRANSFER] Destination before: {len(dest_ids)} entries")

        if deduplicate:
            new_ids = source_ids - dest_ids
            duplicates = source_ids & dest_ids
            self.stats.entries_merged = len(duplicates)
            print(f"[TRANSFER] Duplicates found: {len(duplicates)}")
        else:
            new_ids = source_ids
            self.stats.entries_merged = 0

        self.stats.entries_copied = len(new_ids)
        print(f"[TRANSFER] Entries to copy: {len(new_ids)}")

        if len(new_ids) == 0 and deduplicate:
            print("[TRANSFER] No new entries to add")
            self.stats.entries_skipped = 0
            self.stats.dest_entries_after = len(dest_ids)
            self.stats.duration_seconds = (datetime.now() - start_time).total_seconds()
            return self.stats

        # Connect to databases
        source_conn = sqlite3.connect(source_db)
        source_cur = source_conn.cursor()
        dest_conn = sqlite3.connect(dest_db)
        dest_cur = dest_conn.cursor()
        dest_cur.execute("PRAGMA journal_mode=WAL")
        dest_cur.execute("PRAGMA synchronous=NORMAL")

        # Fetch new entries in batches
        copied_count = 0
        batch_ids = list(new_ids)[:self.batch_size] if self.batch_size else list(new_ids)

        while batch_ids:
            placeholders = ','.join('?' for _ in batch_ids)
            source_cur.execute(
                f"SELECT * FROM entries WHERE id IN ({placeholders})",
                batch_ids
            )
            rows = source_cur.fetchall()

            for row in source_cur:
                # row: (id, question, answer, embedding, metadata, source_teacher, verification_source, created_at)
                entry_id = row[0]

                # Check if dest already has it (in case we didn't deduplicate or race condition)
                dest_cur.execute("SELECT id FROM entries WHERE id = ?", (entry_id,))
                if dest_cur.fetchone():
                    self.stats.entries_skipped += 1
                    continue

                try:
                    dest_cur.execute('''
                        INSERT OR REPLACE INTO entries
                        (id, question, answer, embedding, metadata, source_teacher, verification_source, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', row)
                    copied_count += 1
                except Exception as e:
                    self.stats.errors.append(f"Failed to insert entry {entry_id}: {e}")

            dest_conn.commit()
            print(f"\r[TRANSFER] Copied {copied_count}/{len(new_ids)} entries...", end='', flush=True)

            # Get next batch
            processed = len(batch_ids)
            if self.batch_size:
                remaining = list(new_ids)[processed:processed + self.batch_size]
                batch_ids = remaining if remaining else None
            else:
                batch_ids = None

        print(f"\n[TRANSFER] Finalizing...")

        # Copy topics table
        source_cur.execute("SELECT entry_id, topic FROM topics")
        for entry_id, topic in source_cur.fetchall():
            dest_cur.execute("INSERT OR IGNORE INTO topics (entry_id, topic) VALUES (?, ?)", (entry_id, topic))
        dest_conn.commit()

        # Close connections
        source_conn.close()
        dest_conn.close()

        self.stats.entries_copied = copied_count
        self.stats.dest_entries_after = self.count_entries(self.dest_dir)

        print(f"[TRANSFER] Copied: {copied_count}, Skipped: {self.stats.entries_skipped}")
        print(f"[TRANSFER] Destination after: {self.stats.dest_entries_after} entries")

        # Merge FAISS index
        print("[TRANSFER] Merging FAISS indices...")
        self._merge_faiss_indices()

        # Copy mistakes directory (append only, no dedup)
        self._merge_mistakes_directory()

        self.stats.duration_seconds = (datetime.now() - start_time).total_seconds()
        return self.stats

    def transfer_sync_mode(self, since: Optional[datetime] = None) -> TransferStats:
        """
        Sync mode: Only copy entries newer than 'since' timestamp.

        This is incremental - only new entries from source are added.
        """
        print("[TRANSFER] Sync mode: Incremental transfer")
        start_time = datetime.now()

        source_db = self._get_db_path(self.source_dir)
        dest_db = self._get_db_path(self.dest_dir)

        if not source_db.exists():
            raise FileNotFoundError(f"Source database not found: {source_db}")
        if not dest_db.exists():
            # Dest doesn't exist, fallback to copy mode
            print("[TRANSFER] Dest not found, falling back to copy mode")
            return self.transfer_copy_mode()

        # Get source entries since timestamp
        source_conn = sqlite3.connect(source_db)
        source_cur = source_conn.cursor()

        if since:
            since_str = since.isoformat()
            source_cur.execute(
                "SELECT id FROM entries WHERE saved_at > ? OR created_at > ?",
                (since_str, since_str)
            )
        else:
            source_cur.execute("SELECT id FROM entries")

        source_ids = {row[0] for row in source_cur.fetchall()}
        source_conn.close()

        self.stats.source_entries = len(source_ids)
        dest_ids = self.get_all_entry_ids(dest_db)
        self.stats.dest_entries_before = len(dest_ids)

        new_ids = source_ids - dest_ids
        self.stats.entries_copied = len(new_ids)

        print(f"[TRANSFER] Source entries: {len(source_ids)}")
        print(f"[TRANSFER] New entries to sync: {len(new_ids)}")

        if len(new_ids) == 0:
            print("[TRANSFER] Nothing to sync")
            self.stats.dest_entries_after = len(dest_ids)
            self.stats.duration_seconds = (datetime.now() - start_time).total_seconds()
            return self.stats

        # Copy only new entries (similar to merge but filtered by timestamp)
        source_conn = sqlite3.connect(source_db)
        source_cur = source_conn.cursor()
        dest_conn = sqlite3.connect(dest_db)
        dest_cur = dest_conn.cursor()
        dest_cur.execute("PRAGMA journal_mode=WAL")

        batch_size = self.batch_size
        copied = 0

        for i in range(0, len(new_ids), batch_size):
            batch = list(new_ids)[i:i+batch_size]
            placeholders = ','.join('?' for _ in batch)
            source_cur.execute(
                f"SELECT * FROM entries WHERE id IN ({placeholders})",
                batch
            )
            for row in source_cur:
                dest_cur.execute('''
                    INSERT OR REPLACE INTO entries
                    (id, question, answer, embedding, metadata, source_teacher, verification_source, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', row)
                copied += 1
            dest_conn.commit()
            print(f"\r[TRANSFER] Synced {copied}/{len(new_ids)}...", end='', flush=True)

        source_conn.close()
        dest_conn.close()

        self.stats.dest_entries_after = self.count_entries(self.dest_dir)
        print(f"\n[TRANSFER] Synced {copied} entries")

        # Rebuild FAISS for destination
        print("[TRANSFER] Rebuilding destination FAISS index...")
        self._rebuild_faiss(self.dest_dir)

        self.stats.duration_seconds = (datetime.now() - start_time).total_seconds()
        return self.stats

    def _merge_faiss_indices(self):
        """Merge FAISS indices from source and destination."""
        source_faiss = self._get_faiss_path(self.source_dir)
        dest_faiss = self._get_faiss_path(self.dest_dir)
        source_id_map = self._get_id_map_path(self.source_dir)
        dest_id_map = self._get_id_map_path(self.dest_dir)

        if not source_faiss.exists() and not dest_faiss.exists():
            print("[FAISS] No indices to merge")
            return

        # Load destination index (or create new)
        if dest_faiss.exists():
            print("[FAISS] Loading destination index...")
            dest_index = faiss.read_index(str(dest_faiss))
            with open(dest_id_map, 'r') as f:
                dest_id_map = {int(k): v for k, v in json.load(f).items()}
        else:
            print("[FAISS] Creating new destination index...")
            dest_index = faiss.IndexIDMap(faiss.IndexFlatL2(384))
            dest_id_map = {}

        next_faiss_id = max(dest_id_map.keys()) + 1 if dest_id_map else 0

        # Load source entries that we just copied
        source_db = self._get_db_path(self.source_dir)
        source_conn = sqlite3.connect(source_db)
        source_cur = source_conn.cursor()

        # Get the newly copied entry IDs (we need to fetch their embeddings)
        newly_copied_ids = list(set(self.get_all_entry_ids(source_db)) & set(self.get_all_entry_ids(self._get_db_path(self.dest_dir))))
        # Actually we can't easily know which ones were just copied, so we'll load all source embeddings
        # and check which ones exist in dest_id_map values

        # Load source index if exists
        if source_faiss.exists():
            print("[FAISS] Loading source index...")
            source_index = faiss.read_index(str(source_faiss))
            with open(source_id_map, 'r') as f:
                source_id_map = {int(k): v for k, v in json.load(f).items()}

            # Add vectors from source that aren't in dest
            added = 0
            for faiss_id in range(source_index.ntotal):
                if faiss_id in source_id_map:
                    entry_id = source_id_map[faiss_id]
                    if entry_id not in dest_id_map.values():
                        # Get embedding vector
                        source_index.reconstruct(faiss_id)
                        vector = np.array([source_index.reconstruct(faiss_id)], dtype='float32')
                        dest_index.add_with_ids(vector, np.array([next_faiss_id], dtype='int64'))
                        dest_id_map[next_faiss_id] = entry_id
                        next_faiss_id += 1
                        added += 1

            print(f"[FAISS] Added {added} vectors from source")
        else:
            print("[FAISS] Source index not found, building from database embeddings...")
            # Build from source database entries that aren't in dest
            source_cur.execute("SELECT id, embedding FROM entries")
            added = 0
            for entry_id, emb_blob in source_cur.fetchall():
                if entry_id not in dest_id_map.values():
                    try:
                        emb = pickle.loads(emb_blob)
                        vector = np.array([emb], dtype='float32')
                        dest_index.add_with_ids(vector, np.array([next_faiss_id], dtype='int64'))
                        dest_id_map[next_faiss_id] = entry_id
                        next_faiss_id += 1
                        added += 1
                    except Exception as e:
                        print(f"[WARN] Failed to load embedding for {entry_id}: {e}")
            print(f"[FAISS] Added {added} vectors from database")

        source_conn.close()

        # Save merged index
        print("[FAISS] Saving merged index...")
        faiss.write_index(dest_index, str(dest_faiss))
        with open(dest_id_map, 'w') as f:
            json.dump({str(k): v for k, v in dest_id_map.items()}, f, indent=2)

        print(f"[FAISS] Final index size: {dest_index.ntotal} vectors")

    def _rebuild_faiss(self, base_dir: Path):
        """Rebuild FAISS index from database."""
        db_path = self._get_db_path(base_dir)
        faiss_path = self._get_faiss_path(base_dir)
        id_map_path = self._get_id_map_path(base_dir)

        if not db_path.exists():
            return

        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("SELECT id, embedding FROM entries WHERE embedding IS NOT NULL")
        rows = cur.fetchall()
        conn.close()

        if not rows:
            print("[FAISS] No embeddings to rebuild")
            if faiss_path.exists():
                faiss_path.unlink()
            if id_map_path.exists():
                id_map_path.unlink()
            return

        print(f"[FAISS] Rebuilding index from {len(rows)} entries...")

        index = faiss.IndexIDMap(faiss.IndexFlatL2(384))
        id_map = {}

        for idx, (entry_id, emb_blob) in enumerate(rows):
            try:
                emb = pickle.loads(emb_blob)
                index.add_with_ids(
                    np.array([emb], dtype='float32'),
                    np.array([idx], dtype='int64')
                )
                id_map[idx] = entry_id
            except Exception as e:
                print(f"[WARN] Failed to load embedding for {entry_id}: {e}")

        faiss.write_index(index, str(faiss_path))
        with open(id_map_path, 'w') as f:
            json.dump({str(k): v for k, v in id_map.items()}, f, indent=2)

        print(f"[FAISS] Rebuilt with {index.ntotal} vectors")

    def _merge_mistakes_directory(self):
        """Copy and merge mistakes from source to destination."""
        source_mistakes = self.source_dir / "mistakes"
        dest_mistakes = self.dest_dir / "mistakes"

        if not source_mistakes.exists():
            return

        dest_mistakes.mkdir(parents=True, exist_ok=True)

        # Copy all JSON files (no dedup needed, just copy)
        copied = 0
        for json_file in source_mistakes.glob("**/*.json"):
            rel_path = json_file.relative_to(source_mistakes)
            dest_file = dest_mistakes / rel_path
            dest_file.parent.mkdir(parents=True, exist_ok=True)

            # If dest exists, skip (or could merge comparing timestamps)
            if dest_file.exists():
                continue

            if self.copy_file(json_file, dest_file):
                copied += 1

        print(f"[MISTAKES] Copied {copied} mistake registry files")

    def validate_stores(self) -> bool:
        """Validate that both stores have correct structure."""
        errors = []

        for name, base_dir in [("Source", self.source_dir), ("Destination", self.dest_dir)]:
            db_path = self._get_db_path(base_dir)
            faiss_path = self._get_faiss_path(base_dir)
            knowledge_dir = self._get_json_dir(base_dir)

            if not db_path.exists():
                errors.append(f"{name} database missing: {db_path}")
            if not knowledge_dir.exists():
                errors.append(f"{name} knowledge directory missing: {knowledge_dir}")

        if errors:
            print("[VALIDATE] Errors found:")
            for err in errors:
                print(f"  - {err}")
            return False

        print("[VALIDATE] Store structure valid")
        return True


def transfer(
    source: str,
    destination: str,
    mode: str = "merge",
    deduplicate: bool = True,
    prefer_source: bool = True
) -> TransferStats:
    """
    Transfer knowledge between CORTEX stores.

    Args:
        source: Source directory path
        destination: Destination directory path
        mode: Transfer mode - 'copy', 'merge', or 'sync'
        deduplicate: In merge mode, skip duplicates
        prefer_source: In merge mode, prefer source entries on conflict

    Returns:
        TransferStats with operation results
    """
    source_path = Path(source)
    dest_path = Path(destination)

    transfer = KnowledgeTransfer(source_path, dest_path)

    if not transfer.validate_stores():
        raise ValueError("Invalid store structure")

    if mode == "copy":
        return transfer.transfer_copy_mode()
    elif mode == "merge":
        return transfer.transfer_merge_mode(
            deduplicate=deduplicate,
            prefer_source=prefer_source
        )
    elif mode == "sync":
        # Sync mode is incremental, can't use deduplicate/prefer_source
        return transfer.transfer_sync_mode()
    else:
        raise ValueError(f"Unknown mode: {mode}. Use 'copy', 'merge', or 'sync'")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Transfer CORTEX knowledge")
    parser.add_argument("source", help="Source directory")
    parser.add_argument("destination", help="Destination directory")
    parser.add_argument(
        "--mode",
        choices=["copy", "merge", "sync"],
        default="merge",
        help="Transfer mode"
    )
    parser.add_argument(
        "--no-dedup",
        action="store_true",
        help="Disable deduplication in merge mode"
    )

    args = parser.parse_args()

    try:
        stats = transfer(
            source=args.source,
            destination=args.destination,
            mode=args.mode,
            deduplicate=not args.no_dedup
        )

        print("\n" + "="*70)
        print("TRANSFER COMPLETE")
        print("="*70)
        print(json.dumps(stats.to_dict(), indent=2))
        print("="*70)

    except Exception as e:
        print(f"[ERROR] Transfer failed: {e}")
        import traceback
        traceback.print_exc()
