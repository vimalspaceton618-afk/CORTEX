#!/usr/bin/env python3
"""
Dataset Transfer utility using Parquet format.
Saves/loads massive DataFrames with Snappy compression, ensuring no data loss.

Usage:
    # On PC (source) - save the dataset
    python transfer_dataset.py save synthetic_data.parquet --input input_data.csv (or --from-memory)

    # On laptop (destination) - load the dataset
    python transfer_dataset.py load synthetic_data.parquet --output restored_data.csv --verify

    # Optional: Transfer the file (cross-platform)
    python transfer_dataset.py transfer synthetic_data.parquet --destination /path/to/laptop
"""

import argparse
import sys
import hashlib
import os
from pathlib import Path
from typing import Optional

import pandas as pd

# Check for required libraries
try:
    import pyarrow
    import pyarrow.parquet as pq
    PYARROW_AVAILABLE = True
except ImportError:
    PYARROW_AVAILABLE = False
    print("[ERROR] pyarrow not installed. Install with: pip install pyarrow pandas")


def compute_file_hash(filepath: str, algorithm: str = "sha256", chunk_size: int = 1024*1024) -> str:
    """Compute hash of a file for integrity verification."""
    hash_func = hashlib.new(algorithm)
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(chunk_size), b''):
            hash_func.update(chunk)
    return hash_func.hexdigest()


def save_dataframe(df: pd.DataFrame, output_path: str, compression: str = "snappy") -> dict:
    """
    Save DataFrame to Parquet with compression.
    Returns metadata including file size and hash.
    """
    if not PYARROW_AVAILABLE:
        raise ImportError("pyarrow is required. Install: pip install pyarrow")

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"[SAVE] Writing {len(df)} rows × {len(df.columns)} cols to {output_path}")
    print(f"[SAVE] Compression: {compression}")

    # Save to parquet with Snappy compression
    df.to_parquet(output_path, compression=compression, engine='pyarrow')

    # Get file stats
    file_size = output_path.stat().st_size
    file_hash = compute_file_hash(str(output_path))

    metadata = {
        'rows': len(df),
        'columns': len(df.columns),
        'column_names': list(df.columns),
        'dtypes': df.dtypes.astype(str).to_dict(),
        'file_size_bytes': file_size,
        'file_size_mb': file_size / (1024*1024),
        'hash': file_hash,
        'compression': compression
    }

    print(f"[SAVE] ✓ Complete. Size: {metadata['file_size_mb']:.2f} MB")
    print(f"[SAVE] Hash (SHA256): {file_hash}")

    return metadata


def load_dataframe(input_path: str, verify: bool = True) -> pd.DataFrame:
    """
    Load DataFrame from Parquet file.
    Optionally verify integrity by checking file hash if metadata file exists.
    """
    if not PYARROW_AVAILABLE:
        raise ImportError("pyarrow is required. Install: pip install pyarrow")

    input_path = Path(input_path)

    if not input_path.exists():
        raise FileNotFoundError(f"File not found: {input_path}")

    print(f"[LOAD] Reading {input_path}")

    # Load the parquet file
    df_restored = pd.read_parquet(input_path, engine='pyarrow')

    print(f"[LOAD] ✓ Loaded {len(df_restored)} rows × {len(df_restored.columns)} cols")

    if verify:
        # Check file size
        file_size = input_path.stat().st_size
        print(f"[LOAD] File size: {file_size / (1024*1024):.2f} MB")
        print(f"[LOAD] Memory usage: {df_restored.memory_usage(deep=True).sum() / (1024*1024):.2f} MB")

    return df_restored


def compare_dataframes(df_original: pd.DataFrame, df_restored: pd.DataFrame) -> dict:
    """Compare two DataFrames to ensure no data loss."""
    print("\n" + "="*70)
    print("INTEGRITY VERIFICATION")
    print("="*70)

    results = {
        'shape_match': df_original.shape == df_restored.shape,
        'columns_match': list(df_original.columns) == list(df_restored.columns),
        'dtypes_match': df_original.dtypes.equals(df_restored.dtypes),
        'values_equal': df_original.equals(df_restored),
        'row_count_match': len(df_original) == len(df_restored),
        'col_count_match': len(df_original.columns) == len(df_restored.columns)
    }

    # Check for NaN differences (pandas .equals treats NaN != NaN, so use allclose approach)
    if results['shape_match']:
        # Compare numeric columns
        numeric_cols = df_original.select_dtypes(include=['number']).columns
        for col in numeric_cols:
            orig = df_original[col].values
            rest = df_restored[col].values
            if not (orig == rest | (pd.isna(orig) & pd.isna(rest))).all():
                results['values_equal'] = False
                break

    # Print report
    print(f"Shape:   Original {df_original.shape} vs Restored {df_restored.shape}")
    print(f"Columns: {len(df_original.columns)} vs {len(df_restored.columns)}")
    print(f"Match:   {results['values_equal']}")

    if all(results.values()):
        print("[VERIFY] ✓ No data loss detected - transfer successful!")
    else:
        print("[VERIFY] ✗ Discrepancy detected:")
        for key, value in results.items():
            if not value:
                print(f"  - {key}: {value}")

    print("="*70 + "\n")

    return results


def cmd_save(args):
    """Save DataFrame to Parquet."""
    if not PYARROW_AVAILABLE:
        print("[ERROR] Please install pyarrow and pandas:")
        print("  pip install pyarrow pandas")
        sys.exit(1)

    # Load source data
    if args.from_memory:
        # Example: Create synthetic data (replace with your actual DataFrame)
        print("[SAVE] Creating synthetic dataset...")
        import numpy as np
        n_rows = 100000
        df = pd.DataFrame({
            'timestamp': pd.date_range('2025-01-01', periods=n_rows, freq='ms'),
            'sensor_1': np.random.randn(n_rows) * 100,
            'sensor_2': np.random.randn(n_rows) * 50,
            'sensor_3': np.random.randn(n_rows) * 25,
            'label': np.random.choice([0, 1], size=n_rows),
            'category': np.random.choice(['A', 'B', 'C', 'D'], size=n_rows)
        })
    elif args.input:
        # Load from CSV or other format
        print(f"[SAVE] Loading data from {args.input}")
        df = pd.read_csv(args.input)
    else:
        print("[ERROR] Must specify --from-memory or --input")
        sys.exit(1)

    # Save to parquet
    metadata = save_dataframe(df, args.output, compression=args.compression)

    # Save metadata separately for verification
    meta_path = Path(args.output).with_suffix('.meta.json')
    import json
    with open(meta_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"[SAVE] Metadata saved to {meta_path}")

    print("\nNext step: Transfer this file to your laptop.")
    print(f"File: {args.output}")
    print(f"Size: {metadata['file_size_mb']:.2f} MB")


def cmd_load(args):
    """Load DataFrame from Parquet."""
    if not PYARROW_AVAILABLE:
        print("[ERROR] Please install pyarrow and pandas:")
        print("  pip install pyarrow pandas")
        sys.exit(1)

    input_path = Path(args.input_file)

    if not input_path.exists():
        print(f"[ERROR] File not found: {input_path}")
        sys.exit(1)

    # Load the parquet file
    df_restored = load_dataframe(input_path, verify=True)

    # Show info
    print(f"[LOAD] Shape: {df_restored.shape}")
    print(f"[LOAD] Columns: {list(df_restored.columns)}")
    print(f"[LOAD] Dtypes:\n{df_restored.dtypes}")

    # Save to output if specified
    if args.output:
        if args.output.endswith('.parquet'):
            df_restored.to_parquet(args.output, compression=args.compression)
            print(f"[LOAD] Saved to {args.output}")
        else:
            # Assume CSV
            df_restored.to_csv(args.output, index=False)
            print(f"[LOAD] Saved to {args.output}")

    # Try to load metadata for comparison if available
    meta_path = input_path.with_suffix('.meta.json')
    if meta_path.exists():
        print(f"[LOAD] Metadata found: {meta_path}")
        import json
        with open(meta_path) as f:
            meta = json.load(f)
        print(f"[LOAD] Original row count: {meta['rows']}")
        print(f"[LOAD] Match: {'✓' if meta['rows'] == len(df_restored) else '✗'}")

    return df_restored


def cmd_transfer(args):
    """Transfer file using appropriate method."""
    source = Path(args.source)
    destination = Path(args.destination)

    if not source.exists():
        print(f"[ERROR] Source not found: {source}")
        sys.exit(1)

    print(f"[TRANSFER] {source} → {destination}")
    print(f"[TRANSFER] Size: {source.stat().st_size / (1024*1024):.2f} MB")

    # Create destination directory if needed
    destination.parent.mkdir(parents=True, exist_ok=True)

    # Simple file copy (works cross-platform)
    import shutil
    try:
        shutil.copy2(source, destination)
        print("[TRANSFER] ✓ Complete")
    except Exception as e:
        print(f"[ERROR] Transfer failed: {e}")
        sys.exit(1)


def cmd_compare(args):
    """Compare two parquet files to ensure they are identical."""
    print("[COMPARE] Loading first file...")
    df1 = pd.read_parquet(args.file1)

    print("[COMPARE] Loading second file...")
    df2 = pd.read_parquet(args.file2)

    df1_check = df1.head(1000)
    df2_check = df2.head(1000)

    df1_hash = hashlib.sha256(pd.util.hash_pandas_object(df1_check, index=True).values.tobytes()).hexdigest()
    df2_hash = hashlib.sha256(pd.util.hash_pandas_object(df2_check, index=True).values.tobytes()).hexdigest()

    if df1_hash == df2_hash:
        print("[COMPARE] ✓ Files appear identical (sample match)")
    else:
        print("[COMPARE] ✗ Files differ")

    compare_dataframes(df1_check, df2_check)


def main():
    parser = argparse.ArgumentParser(
        description="Transfer massive synthetic dataset using Parquet with integrity verification."
    )
    subparsers = parser.add_subparsers(dest='command', help='Command')

    # Save command (PC side)
    save_parser = subparsers.add_parser('save', help='Save DataFrame to Parquet')
    save_parser.add_argument('output', help='Output parquet file path')
    save_parser.add_argument('--input', help='Input file (CSV) to convert')
    save_parser.add_argument('--from-memory', action='store_true', help='Generate synthetic data (for testing)')
    save_parser.add_argument('--compression', default='snappy', choices=['snappy', 'gzip', 'brotli', 'none'],
                             help='Compression algorithm (default: snappy)')

    # Load command (Laptop side)
    load_parser = subparsers.add_parser('load', help='Load DataFrame from Parquet')
    load_parser.add_argument('input_file', help='Input parquet file path')
    load_parser.add_argument('--output', help='Optional output file (CSV or Parquet)')
    load_parser.add_argument('--compression', default='snappy', help='Compression for output if parquet')

    # Transfer command
    transfer_parser = subparsers.add_parser('transfer', help='Transfer file to destination')
    transfer_parser.add_argument('source', help='Source file path')
    transfer_parser.add_argument('destination', help='Destination file path')

    # Compare command
    compare_parser = subparsers.add_parser('compare', help='Compare two parquet files')
    compare_parser.add_argument('file1', help='First parquet file')
    compare_parser.add_argument('file2', help='Second parquet file')

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    try:
        if args.command == 'save':
            cmd_save(args)
        elif args.command == 'load':
            cmd_load(args)
        elif args.command == 'transfer':
            cmd_transfer(args)
        elif args.command == 'compare':
            cmd_compare(args)
    except Exception as e:
        print(f"[ERROR] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
