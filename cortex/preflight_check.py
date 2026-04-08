#!/usr/bin/env python3
"""Pre-flight check before 100K training."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'cortex'))

from cortex.config import load_config
from cortex.knowledge.storage import LocalStorage
from cortex.knowledge.graph import KnowledgeGraph

def check():
    print("="*70)
    print("PRE-FLIGHT CHECK FOR 100K TRAINING")
    print("="*70)

    # 1. Check config
    print("\n[1] Loading configuration...")
    try:
        config = load_config('config.yaml')
        print(f"    Storage path: {config.knowledge.storage_path}")
        print(f"    Teachers: {[t.name for t in config.teachers]}")
        print(f"    FAISS enabled: {config.knowledge.use_faiss}")
    except Exception as e:
        print(f"    ERROR: {e}")
        return False

    # 2. Check Z: drive accessible
    print("\n[2] Checking Z: drive...")
    storage_path = Path(config.knowledge.storage_path)
    if not storage_path.exists():
        print(f"    ERROR: Storage path does not exist: {storage_path}")
        return False
    print(f"    Z: drive accessible")

    # 3. Check can write to Z:
    print("\n[3] Testing write access...")
    try:
        test_file = storage_path / "test_write.txt"
        test_file.write_text("test")
        test_file.unlink()
        print(f"    Write OK")
    except Exception as e:
        print(f"    ERROR: Cannot write to {storage_path}: {e}")
        return False

    # 4. Check knowledge graph can initialize
    print("\n[4] Initializing knowledge graph...")
    try:
        storage = LocalStorage(base_path=str(storage_path))
        kg = KnowledgeGraph(
            storage=storage,
            embedding_model=config.knowledge.embedding_model,
            use_faiss=config.knowledge.use_faiss
        )
        count = kg.count()
        print(f"    Knowledge graph initialized")
        print(f"    Current entries: {count}")
    except Exception as e:
        print(f"    ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

    # 5. Check questions file exists
    print("\n[5] Checking questions file...")
    q_file = Path("questions_100k.txt")
    if not q_file.exists():
        print(f"    ERROR: Missing {q_file}")
        print("    Run: python extract_qa_docx.py ...")
        return False
    # Read with UTF-8 encoding
    try:
        with open(q_file, 'r', encoding='utf-8') as f:
            lines = [line.strip() for line in f if line.strip()]
    except UnicodeDecodeError:
        with open(q_file, 'r', encoding='utf-8', errors='ignore') as f:
            lines = [line.strip() for line in f if line.strip()]
    
    print(f"    Found {len(lines)} questions")

    print("\n" + "="*70)
    print("PRE-FLIGHT: ALL CHECKS PASSED [OK]")
    print("="*70)
    print("\nReady to train 100K questions.")
    print("Run: python load_questions.py questions_100k.txt --batch-size 20")
    print("="*70)
    return True

if __name__ == "__main__":
    success = check()
    sys.exit(0 if success else 1)
