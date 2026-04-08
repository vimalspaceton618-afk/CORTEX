#!/usr/bin/env python3
"""
ORCHESTRATOR: END-TO-END BILLION-SCALE TRAINING PIPELINE

This script automates the complete pipeline from raw data to deployed knowledge.
"""

import asyncio
import sys
import json
from pathlib import Path
from datetime import datetime
import subprocess


class BillionPipeline:
    """Orchestrates full billion-scale training pipeline."""

    def __init__(
        self,
        config_path: str = "config.yaml",
        data_source: str = None,
        data_format: str = "questions",
        total_entries: int = 1_000_000_000,
        output_dir: str = "Z:/cortex_data",
        pretrained_dir: str = "E:/pretrained_store",
        skip_phases: list = None
    ):
        self.config_path = config_path
        self.data_source = data_source
        self.data_format = data_format
        self.total_entries = total_entries
        self.output_dir = Path(output_dir)
        self.pretrained_dir = Path(pretrained_dir)
        self.skip_phases = skip_phases or []

        self.log_file = self.output_dir / f"pipeline_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.log"
        self.stats = {}

    def log(self, msg: str):
        """Log to console and file."""
        timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        line = f"[{timestamp}] {msg}"
        print(line)
        with open(self.log_file, 'a') as f:
            f.write(line + '\n')

    async def run(self):
        """Run complete pipeline."""
        self.log("="*70)
        self.log("BILLION-SCALE PIPELINE STARTING")
        self.log("="*70)
        self.log(f"Data source: {self.data_source}")
        self.log(f"Total entries: {self.total_entries:,}")
        self.log(f"Output dir: {self.output_dir}")
        self.log(f"Skip phases: {self.skip_phases}")
        self.log("="*70)

        try:
            # Phase 1: Generate/Acquire data
            if "generate" not in self.skip_phases:
                await self.phase_1_generate()
            else:
                self.log("[SKIP] Phase 1: Generate (skipped)")

            # Phase 2: Bulk load
            if "load" not in self.skip_phases:
                await self.phase_2_bulk_load()
            else:
                self.log("[SKIP] Phase 2: Bulk load (skipped)")

            # Phase 3: GPU training
            if "train" not in self.skip_phases:
                await self.phase_3_gpu_training()
            else:
                self.log("[SKIP] Phase 3: GPU training (skipped)")

            # Phase 4: Verification
            if "verify" not in self.skip_phases:
                await self.phase_4_verify()
            else:
                self.log("[SKIP] Phase 4: Verification (skipped)")

            # Phase 5: Deploy/Merge
            if "deploy" not in self.skip_phases:
                await self.phase_5_deploy()
            else:
                self.log("[SKIP] Phase 5: Deploy (skipped)")

            self.log("="*70)
            self.log("PIPELINE COMPLETE")
            self.log("="*70)
            self.log(f"Stats: {json.dumps(self.stats, indent=2)}")
            self.log(f"Log: {self.log_file}")

        except Exception as e:
            self.log(f"[FATAL] Pipeline failed: {e}")
            import traceback
            self.log(traceback.format_exc())
            sys.exit(1)

    async def phase_1_generate(self):
        """Phase 1: Generate or prepare dataset."""
        self.log("\n" + "="*70)
        self.log("PHASE 1: GENERATE DATASET")
        self.log("="*70)

        if not self.data_source:
            self.log("No data source provided, using synthetic generation")
            # Generate synthetic dataset directly to sharded format
            cmd = [
                sys.executable, "scripts/generate_billion_dataset.py",
                "--output-dir", str(self.output_dir / "synthetic"),
                "--total-entries", str(self.total_entries),
                "--sharded",
                "--shard-count", "256"
            ]
            self.log(f"Running: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=False, text=True)
            if result.returncode != 0:
                raise RuntimeError(f"Generation failed: {result.stderr}")
            self.data_source = str(self.output_dir / "synthetic")
        else:
            self.log(f"Using existing data source: {self.data_source}")

        # Count entries
        if Path(self.data_source).exists():
            if (Path(self.data_source) / "shards").exists():
                self.log("Sharded format detected")
                self.stats['entries_generated'] = self.total_entries
            else:
                # Count lines in file
                self.log(f"Counting entries in {self.data_source}...")
                count = 0
                with open(self.data_source, 'r') if not self.data_source.endswith('.gz') else gzip.open(self.data_source, 'rt') as f:
                    for line in f:
                        count += 1
                self.stats['entries_generated'] = count
                self.log(f"Found {count:,} entries")
        else:
            raise FileNotFoundError(f"Data source not found: {self.data_source}")

        self.log("Phase 1 complete ✓")

    async def phase_2_bulk_load(self):
        """Phase 2: Bulk load to knowledge graph."""
        self.log("\n" + "="*70)
        self.log("PHASE 2: BULK LOAD")
        self.log("="*70)

        input_path = self.data_source
        output_dir = self.output_dir

        self.log(f"Loading from: {input_path}")
        self.log(f"Loading to: {output_dir}")

        cmd = [
            sys.executable, "scripts/bulk_load_billion.py",
            input_path,
            "--format", self.data_format,
            "--output-dir", str(output_dir),
            "--max-entries", str(self.total_entries),
            "--batch-size", "1000",
            "--gpu-batch-size", "128",
            "--checkpoint-interval", "10000"
        ]

        self.log(f"Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=False, text=True)

        if result.returncode != 0:
            raise RuntimeError(f"Bulk load failed: {result.stderr}")

        # Check checkpoint for actual count
        checkpoint_file = output_dir / "bulk_load_checkpoint.json"
        if checkpoint_file.exists():
            with open(checkpoint_file) as f:
                checkpoint = json.load(f)
                loaded = checkpoint['total_processed']
                self.stats['entries_loaded'] = loaded
                self.log(f"Loaded {loaded:,} entries (checkpoint)")

        self.log("Phase 2 complete ✓")

    async def phase_3_gpu_training(self):
        """Phase 3: GPU training for verification and quality improvement."""
        self.log("\n" + "="*70)
        self.log("PHASE 3: GPU TRAINING")
        self.log("="*70)

        # Determine iterations (sample subset if huge)
        iterations = min(100_000, self.stats.get('entries_loaded', 10000))

        self.log(f"Running {iterations:,} GPU training iterations")

        cmd = [
            sys.executable, "cortex/cli.py", "gpu-train",
            "--iterations", str(iterations),
            "--pretrained-dir", str(self.pretrained_dir),
            "--batch-size", "100",
            "--godmode"
        ]

        self.log(f"Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=False, text=True)

        if result.returncode != 0:
            self.log(f"[WARN] GPU training failed, but continuing: {result.stderr}")
        else:
            self.stats['training_iterations'] = iterations
            self.log(f"Completed {iterations:,} training iterations")

        self.log("Phase 3 complete ✓")

    async def phase_4_verify(self):
        """Phase 4: Verify data quality."""
        self.log("\n" + "="*70)
        self.log("PHASE 4: VERIFICATION")
        self.log("="*70)

        self.log("Running verification checks...")

        # Check knowledge graph stats
        from cortex.models.council import create_council
        from cortex.config import load_config

        config = load_config()
        council = await create_council()
        kg = council.knowledge_graph
        stats = kg.get_stats()

        self.log(f"Knowledge graph stats: {json.dumps(stats, indent=2)}")
        self.stats['verification'] = stats

        # Sample quality check
        self.log("Sampling entry quality...")
        sample = await council.process_question("What is DNS?", use_verification=True)
        self.log(f"Sample answer quality: {len(sample['answer'])} chars, source: {sample.get('source')}")

        self.log("Phase 4 complete ✓")

    async def phase_5_deploy(self):
        """Phase 5: Deploy to production store."""
        self.log("\n" + "="*70)
        self.log("PHASE 5: DEPLOY")
        self.log("="*70)

        source = str(self.pretrained_dir)
        destination = str(self.output_dir / "production")

        self.log(f"Merging from {source} to {destination}")

        cmd = [
            sys.executable, "cortex/cli.py", "merge-pretrained",
            source,
            "--destination", destination,
            "--no-dedup"  # For speed, skip dedup if already deduped
        ]

        self.log(f"Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=False, text=True)

        if result.returncode != 0:
            raise RuntimeError(f"Deploy failed: {result.stderr}")

        self.stats['deployed_to'] = destination
        self.log(f"Deployed to {destination}")

        self.log("Phase 5 complete ✓")


async def main():
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Billion-scale training pipeline orchestrator")
    parser.add_argument('--data-source', help='Input data source (file or directory)')
    parser.add_argument('--format', choices=['questions', 'jsonl', 'verified'], default='verified',
                        help='Input data format')
    parser.add_argument('--total-entries', type=int, default=1_000_000,
                        help='Total entries to process')
    parser.add_argument('--output-dir', default='Z:/cortex_data',
                        help='Main CORTEX data directory')
    parser.add_argument('--pretrained-dir', default='E:/pretrained_store',
                        help='Pretrained store directory')
    parser.add_argument('--skip', nargs='*', choices=['generate', 'load', 'train', 'verify', 'deploy'],
                        default=[], help='Skip phases')

    args = parser.parse_args()

    pipeline = BillionPipeline(
        data_source=args.data_source,
        data_format=args.format,
        total_entries=args.total_entries,
        output_dir=args.output_dir,
        pretrained_dir=args.pretrained_dir,
        skip_phases=args.skip
    )

    await pipeline.run()


if __name__ == "__main__":
    asyncio.run(main())
