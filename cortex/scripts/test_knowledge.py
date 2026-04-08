#!/usr/bin/env python3
"""
Quick test: Load 100k Q&A into CORTEX KnowledgeGraph without FAISS rebuild.
Uses sharded JSONL directly with on-the-fly embedding for search.
"""

import asyncio
import json
import gzip
from pathlib import Path
from datetime import datetime
from cortex.knowledge.storage import LocalStorage
from cortex.knowledge.graph import KnowledgeGraph
from cortex.config import load_config


async def load_sharded_to_knowledge_graph(
    shards_dir: str = "Z:/cortex_data/knowledge_graph/shards",
    base_path: str = "Z:/cortex_data"
):
    """
    Load sharded JSONL into KnowledgeGraph.
    This will populate the SQLite database and compute embeddings.
    """
    print("[LOAD] Loading sharded data into KnowledgeGraph...")

    # Setup
    config = load_config()
    config.knowledge.storage_path = base_path
    storage = LocalStorage(base_path=base_path)

    # Use existing KnowledgeGraph (will read from SQLite)
    kg = KnowledgeGraph(
        storage=storage,
        embedding_model=config.knowledge.embedding_model,
        use_faiss=False  # Disable FAISS for now, use text search
    )

    # Read all shards
    shards_path = Path(shards_dir)
    total_loaded = 0

    shard_hex_dirs = sorted(shards_path.glob("[0-9a-f][0-9a-f]/"))
    print(f"[LOAD] Found {len(shard_hex_dirs)} shards")

    for shard_dir in shard_hex_dirs:
        print(f"[LOAD] Processing shard {shard_dir.name}...")
        jsonl_files = sorted(shard_dir.glob("*.jsonl.gz"))

        for jsonl_file in jsonl_files:
            print(f"  Loading {jsonl_file.name}...")
            with gzip.open(jsonl_file, 'rt', encoding='utf-8') as f:
                for line in f:
                    try:
                        entry = json.loads(line.strip())
                        question = entry.get('q', '')
                        answer = entry.get('a', '')
                        topics = entry.get('t', ['general'])
                        source_teacher = entry.get('s', 'docx')
                        verification_source = entry.get('v', '')

                        if question and answer:
                            # Store directly (this computes embedding and saves to SQLite)
                            await kg.store(
                                question=question,
                                answer=answer,
                                metadata={
                                    'confidence': entry.get('c', 0.95),
                                    'processing_time_ms': entry.get('p', 0),
                                    'timestamp': entry.get('ts', datetime.utcnow().isoformat())
                                },
                                source_teacher=source_teacher,
                                verification_source=verification_source,
                                topics=topics
                            )
                            total_loaded += 1

                            if total_loaded % 1000 == 0:
                                print(f"    Progress: {total_loaded:,} entries stored...")

                    except Exception as e:
                        print(f"[WARN] Skipped entry: {e}")
                        continue

    print(f"\n[LOAD] Total loaded: {total_loaded:,}")
    print(f"[LOAD] Knowledge graph count: {kg.count():,}")

    # Test a query
    print("\n[TEST] Testing query: 'What are SFT?'")
    results = await kg.search("What are SFT?", k=3, threshold=0.7)
    print(f"[TEST] Found {len(results)} results")

    if results:
        best = results[0]
        print(f"  Best match (similarity: {best.get('similarity', 0):.3f}):")
        print(f"  Q: {best.get('question', '')[:150]}...")
        print(f"  A: {best.get('answer', '')[:200]}...")

    return kg


async def main():
    kg = await load_sharded_to_knowledge_graph()
    print("\n" + "="*70)
    print("KNOWLEDGE GRAPH READY")
    print("="*70)
    print(f"Total entries: {kg.count():,}")
    print("You can now use CORTEX CLI with this knowledge base:")
    print("  python cortex/cli.py ask 'What are SFT?'")
    print("="*70)


if __name__ == "__main__":
    asyncio.run(main())
