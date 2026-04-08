#!/usr/bin/env python3
"""
Load 10,000+ questions from a text file and feed to CORTEX trainer.
Questions file: one question per line.
"""

import asyncio
import argparse
import sys
from pathlib import Path

# Add project to path
sys.path.insert(0, str(Path(__file__).parent / 'cortex'))

from cortex.config import load_config
from cortex.models.council import create_council
from cortex.knowledge.storage import LocalStorage
from cortex.knowledge.graph import KnowledgeGraph


async def load_and_train(questions_file: str, batch_size: int = 50):
    """Load questions from file and train CORTEX."""

    # Load questions
    questions_path = Path(questions_file)
    if not questions_path.exists():
        print(f"ERROR: Questions file not found: {questions_file}")
        return

    questions = []
    with open(questions_path, 'r', encoding='utf-8') as f:
        for line in f:
            q = line.strip()
            if q and not q.startswith('#'):
                questions.append(q)

    print(f"Loaded {len(questions)} questions from {questions_file}")

    if len(questions) == 0:
        print("No questions found. Exiting.")
        return

    # Initialize CORTEX
    config = load_config('config.yaml')
    storage = LocalStorage(base_path=config.knowledge.storage_path)
    kg = KnowledgeGraph(
        storage=storage,
        embedding_model=config.knowledge.embedding_model,
        use_faiss=config.knowledge.use_faiss
    )
    council = await create_council()

    print(f"Active teachers: {list(council.teachers.keys())}")
    print(f"Starting training on {len(questions)} questions...")
    print(f"Initial knowledge: {kg.count()} entries\n")

    # Process in batches
    total = len(questions)
    processed = 0
    errors = []

    for i in range(0, total, batch_size):
        batch = questions[i:i+batch_size]
        batch_num = i // batch_size + 1
        total_batches = (total + batch_size - 1) // batch_size

        print(f"\n{'='*70}")
        print(f"BATCH {batch_num}/{total_batches} ({len(batch)} questions)")
        print(f"{'='*70}")

        for j, question in enumerate(batch, 1):
            try:
                print(f"\r[{i+j}/{total}] {question[:70]}...", end='', flush=True)
                result = await council.process_question(question, store_in_knowledge=True)
                # Log success (could write to a results file)
            except Exception as e:
                error_msg = f"Error on question {i+j}: {str(e)}"
                print(f"\n[ERROR] {error_msg}")
                errors.append({'question': question, 'error': str(e)})

        processed += len(batch)
        print(f"\nBatch {batch_num} complete. Knowledge: {kg.count()} entries")

        # Periodic status
        if batch_num % 5 == 0:
            print(f"\n--- STATUS ---")
            print(f"Processed: {processed}/{total}")
            print(f"Knowledge size: {kg.count()}")
            print(f"Errors so far: {len(errors)}")
            print(f"----------------\n")

    # Summary
    print("\n" + "="*70)
    print("TRAINING COMPLETE")
    print("="*70)
    print(f"Total questions: {total}")
    print(f"Successfully processed: {total - len(errors)}")
    print(f"Failed: {len(errors)}")
    print(f"Final knowledge size: {kg.count()}")
    print(f"Errors saved to: training_errors.json")
    print("="*70)

    # Save errors
    if errors:
        import json
        with open('training_errors.json', 'w', encoding='utf-8') as f:
            json.dump(errors, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='Load questions from a file and train CORTEX',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python load_questions.py questions.txt
  python load_questions.py questions.txt --batch-size 20
  python load_questions.py questions_100k.txt --batch-size 100
        """
    )
    parser.add_argument('questions_file', help='Path to the questions file (one question per line)')
    parser.add_argument('--batch-size', type=int, default=50,
                        help='Number of questions to process per batch (default: 50)')

    args = parser.parse_args()

    asyncio.run(load_and_train(args.questions_file, args.batch_size))
