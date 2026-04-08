#!/usr/bin/env python3
"""
CORTEX Demo / Integration Test
Tests the full pipeline with a simple example.
"""

import asyncio
import os
from pathlib import Path

# Add project to path
import sys
sys.path.insert(0, str(Path(__file__).parent))

from cortex.config import load_config
from cortex.models.council import CouncilOfCritics, create_council
from cortex.knowledge.storage import LocalStorage
from cortex.knowledge.graph import KnowledgeGraph


async def demo():
    """Run a quick demo of CORTEX."""
    print("="*70)
    print("CORTEX DEMO")
    print("="*70)

    # Load config
    print("\n[1] Loading configuration...")
    try:
        config = load_config('config.yaml')
        print(f"   Loaded {len(config.teachers)} teachers")
        print(f"   Storage: {config.knowledge.storage_path}")
    except Exception as e:
        print(f"   Error loading config: {e}")
        print("   Using mock configuration...")
        return await mock_demo()

    # Initialize storage
    print("\n[2] Initializing storage...")
    storage = LocalStorage(base_path=config.knowledge.storage_path)
    stats = storage.get_storage_stats()
    print(f"   Storage at: {stats['base_path']}")
    print(f"   Existing entries: {stats['knowledge_entries']}")

    # Initialize knowledge graph
    print("\n[3] Loading knowledge graph...")
    kg = KnowledgeGraph(
        storage=storage,
        embedding_model=config.knowledge.embedding_model,
        use_faiss=config.knowledge.use_faiss
    )
    count = kg.count()
    print(f"   Loaded {count} entries in knowledge graph")

    # Initialize council
    print("\n[4] Initializing Council of Critics...")
    council = CouncilOfCritics(
        config=config,
        knowledge_graph=kg,
        storage=storage
    )
    print(f"   Active teachers: {list(council.teachers.keys())}")

    # Sample question
    test_questions = [
        "How do I validate an IPv4 address using regex in Python?",
        "What is the exact file path for Electron's app.getPath('userData') on Linux?",
        "Explain how DNS A records work",
        "How do I create a context manager in Python?"
    ]

    print("\n[5] Running test queries...")
    for i, question in enumerate(test_questions[:2], 1):  # Test 2 questions
        print(f"\n   Test {i}: {question[:60]}...")
        try:
            result = await council.process_question(question, store_in_knowledge=True)
            print(f"   [OK] Answer: {result['answer'][:80]}...")
            print(f"   Source: {result['source']}")
            if 'contradictions_found' in result:
                print(f"   Contradictions: {result['contradictions_found']}")
        except Exception as e:
            print(f"   [ERROR] {e}")
            import traceback
            traceback.print_exc()

    # Final stats
    print("\n[6] Final statistics:")
    kg_stats = kg.get_stats()
    print(f"   Knowledge entries: {kg_stats['total_entries']}")
    print(f"   FAISS index: {kg_stats['faiss_index_size']} vectors")

    storage_stats = storage.get_storage_stats()
    print(f"   Storage used: {storage_stats['knowledge_size_mb']:.2f} MB")
    print(f"   Mistakes registered: {storage_stats['mistake_entries']}")

    print("\n" + "="*70)
    print("DEMO COMPLETE")
    print("="*70)


async def mock_demo():
    """Run demo with mock data if config fails."""
    print("\n[MOCK DEMO - no API keys configured]")
    print("To use real teachers, set API keys in environment or .env file")
    print("\nDemo shows architecture only - no actual queries will be made.")

    from cortex.king.browser import KingOfBrowser
    from cortex.knowledge.storage import LocalStorage
    from cortex.knowledge.graph import KnowledgeGraph

    storage = LocalStorage(base_path="Z:/cortex_data")
    kg = KnowledgeGraph(storage=storage)

    king = KingOfBrowser()

    print("\n[King of Browser] Analyzing sample target...")
    target = "python/cpython"  # CPython repo
    map = await king.analyze(target, target_type='github')
    print(f"   Analyzed: {map.source_url}")
    print(f"   Code files: {len(map.code_files)}")
    print(f"   Processing time: {map.processing_time_ms:.1f}ms")

    print("\n[Knowledge Graph] Statistics:")
    print(f"   Entries: {kg.count()}")
    print(f"   Storage path: {storage.base_path}")

    print("\n[DONE] CORTEX architecture is ready. Configure API keys to start.")


if __name__ == "__main__":
    asyncio.run(demo())
