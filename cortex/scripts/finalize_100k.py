#!/usr/bin/env python3
"""
Finalize 100k training: Build FAISS index from sharded JSONL and verify.
"""

import json
import gzip
import faiss
import numpy as np
from pathlib import Path
from sentence_transformers import SentenceTransformer
import hashlib


def rebuild_faiss_from_shards(shards_dir: str, output_dir: str, embedding_model: str = "all-MiniLM-L6-v2"):
    """
    Rebuild FAISS index from sharded JSONL storage.
    Also builds proper ID map.
    """
    shards_path = Path(shards_dir)
    output_path = Path(output_dir)

    # Create indexes directory
    indexes_dir = output_path / "indexes"
    indexes_dir.mkdir(parents=True, exist_ok=True)

    # Load embedding model
    print("[FINALIZE] Loading embedding model...")
    embedder = SentenceTransformer(embedding_model)
    dim = embedder.get_sentence_embedding_dimension()

    # Create FAISS index
    print(f"[FINALIZE] Creating FAISS index (dim={dim})...")
    index = faiss.IndexFlatL2(dim)
    id_map = {}

    total_entries = 0
    faiss_id = 0

    # Iterate through all shard files in order
    shard_hex_dirs = sorted(shards_path.glob("[0-9a-f][0-9a-f]/"))
    print(f"[FINALIZE] Found {len(shard_hex_dirs)} shard directories")

    for shard_dir in shard_hex_dirs:
        print(f"[FINALIZE] Processing shard {shard_dir.name}...")
        jsonl_files = sorted(shard_dir.glob("*.jsonl.gz"))

        for jsonl_file in jsonl_files:
            print(f"  Reading {jsonl_file.name}...")
            with gzip.open(jsonl_file, 'rt', encoding='utf-8') as f:
                for line in f:
                    try:
                        entry = json.loads(line.strip())
                        question = entry.get('q', '')
                        if not question:
                            continue

                        # Compute embedding
                        emb = embedder.encode(question, convert_to_numpy=True).astype('float32')

                        # Add to index
                        index.add(emb.reshape(1, -1))
                        id_map[str(faiss_id)] = entry['id']
                        faiss_id += 1
                        total_entries += 1

                        if total_entries % 10000 == 0:
                            print(f"    Progress: {total_entries:,} entries indexed...")

                    except Exception as e:
                        print(f"[WARN] Error processing entry: {e}")
                        continue

    print(f"\n[FINALIZE] Total entries indexed: {total_entries:,}")
    print(f"[FINALIZE] FAISS index size: {index.ntotal:,} vectors")

    # Save FAISS index
    faiss_path = indexes_dir / "faiss_single.index"
    faiss.write_index(index, str(faiss_path))
    print(f"[FINALIZE] FAISS index saved to {faiss_path}")

    # Save ID map
    id_map_path = output_path / "faiss_id_map.json"
    with open(id_map_path, 'w') as f:
        json.dump(id_map, f, indent=2)
    print(f"[FINALIZE] ID map saved to {id_map_path} ({len(id_map):,} mappings)")

    # Update shard meta
    meta_path = shards_path / "00" / "meta.json"
    if meta_path.exists():
        with open(meta_path, 'r') as f:
            meta = json.load(f)
        meta['faiss_index_entries'] = index.ntotal
        meta['faiss_index_path'] = str(faiss_path.relative_to(output_path))
        with open(meta_path, 'w') as f:
            json.dump(meta, f, indent=2)
        print(f"[FINALIZE] Updated meta: {meta}")

    print("\n" + "="*70)
    print("FINALIZATION COMPLETE")
    print("="*70)
    print(f"Total entries: {total_entries:,}")
    print(f"FAISS index: {faiss_path}")
    print(f"ID map: {id_map_path}")
    print(f"Shard storage: {shards_path}")
    print("="*70)

    return index, id_map


def test_query(question: str, shards_dir: str, faiss_index_path: str, id_map_path: str, embedder=None):
    """Test a query against the knowledge graph."""
    import json

    # Load FAISS index
    print(f"\n[TEST] Loading FAISS index from {faiss_index_path}...")
    index = faiss.read_index(faiss_index_path)

    # Load ID map
    with open(id_map_path, 'r') as f:
        id_map = json.load(f)

    # Load embedder
    if embedder is None:
        embedder = SentenceTransformer("all-MiniLM-L6-v2")

    # Compute query embedding
    print(f"[TEST] Query: '{question}'")
    query_emb = embedder.encode(question, convert_to_numpy=True).astype('float32').reshape(1, -1)

    # Search
    k = 5
    distances, faiss_ids = index.search(query_emb, k)

    print(f"\n[TEST] Top {k} results:")
    for rank, (dist, fid) in enumerate(zip(distances[0], faiss_ids[0])):
        if fid == -1:
            continue
        entry_id = id_map.get(str(fid), "UNKNOWN")
        similarity = 1.0 / (1.0 + dist)
        print(f"  {rank+1}. FAISS ID: {fid} → Entry ID: {entry_id[:16]}... (similarity: {similarity:.3f})")

    # Retrieve full entry from shards
    # Find which shard by entry_id prefix
    entry_id = id_map.get(str(faiss_ids[0][0]))
    if entry_id:
        shard_hex = entry_id[:2]  # Assuming ID starts with hex
        shard_dir = Path(shards_dir) / shard_hex

        # Search in that shard's files
        for jsonl_file in sorted(shard_dir.glob("*.jsonl.gz")):
            with gzip.open(jsonl_file, 'rt', encoding='utf-8') as f:
                for line in f:
                    e = json.loads(line.strip())
                    if e.get('id') == entry_id:
                        print(f"\n[TEST] Found entry:")
                        print(f"  Question: {e.get('q', '')[:200]}")
                        print(f"  Answer: {e.get('a', '')[:200]}...")
                        print(f"  Topics: {e.get('t')}")
                        print(f"  Source: {e.get('s')}")
                        return e

    print("[TEST] Entry not found in shards")
    return None


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--shards-dir', default='Z:/cortex_data/knowledge_graph/shards', help='Shards directory')
    parser.add_argument('--output-dir', default='Z:/cortex_data/knowledge_graph', help='Knowledge graph root')
    parser.add_argument('--test-question', default='What are SFT?', help='Test query')
    parser.add_argument('--skip-rebuild', action='store_true', help='Skip FAISS rebuild')

    args = parser.parse_args()

    if not args.skip_rebuild:
        index, id_map = rebuild_faiss_from_shards(args.shards_dir, args.output_dir)

    # Test query
    faiss_path = Path(args.output_dir) / "indexes" / "faiss_single.index"
    id_map_path = Path(args.output_dir) / "faiss_id_map.json"

    if faiss_path.exists() and id_map_path.exists():
        test_query(
            args.test_question,
            args.shards_dir,
            str(faiss_path),
            str(id_map_path)
        )
    else:
        print(f"[ERROR] FAISS index or ID map not found. Check paths:")
        print(f"  FAISS: {faiss_path}")
        print(f"  ID map: {id_map_path}")
