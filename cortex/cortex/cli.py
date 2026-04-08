"""CORTEX Command Line Interface."""

import asyncio
import sys
import argparse
import io
from pathlib import Path
from typing import Optional

# Fix Windows Unicode output
if sys.platform == 'win32' and sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace', line_buffering=True)

from .config import load_config
from .models.council import create_council
from .knowledge.storage import LocalStorage
from .knowledge.graph import KnowledgeGraph


def format_output(result: dict) -> str:
    """Format council result for display."""
    lines = []

    lines.append("\n" + "="*70)
    lines.append("CORTEX RESPONSE")
    lines.append("="*70)

    lines.append(f"\nAnswer: {result['answer']}")

    lines.append("\n" + "-"*70)
    lines.append("Verification Summary:")
    lines.append(result['verification_summary'])

    if 'teacher_labels' in result:
        lines.append("\nTeacher Performance:")
        for teacher, label in result['teacher_labels'].items():
            lines.append(f"  {teacher}: {label}")

    if 'contradictions_found' in result:
        lines.append(f"\nContradictions: {result['contradictions_found']}")

    if result.get('source') == 'knowledge':
        lines.append(f"\n[Retrieved from knowledge graph - {result.get('similarity', 1.0):.2%} similarity]")
    else:
        lines.append(f"\n[Teachers queried: {', '.join(result.get('teachers_called', []))}]")

    lines.append("="*70 + "\n")

    return '\n'.join(lines)


async def cmd_ask(question: str, config_path: Optional[str] = None):
    """Ask CORTEX a question."""
    council = await create_council(config_path)
    result = await council.process_question(question)
    print(format_output(result))


async def cmd_train(iterations: int, config_path: Optional[str] = None, batch_size: int = 10, godmode: bool = False):
    """Run self-training loop."""
    from .training.trainer import CORTEXTrainer

    trainer = CORTEXTrainer(config_path=config_path, batch_size=batch_size, godmode=godmode)
    await trainer.initialize()

    # Generate questions
    from .knowledge.generator import generate_training_questions
    questions = generate_training_questions(count=iterations, knowledge_graph=trainer.kg)

    # Run training
    try:
        await trainer.train_batch(questions)
    except KeyboardInterrupt:
        print("\n[TRAIN] Interrupted")
    finally:
        # Print final summary
        trainer._print_final_summary()


async def cmd_status(config_path: Optional[str] = None):
    """Show CORTEX status."""
    council = await create_council(config_path)

    kg = council.knowledge_graph
    stats = kg.get_stats()
    storage_stats = council.storage.get_storage_stats()

    print("\n" + "="*70)
    print("CORTEX STATUS")
    print("="*70)

    print(f"\nKnowledge Graph:")
    print(f"  Total entries: {stats['total_entries']}")
    print(f"  FAISS index size: {stats['faiss_index_size']}")
    print(f"  Storage used: {storage_stats['knowledge_size_mb']:.2f} MB")

    print(f"\nTeachers active: {len(council.teachers)}")
    print(f"  " + "\n  ".join([f"- {name}" for name in council.teachers.keys()]))

    print(f"\nTop topics:")
    for topic, count in stats['top_topics']:
        print(f"  {topic}: {count}")

    print(f"\nMistake registry: {storage_stats['mistake_entries']} entries")

    print("="*70 + "\n")


async def cmd_gpu_train(
    iterations: int,
    pretrained_dir: str,
    config_path: Optional[str] = None,
    batch_size: int = 50,
    godmode: bool = False,
    duration_minutes: Optional[int] = None
):
    """Run GPU-accelerated training on a separate pretrained store."""
    from .training.gpu_trainer import gpu_train

    print("\n" + "="*70)
    print("GPU TRAINING START")
    print("="*70)
    print(f"Pretrained store: {pretrained_dir}")
    print(f"Iterations: {iterations}")
    print(f"Batch size: {batch_size}")
    print(f"Duration: {duration_minutes or 'unlimited'} minutes")
    print("="*70 + "\n")

    await gpu_train(
        iterations=iterations,
        batch_size=batch_size,
        pretrained_dir=pretrained_dir,
        config_path=config_path,
        godmode=godmode,
        duration_minutes=duration_minutes,
        max_iterations=None if duration_minutes else iterations
    )


async def cmd_export_pretrained(source: str, destination: str):
    """Export pretrained store by copying to destination (replaces existing)."""
    from .data.transfer import transfer

    print("\n" + "="*70)
    print("EXPORT PRETRAINED STORE")
    print("="*70)
    print(f"Source: {source}")
    print(f"Destination: {destination}")
    print("Mode: COPY (replaces destination)")
    print("="*70 + "\n")

    try:
        stats = transfer(source=source, destination=destination, mode="copy")

        print("\n" + "="*70)
        print("EXPORT COMPLETE")
        print("="*70)
        print(f"Entries copied: {stats.entries_copied}")
        print(f"Duration: {stats.duration_seconds:.2f}s")
        print(f"Destination now has: {stats.dest_entries_after} entries")
        print("="*70 + "\n")
    except Exception as e:
        print(f"[ERROR] Export failed: {e}")
        import traceback
        traceback.print_exc()


async def cmd_merge_pretrained(source: str, destination: Optional[str] = None, deduplicate: bool = True):
    """Merge pretrained store into current CORTEX_DATA (or specified destination)."""
    from .data.transfer import transfer
    from .config import load_config
    from .knowledge.storage import LocalStorage

    if destination is None:
        # Use current CORTEX_DATA from config
        config = load_config()
        destination = config.knowledge.storage_path

    print("\n" + "="*70)
    print("MERGE PRETRAINED STORE")
    print("="*70)
    print(f"Source: {source}")
    print(f"Destination: {destination}")
    print(f"Deduplicate: {deduplicate}")
    print("="*70 + "\n")

    try:
        stats = transfer(
            source=source,
            destination=destination,
            mode="merge",
            deduplicate=deduplicate
        )

        print("\n" + "="*70)
        print("MERGE COMPLETE")
        print("="*70)
        print(f"Source entries: {stats.source_entries}")
        print(f"Destination before: {stats.dest_entries_before}")
        print(f"Entries copied: {stats.entries_copied}")
        print(f"Duplicates skipped: {stats.entries_merged}")
        print(f"Destination after: {stats.dest_entries_after}")
        print(f"Total growth: +{stats.entries_copied} entries")
        print(f"Duration: {stats.duration_seconds:.2f}s")
        print("="*70 + "\n")

        print("NEXT STEPS:")
        print("1. Run status check: python cortex/cli.py status")
        print("2. Test queries: python cortex/cli.py ask \"test question\"")
        print("="*70 + "\n")

    except Exception as e:
        print(f"[ERROR] Merge failed: {e}")
        import traceback
        traceback.print_exc()


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="CORTEX - Self-Learning Superintelligence"
    )
    parser.add_argument(
        '--config',
        help='Path to config.yaml (default: ./config.yaml)',
        default='config.yaml'
    )

    subparsers = parser.add_subparsers(dest='command', help='Command')

    # Ask command
    ask_parser = subparsers.add_parser('ask', help='Ask CORTEX a question')
    ask_parser.add_argument('question', help='The question to ask')

    # Train command
    train_parser = subparsers.add_parser('train', help='Run self-training')
    train_parser.add_argument(
        '--iterations',
        type=int,
        default=100,
        help='Number of training iterations (default: 100)'
    )
    train_parser.add_argument(
        '--batch-size',
        type=int,
        default=10,
        help='Questions per batch (default: 10)'
    )
    train_parser.add_argument(
        '--godmode',
        action='store_true',
        help='Enable godmode debugging (full tracebacks, extra checks)'
    )

    # GPU Train command
    gpu_train_parser = subparsers.add_parser('gpu-train', help='Run GPU-accelerated training')
    gpu_train_parser.add_argument(
        '--iterations',
        type=int,
        default=1000,
        help='Number of training iterations (default: 1000)'
    )
    gpu_train_parser.add_argument(
        '--pretrained-dir',
        type=str,
        default='E:/pretrained_store',
        help='Directory for pretrained store (default: E:/pretrained_store)'
    )
    gpu_train_parser.add_argument(
        '--batch-size',
        type=int,
        default=50,
        help='Questions per batch (default: 50)'
    )
    gpu_train_parser.add_argument(
        '--duration',
        type=int,
        help='Train for N minutes (overrides iterations)'
    )
    gpu_train_parser.add_argument(
        '--godmode',
        action='store_true',
        help='Enable godmode debugging'
    )

    # Export pretrained command
    export_parser = subparsers.add_parser('export-pretrained', help='Export pretrained store to destination (replaces)')
    export_parser.add_argument('source', help='Source pretrained directory')
    export_parser.add_argument('destination', help='Destination directory (e.g., Z:/cortex_data)')

    # Merge pretrained command
    merge_parser = subparsers.add_parser('merge-pretrained', help='Merge pretrained store into CORTEX_DATA')
    merge_parser.add_argument('source', help='Source pretrained directory')
    merge_parser.add_argument(
        '--destination',
        help='Destination directory (default: from config)'
    )
    merge_parser.add_argument(
        '--no-dedup',
        action='store_true',
        help='Disable deduplication (copies all source entries, even duplicates)'
    )

    # Status command
    subparsers.add_parser('status', help='Show CORTEX status')

    # Shell command (interactive REPL)
    subparsers.add_parser('shell', help='Launch interactive CORTEX shell (CLI VM)')

    args = parser.parse_args()

    # Default: launch shell if no command given
    if not args.command:
        args.command = 'shell'

    try:
        if args.command == 'shell':
            from .shell import CortexShell
            shell = CortexShell(config_path=args.config)
            if sys.platform == 'win32':
                asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
            asyncio.run(shell.run())
        elif args.command == 'ask':
            asyncio.run(cmd_ask(args.question, args.config))
        elif args.command == 'train':
            asyncio.run(cmd_train(args.iterations, args.config, args.batch_size, args.godmode))
        elif args.command == 'gpu-train':
            asyncio.run(cmd_gpu_train(
                iterations=args.iterations,
                pretrained_dir=args.pretrained_dir,
                config_path=args.config,
                batch_size=args.batch_size,
                godmode=args.godmode,
                duration_minutes=args.duration
            ))
        elif args.command == 'export-pretrained':
            asyncio.run(cmd_export_pretrained(args.source, args.destination))
        elif args.command == 'merge-pretrained':
            asyncio.run(cmd_merge_pretrained(
                source=args.source,
                destination=args.destination,
                deduplicate=not args.no_dedup
            ))
        elif args.command == 'status':
            asyncio.run(cmd_status(args.config))
    except KeyboardInterrupt:
        print("\n[CORTEX] Interrupted")
        sys.exit(0)
    except Exception as e:
        print(f"[ERROR] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
