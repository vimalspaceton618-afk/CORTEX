# GPU-Accelerated CORTEX Training Guide

## Overview

Leverage your high-end GPU (AMD RX 7600 20GB VRAM or NVIDIA equivalent) to accelerate CORTEX training on a separate PC, then transfer the pretrained knowledge to your main CORTEX_DATA storage.

## Architecture

```
┌─────────────────────────────────────┐
│  GPU Training PC (Fast Training)    │
│  - GPU-accelerated embeddings       │
│  - Local storage on fast SSD        │
│  - Parallel question processing     │
└───────────────┬─────────────────────┘
                │ Transfer
                ▼
┌─────────────────────────────────────┐
│  Main CORTEX PC (Production)        │
│  - Z:/cortex_data (5TB storage)     │
│  - Real-time queries                │
│  - Continuous learning              │
└─────────────────────────────────────┘
```

## Prerequisites

### GPU Training PC
- **GPU**: AMD RX 7600 (20GB VRAM) or NVIDIA equivalent
- **OS**: Windows or Linux (ROCm support required for AMD)
- **Python**: 3.10+
- **Dependencies**: PyTorch with ROCm/CUDA support
- **Storage**: Fast SSD with enough space for knowledge_graph (100k+ Q&A ≈ 5-10GB)
- **API Keys**: Same teacher API keys as main CORTEX (Anthropic, Google, etc.)

### Install GPU Dependencies

```bash
# For AMD GPU (ROCm) on Windows/Linux
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/rocm5.6

# For NVIDIA GPU (CUDA)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Verify GPU detection
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

## Quick Start

### 1. GPU Training

On your GPU training PC:

```bash
cd E:/verai/cortex

# Basic GPU training (1000 iterations)
python cortex/cli.py gpu-train --iterations 1000 --pretrained-dir E:/pretrained_store

# Or specify a custom batch size (higher = faster on GPU)
python cortex/cli.py gpu-train --iterations 100000 --batch-size 100 --pretrained-dir E:/fast_ssd/store

# Train for a specific duration (2 hours)
python cortex/cli.py gpu-train --duration 120 --pretrained-dir E:/pretrained_store

# Enable godmode debugging
python cortex/cli.py gpu-train --iterations 100 --pretrained-dir E:/test_store --godmode
```

**Training Output:**
```
[GPU] Detected: AMD Radeon RX 7600 (20.0 GB VRAM)
[GPU] Pretrained store: E:/pretrained_store
[GPU] Embeddings will use GPU acceleration
======================================
GPU TRAINING START
======================================
```

### 2. Transfer to Main CORTEX

After training completes, transfer the pretrained knowledge to your main CORTEX_DATA:

#### Option A: Replace Entire Store
```bash
# WARNING: This replaces your entire Z:/cortex_data with pretrained store
python cortex/cli.py export-pretrained E:/pretrained_store Z:/cortex_data
```

#### Option B: Incremental Merge (Recommended)
```bash
# Only adds new/different entries, keeps existing knowledge
python cortex/cli.py merge-pretrained E:/pretrained_store

# With destination override (if different from config)
python cortex/cli.py merge-pretrained E:/pretrained_store --destination Z:/cortex_data

# Disable deduplication to force-copy all (not recommended)
python cortex/cli.py merge-pretrained E:/pretrained_store --no-dedup
```

**Merge Output:**
```
======================================
MERGE COMPLETE
======================================
Source entries: 50234
Destination before: 12345
Entries copied: 37889
Duplicates skipped: 12345
Destination after: 50234
Total growth: +37889 entries
======================================
```

### 3. Verify

On your main CORTEX PC:

```bash
# Check status
python cortex/cli.py status

# Test a query
python cortex/cli.py ask "What is a DNS A record?"
```

## Advanced Usage

### Training with Custom Configuration
```bash
# Use a different config file
python cortex/cli.py gpu-train --iterations 50000 --config config.gpu.yaml --pretrained-dir E:/gpu_data
```

### Monitor GPU Memory
```bash
# Check GPU memory usage during training
nvidia-smi  # NVIDIA
rocm-smi    # AMD

# Or Python:
python -c "import torch; print(f'{torch.cuda.memory_allocated()/1e9:.2f} GB allocated')"
```

### Batch Processing Large Datasets
```bash
# Train multiple times and merge incrementally
# Run 1:
python cortex/cli.py gpu-train --iterations 25000 --pretrained-dir E:/store1
python cortex/cli.py merge-pretrained E:/store1

# Run 2:
python cortex/cli.py gpu-train --iterations 25000 --pretrained-dir E:/store2
python cortex/cli.py merge-pretrained E:/store2

# Total: 50000 new entries added
```

### Sync Mode (Incremental Sync)
```python
# Use the transfer module directly for sync mode
from cortex.data.transfer import transfer

stats = transfer(
    source="E:/pretrained_store",
    destination="Z:/cortex_data",
    mode="sync"  # Only adds entries newer than last sync
)
print(stats.to_dict())
```

## Performance Expectations

| Metric | Old (CPU) | GPU Training (20GB VRAM) |
|--------|-----------|--------------------------|
| Embedding computation | ~500ms per batch | ~50ms per batch (10x faster) |
| Training 1000 iterations | 1-2 hours | 15-30 minutes |
| Storage size (100k Q&A) | ~5GB | ~5GB (same) |
| Transfer time (100GB) | N/A | 10-20 minutes (USB 3.0) |

**Bottleneck**: Teacher API latency (Claude, Gemini) - GPU acceleration only speeds up embedding computation and local processing.

## Troubleshooting

### GPU Not Detected
```
[GPU] PyTorch not installed, GPU detection skipped
```
**Fix**: Install PyTorch with ROCm/CUDA support (see Prerequisites above).

### Out of Memory on GPU
**Fix**: Reduce `--batch-size` to 25 or 10, or use CPU mode (remove GPU flag).

### Transfer Fails (Permission Denied)
**Fix**: Ensure Z: drive is mounted and accessible. On Windows, run CLI as Administrator if needed.

### FAISS Index Corruption After Merge
**Fix**: Rebuild FAISS index manually:
```bash
# Delete existing index and let CORTEX rebuild
rm Z:/cortex_data/knowledge_graph/faiss.index
rm Z:/cortex_data/knowledge_graph/faiss_id_map.json
# Next query will rebuild automatically
```

### Teacher API Rate Limits
**Fix**: Training is I/O bound by teacher APIs. Use `--godmode` to see detailed logs. Consider:
- Increasing `await asyncio.sleep(0.5)` to `1.0` in gpu_trainer.py
- Use teachers with higher rate limits (Groq is free but rate-limited)
- Distribute training across multiple API keys

## Configuration Reference

### CLI Commands
```
ask <question>              Query CORTEX
train --iterations N       CPU training (original)
gpu-train [options]        GPU-accelerated training
export-pretrained SRC DST  Copy store to destination
merge-pretrained SRC       Merge into current CORTEX_DATA
status                     Show stats
```

### GPU Trainer Options
- `--iterations N`: Number of questions to process (default: 1000)
- `--pretrained-dir PATH`: Storage directory (default: E:/pretrained_store)
- `--batch-size N`: Questions per batch (default: 50)
- `--duration MINUTES`: Training duration (overrides iterations)
- `--godmode`: Enable verbose debugging

### Transfer Modes
- `copy`: Replace destination entirely with source
- `merge`: Add only new/different entries (deduplicate by entry ID)
- `sync`: Incremental sync based on timestamp (future)

## Best Practices

1. **Always test merge on backup first**:
   ```bash
   cp -r Z:/cortex_data Z:/cortex_data_backup
   ```

2. **Monitor GPU memory**: Keep VRAM usage under 80% to avoid OOM.

3. **Use consistent embedding models**: GPU store and main CORTEX must use the same embedding model (`all-MiniLM-L6-v2`). Mismatches cause FAISS index incompatibility.

4. **Batch size tuning**: Start with 50, adjust based on GPU memory and training speed.

5. **Stats files**: Keep training stats (`training_stats_*.json`) for record-keeping.

6. **Incremental training**: Run multiple smaller training sessions (25k iterations each) rather than one massive session. Easier to recover from failures.

## Integration with Existing Workflow

Your existing `train` command (CPU) and `gpu-train` are independent:
- `train` → stores to `Z:/cortex_data` (from config)
- `gpu-train` → stores to `E:/pretrained_store` (or `--pretrained-dir`)
- `merge-pretrained` → combines GPU store into main Z: drive

This separation allows:
- Offload heavy training to GPU PC
- Main PC remains responsive for queries
- Safe transfer with deduplication
- Parallel training on multiple GPU PCs (future)

## Next Steps

- Add local teacher models on GPU (run Llama 70B locally with vLLM) to eliminate API costs
- Implement advanced deduplication (semantic similarity) beyond entry ID matching
- Add compression for FAISS index (PQ, HNSW)
- Distributed training across multiple GPU PCs

---

**Beast Mode Activated**: 20GB VRAM + 100k+ Q&A dataset + distributed training pipeline. Train hard, merge clean.
