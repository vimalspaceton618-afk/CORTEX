#!/usr/bin/env python3
"""
GENERATE BILLION-SCALE DATASET
Synthetic training data generation with curriculum and topic distribution.
"""

import random
import json
import gzip
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime
import hashlib
from collections import defaultdict


class BillionDatasetGenerator:
    """
    Generate synthetic Q&A datasets at any scale.

    Strategies:
    - Template-based generation (fast, structured)
    - LLM augmentation (quality, needs API key)
    - Curriculum-based difficulty scaling
    - Topic-balanced distribution
    """

    # Extended topic templates
    TEMPLATES = {
        'python': [
            ("How do I {action} a {object} in Python?", "Use {solution}"),
            ("What is {concept} in Python?", "{explanation}"),
            ("Explain {concept} with an example", "{example_code}"),
            ("How does {feature} work in Python?", "{detailed_explanation}"),
            ("Write a Python function to {task}", "def {function_name}({params}):\n    {implementation}")
        ],
        'javascript': [
            ("What is the difference between {a} and {b} in JavaScript?", "{difference}"),
            ("How do I {action} in JavaScript?", "{js_solution}"),
            ("Explain closures in JavaScript", "{closure_explanation}"),
            ("What are JavaScript {feature}?", "{feature_explanation}")
        ],
        'dns': [
            ("What is a DNS {record_type} record?", "{record_explanation}"),
            ("How do I {action} DNS records?", "{dns_steps}"),
            ("Explain DNS {concept}", "{dns_concept_explanation}"),
            ("What is the purpose of {record_type}?", "{record_purpose}")
        ],
        'git': [
            ("How do I {action} in git?", "{git_command}"),
            ("What is git {concept}?", "{git_explanation}"),
            ("When should I use {git_feature}?", "{git_use_case}"),
            ("Explain git {advanced_topic}", "{advanced_explanation}")
        ],
        'api': [
            ("What is a REST {concept}?", "{rest_explanation}"),
            ("How do I authenticate with {auth_type}?", "{auth_steps}"),
            ("What are HTTP {status_codes} codes?", "{status_explanation}"),
            ("How to design a {api_type} API?", "{api_design_principles}")
        ],
        'database': [
            ("What is {db_concept} in {database}?", "{db_explanation}"),
            ("How do I optimize {query_type} queries?", "{optimization_tips}"),
            ("Explain {index_type} indexes", "{index_explanation}"),
            ("What is {transaction_term}?", "{transaction_explanation}")
        ],
        'security': [
            ("What is {security_concept}?", "{security_explanation}"),
            ("How to prevent {vulnerability}?", "{prevention_steps}"),
            ("Explain {crypto_term}", "{crypto_explanation}"),
            ("What are best practices for {security_topic}?", "{best_practices}")
        ],
        'devops': [
            ("How do I set up {ci_cd_tool}?", "{setup_steps}"),
            ("What is {devops_concept}?", "{devops_explanation}"),
            ("How to monitor {application}?", "{monitoring_strategy}"),
            ("Explain {infrastructure_as_code}", "{iac_explanation}")
        ]
    }

    # Vocabulary pools for variation
    VOCAB = {
        'action': ['implement', 'create', 'configure', 'validate', 'parse', 'optimize', 'debug', 'test', 'deploy', 'monitor'],
        'object': ['email address', 'JSON data', 'database connection', 'HTTP request', 'file', 'async function', 'context manager', 'custom decorator'],
        'concept': ['decorators', 'context managers', 'generators', 'async/await', 'middleware', 'pagination', 'rate limiting', 'caching', 'load balancing'],
        'record_type': ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SRV'],
        'auth_type': ['OAuth 2.0', 'JWT', 'Basic Auth', 'API Keys', 'Mutual TLS'],
        'database': ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch'],
        'security_concept': ['SQL injection', 'XSS', 'CSRF', 'encryption', 'hashing', 'salt', 'pepper', 'RBAC']
    }

    def __init__(
        self,
        output_dir: str = "Z:/synthetic_dataset",
        topics: List[str] = None,
        difficulty_distribution: Dict[str, float] = None,
        total_entries: int = 1_000_000_000  # 1 billion
    ):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.topics = topics or list(self.TEMPLATES.keys())
        self.difficulty_dist = difficulty_distribution or {
            'beginner': 0.40,
            'intermediate': 0.35,
            'advanced': 0.20,
            'expert': 0.05
        }
        self.total_entries = total_entries

        # Output files (one per 10M entries for manageability)
        self.entries_per_file = 10_000_000
        self.file_count = (total_entries + self.entries_per_file - 1) // self.entries_per_file

        # Statistics
        self.stats = defaultdict(int)

    def generate_entry(self, topic: str = None, difficulty: str = None) -> Dict[str, Any]:
        """
        Generate a single Q&A entry.

        Uses template substitution with random variations.
        """
        # Select topic and difficulty
        if not topic:
            topic = random.choice(self.topics)
        if not difficulty:
            difficulty = random.choices(
                list(self.difficulty_dist.keys()),
                weights=list(self.difficulty_dist.values())
            )[0]

        # Get template for topic
        templates = self.TEMPLATES.get(topic, self.TEMPLATES['python'])
        template = random.choice(templates)

        # Fill template slots with vocabulary
        question = self._fill_template(template[0])
        answer = self._fill_template(template[1], context={'topic': topic, 'difficulty': difficulty})

        # Generate ID
        entry_id = hashlib.sha256(f"{question}|{answer}".encode()).hexdigest()[:16]

        # Create metadata
        entry = {
            'id': entry_id,
            'q': question,
            'a': answer,
            't': [topic],
            'd': difficulty,
            's': 'synthetic',
            'v': '',
            'c': round(random.uniform(0.7, 0.99), 4),
            'p': random.randint(500, 5000),
            'ts': datetime.utcnow().isoformat()
        }

        self.stats[topic] += 1
        self.stats[difficulty] += 1

        return entry

    def _fill_template(self, template: str, context: Dict[str, Any] = None) -> str:
        """Replace template placeholders with vocabulary."""
        import re

        placeholders = re.findall(r'\{(\w+)\}', template)
        filled = template

        for ph in placeholders:
            if ph in self.VOCAB:
                replacement = random.choice(self.VOCAB[ph])
            elif context and ph in context:
                replacement = context[ph]
            else:
                replacement = f"<{ph}>"

            filled = filled.replace(f'{{{ph}}}', replacement)

        return filled

    async def generate_to_sharded_jsonl(
        self,
        embeddings_per_shard: int = 10_000_000,
        shard_count: int = 256
    ) -> Dict[str, Any]:
        """
        Generate dataset directly to sharded structure (like bulk loader expects).

        Creates:
          output_dir/shards/00/0.jsonl.gz
          output_dir/shards/01/0.jsonl.gz
          ...
        """
        print(f"[GEN] Generating {self.total_entries:,} entries to {self.file_count} files")
        print(f"[GEN] Shard count: {shard_count}")
        print(f"[GEN] Entries per shard: ~{self.total_entries // shard_count:,}")

        # Track current file positions
        shard_files = {}
        shard_counts = [0] * shard_count
        total_written = 0

        # Generate in chunks for memory efficiency
        chunk_size = 100_000
        chunks = self.total_entries // chunk_size

        for chunk_idx in range(chunks):
            if chunk_idx % 10 == 0:
                print(f"[GEN] Chunk {chunk_idx}/{chunks} ({total_written:,} written)")

            # Generate chunk
            chunk_entries = []
            for _ in range(chunk_size):
                entry = self.generate_entry()
                chunk_entries.append(entry)

            # Distribute to shards by ID
            shard_batches = defaultdict(list)
            for entry in chunk_entries:
                # Use first 2 hex chars of ID to determine shard
                shard_idx = int(entry['id'][:2], 16) % shard_count
                shard_batches[shard_idx].append(entry)
                shard_counts[shard_idx] += 1

            # Write each shard batch
            for shard_idx, entries in shard_batches.items():
                shard_hex = f"{shard_idx:02x}"
                await self._write_shard_chunk(shard_hex, entries, shard_files)

            total_written += chunk_size

        # Close all shard files
        for f in shard_files.values():
            f.close()

        print(f"[GEN] Complete: {total_written:,} entries generated")
        return {
            'total_generated': total_written,
            'shard_distribution': shard_counts,
            'files_created': len(shard_files)
        }

    async def _write_shard_chunk(
        self,
        shard_hex: str,
        entries: List[Dict[str, Any]],
        shard_files: Dict[str, Any]
    ):
        """Write chunk to shard file (compressed)."""
        shard_dir = self.output_dir / "shards" / shard_hex
        shard_dir.mkdir(parents=True, exist_ok=True)

        # Determine which file number to use
        existing_files = sorted(shard_dir.glob("*.jsonl.gz"))
        file_num = len(existing_files)

        # Open new file if needed
        if shard_hex not in shard_files:
            filepath = shard_dir / f"{file_num}.jsonl.gz"
            f = gzip.open(filepath, 'at', compresslevel=6)
            shard_files[shard_hex] = f
        else:
            f = shard_files[shard_hex]

        # Write entries
        for entry in entries:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')

    def generate_stats_report(self) -> str:
        """Generate distribution statistics."""
        report = []
        report.append("="*70)
        report.append("DATASET GENERATION STATISTICS")
        report.append("="*70)
        report.append(f"Total entries: {self.total_entries:,}")
        report.append("\nTopic distribution:")
        for topic, count in sorted(self.stats.items()):
            if topic in self.topics:
                pct = (count / self.total_entries) * 100
                report.append(f"  {topic:20s}: {count:12,} ({pct:5.1f}%)")
        report.append("\nDifficulty distribution:")
        for diff in ['beginner', 'intermediate', 'advanced', 'expert']:
            count = self.stats[diff]
            pct = (count / self.total_entries) * 100 if self.total_entries else 0
            report.append(f"  {diff:20s}: {count:12,} ({pct:5.1f}%)")
        report.append("="*70)

        return '\n'.join(report)


# ==================== QUICK GENERATE FOR SPECIFIC SIZE ====================

def generate_dataset(
    output_file: str,
    num_entries: int,
    format_type: str = 'jsonl',
    seed: int = 42
):
    """
    Quick function: generate dataset to single file (not sharded).

    Use for: 10M-100M entries (testing, prototyping)
    Avoid for: 1B+ (use sharded approach)
    """
    random.seed(seed)
    generator = BillionDatasetGenerator(total_entries=num_entries)

    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"[GEN] Generating {num_entries:,} entries to {output_file}")

    with gzip.open(output_path, 'wt', compresslevel=6) if output_file.endswith('.gz') else open(output_path, 'w') as f:
        for i in range(num_entries):
            if i % 100_000 == 0:
                print(f"  {i:,} / {num_entries:,} ({i/num_entries*100:.1f}%)")
            entry = generator.generate_entry()
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')

    print(generator.generate_stats_report())
    print(f"\nSaved to: {output_file}")
    print(f"Size: {output_path.stat().st_size / 1e9:.2f} GB")


# ==================== MAIN ====================

if __name__ == "__main__":
    import argparse
    import asyncio

    parser = argparse.ArgumentParser(description="Generate billion-scale dataset")
    parser.add_argument('--output-dir', default='Z:/synthetic_dataset', help='Output directory')
    parser.add_argument('--total-entries', type=int, default=10_000_000, help='Total entries to generate')
    parser.add_argument('--sharded', action='store_true', help='Use sharded output (for 100M+)')
    parser.add_argument('--shard-count', type=int, default=256, help='Number of shards')

    args = parser.parse_args()

    if args.sharded:
        generator = BillionDatasetGenerator(
            output_dir=args.output_dir,
            total_entries=args.total_entries
        )
        asyncio.run(generator.generate_to_sharded_jsonl(shard_count=args.shard_count))
        print(generator.generate_stats_report())
    else:
        output_file = Path(args.output_dir) / "dataset.jsonl.gz"
        generate_dataset(
            output_file=str(output_file),
            num_entries=args.total_entries
        )
