# CORTEX GPU Training Quick Reference

## Commands

### GPU Training (on separate PC)
```bash
cd cortex
python cli.py gpu-train --iterations 100000 --pretrained-dir E:/pretrained_store --batch-size 50
```

### Transfer to Main CORTEX
```bash
# Replace entire CORTEX_DATA (destructive)
python cli.py export-pretrained E:/pretrained_store Z:/cortex_data

# Merge (add new entries, keep existing)
python cli.py merge-pretrained E:/pretrained_store
```

### Regular Commands
```bash
python cli.py ask "How do I validate email in Python?"
python cli.py status
python cli.py train --iterations 100  # CPU training
```

## File Structure

```
Project/
  cortex/
    cli.py              # Command line interface
    config.yaml         # Configuration
    main.py             # Entry point
    cortex/             # Python package
      data/
        transfer.py     # Knowledge transfer utilities
      training/
        gpu_trainer.py  # GPU-accelerated trainer
      ...
```

## GPU Trainer Options
- `--iterations N` - Number of questions (default: 1000)
- `--pretrained-dir PATH` - Storage location (default: E:/pretrained_store)
- `--batch-size N` - Batch size (default: 50)
- `--duration MINUTES` - Train for specific time
- `--godmode` - Debug mode

## Transfer Modes
- `copy` - Replace destination entirely
- `merge` - Combine, deduplicate by entry ID (default)
- `sync` - Incremental sync (future)

## Troubleshooting

### Import errors
Run from project root: `cd /e/verai/cortex` then `python cli.py ...`

### Slow first import
First run downloads sentence-transformers model (~80MB). Subsequent runs are fast.

### GPU not detected
Install PyTorch with ROCm (AMD) or CUDA (NVIDIA):
```
pip install torch --index-url https://download.pytorch.org/whl/rocm5.6
```

### Z: drive not accessible
Ensure the drive is mounted. On Windows, map to a drive letter or use a local path:
```
export CORTEX_STORAGE_PATH="C:/cortex_data"
```

## Monitoring

### GPU memory
- AMD: `rocm-smi`
- NVIDIA: `nvidia-smi`

### Training progress
- Stats: `E:/pretrained_store/training_stats_*.json`
- Full log: `E:/pretrained_store/full_training_log.jsonl`

### CORTEX status
```bash
python cli.py status
```
