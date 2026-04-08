<div align="center">

```
   ██████╗ ██████╗ ██████╗ ████████╗███████╗██╗  ██╗
  ██╔════╝██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝╚██╗██╔╝
  ██║     ██║   ██║██████╔╝   ██║   █████╗   ╚███╔╝
  ██║     ██║   ██║██╔══██╗   ██║   ██╔══╝   ██╔██╗
  ╚██████╗╚██████╔╝██║  ██║   ██║   ███████╗██╔╝ ██╗
   ╚═════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
```

# CORTEX — Autonomous AI Agent Operating System

### Self-Learning CLI Virtual Machine with 6 Autonomous Subagents

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-3776AB.svg?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/downloads/)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg?style=for-the-badge)](./LICENSE)
[![Status: Active](https://img.shields.io/badge/Status-Active_Development-brightgreen.svg?style=for-the-badge)]()
[![Agents: 6](https://img.shields.io/badge/Agents-6_Autonomous-blueviolet.svg?style=for-the-badge)]()
[![Tools: 6](https://img.shields.io/badge/Tools-6_Languages-orange.svg?style=for-the-badge)]()

---

**⚠️ PROPRIETARY SOFTWARE — ALL RIGHTS RESERVED ⚠️**

*This software is protected by copyright law. Unauthorized copying, modification, or distribution is strictly prohibited. See [LICENSE](./LICENSE) for details.*

</div>

---

## 🧠 What is CORTEX?

CORTEX is a **self-learning, self-auditing AI operating system** that runs as an interactive CLI Virtual Machine. It doesn't trust any single AI model — instead, it orchestrates multiple LLM teachers, verifies their outputs against live technical sources (GitHub repos, DNS records, documentation), catches contradictions between models, and stores only verified knowledge in a billion-scale vector database.

> **Core Philosophy:** *No single LLM is trustworthy alone. CORTEX cross-references multiple teachers against ground truth, detects contradictions, and only stores verified knowledge.*

### Why CORTEX Exists

| Problem | CORTEX Solution |
|---------|----------------|
| LLMs hallucinate | ✅ King of Browser verifies against real sources |
| Single model bias | ✅ Council of Critics compares multiple LLMs |
| No learning from mistakes | ✅ Self-training pipeline learns from teacher errors |
| Knowledge gets stale | ✅ Continuous learning with curriculum stages |
| Can't execute code | ✅ Multi-language sandbox (Python, JS, Rust, PowerShell) |
| No memory between sessions | ✅ 4-layer cognitive memory system |
| Can't plan complex tasks | ✅ 6 autonomous agents with task decomposition |

---

## ⚡ Key Features

### 🤖 6 Autonomous Subagents

| Agent | Icon | Role |
|-------|------|------|
| **TriageAgent** | ⚡ | Routes queries to the best specialist via intent detection |
| **ResearcherAgent** | 🔬 | Deep multi-hop research using Teachers + King + Knowledge Graph |
| **CoderAgent** | 💻 | Generates, executes, and auto-debugs code across 4 languages |
| **VerifierAgent** | 🛡️ | Fact-checks claims against multiple ground-truth sources |
| **PlannerAgent** | 📋 | Decomposes complex tasks into step-by-step execution plans |
| **ArchitectAgent** | 🏗️ | Designs system architectures and proposes technical solutions |

### 💻 Multi-Language Tool Execution

| Language | Tool | Status |
|----------|------|--------|
| Python | `python_repl` | ✅ Sandboxed subprocess |
| JavaScript/Node.js | `node_runner` | ✅ Node.js executor |
| Rust | `rust_runner` | ✅ Compile + run via rustc |
| PowerShell/Bash | `shell_exec` | ✅ OS-aware with safety blocks |
| Filesystem | `filesystem` | ✅ Path-sandboxed I/O |
| Web Search | `web_search` | ✅ King of Browser wrapper |

### 👑 Council of Critics + King of Browser

```
User Question
    │
    ├── Query Teacher 1 (Claude)  ──┐
    ├── Query Teacher 2 (Gemini)  ──┤
    ├── Query Teacher 3 (Llama)   ──┤── Compare & detect contradictions
    │                               │
    ├── King of Browser ────────────┤── Verify against ground truth
    │   ├── GitHub code             │   (real source code, DNS records,
    │   ├── DNS records             │    live documentation)
    │   └── URL documentation       │
    │                               │
    └── Synthesize ─────────────────┘── Store verified answer + metadata
```

### 🧠 4-Layer Cognitive Memory

| Layer | Type | Purpose |
|-------|------|---------|
| **Working** | RAM | Current task context (8000 token budget, importance-based eviction) |
| **Episodic** | JSONL | Past interactions with outcome scoring |
| **Semantic** | FAISS+SQLite | Verified facts from Knowledge Graph |
| **Procedural** | JSONL | Learned skills with trigger patterns and success rates |

### 📊 Confidence Calibration

Every output is scored using 8 weighted signals:

- Teacher agreement (25%) • Verification status (25%) • King matches (15%)
- Reasoning consistency (10%) • Memory similarity (10%) • Tool success (5%)
- Reflection penalty (-5%) • Contradiction penalty (-5%)

### 🏗️ Billion-Scale Infrastructure

- **256-shard FAISS** vector index for up to 1B knowledge entries
- **Compressed JSONL** storage (~950 GB for 1B entries)
- **GPU-accelerated** training pipeline (CUDA/ROCm)
- **Checkpoint-resumable** bulk loading
- Currently: **100,711 verified Q&A entries**

---

## 🚀 Getting Started

### Prerequisites

- Python 3.10+
- At least one LLM API key (Anthropic, Google, Groq, or OpenAI)
- Node.js (optional, for JavaScript execution)
- Rust/rustc (optional, for Rust execution)

### Installation

```bash
git clone https://github.com/vimalspaceton618-afk/CORTEX.git
cd CORTEX/cortex
python -m pip install -r requirements.txt
```

### Configuration

```bash
cp .env.example .env
# Edit .env with your API keys
```

Required API keys (at least one):
```
ANTHROPIC_API_KEY=your_key_here
GROQ_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here
GITHUB_TOKEN=your_github_pat
```

### Launch

```bash
# Launch the interactive CLI Virtual Machine
python cortex/cli.py

# Or use direct commands
python cortex/cli.py ask "What is DNS?"
python cortex/cli.py train --iterations 100
python cortex/cli.py status
```

---

## 📟 Shell Commands

Once inside the `cortex❯` shell:

```
┌──────────────────────────┬────────────────────────────────────────┐
│ Command                  │ Description                            │
├──────────────────────────┼────────────────────────────────────────┤
│ /ask <question>          │ Ask anything (auto-routed via Triage)  │
│ /code <task>             │ Generate & execute code                │
│ /research <topic>        │ Deep research with verification        │
│ /verify <claim>          │ Fact-check a statement                 │
│ /plan <goal>             │ Create step-by-step plan               │
│ /architect <system>      │ Design system architecture             │
│ /exec python <code>      │ Execute Python code                    │
│ /exec node <code>        │ Execute JavaScript                     │
│ /exec rust <code>        │ Compile & run Rust                     │
│ /exec ps <command>       │ Run PowerShell/Bash                    │
│ /status                  │ System dashboard                       │
│ /memory                  │ Memory system stats                    │
│ /agents                  │ List all agents                        │
│ /tools                   │ List all tools                         │
│ /train N                 │ Run N training iterations              │
│ /history                 │ Session command history                │
│ /help                    │ Show all commands                      │
│ /exit                    │ Exit shell                             │
│ <raw text>               │ Auto-routes to best agent              │
└──────────────────────────┴────────────────────────────────────────┘
```

---

## 🏛️ Architecture

```
CORTEX/
├── council_of_critics.py              # Legacy standalone council
└── cortex/                            # Main project
    ├── cortex/                        # Python package
    │   ├── cli.py                     # CLI entry point
    │   ├── shell.py                   # ⚡ Interactive REPL (CLI VM)
    │   ├── renderer.py                # 🎨 Rich terminal UI engine
    │   ├── config.py                  # ⚙️  Configuration management
    │   │
    │   ├── agents/                    # 🤖 6 Autonomous Subagents
    │   │   ├── base.py                #    BaseAgent + Pydantic models
    │   │   ├── orchestrator.py        #    Agent lifecycle + traces
    │   │   ├── triage.py              #    ⚡ Query router
    │   │   ├── researcher.py          #    🔬 Deep research
    │   │   ├── coder.py               #    💻 Code gen + execution
    │   │   ├── verifier.py            #    🛡️  Fact-checking
    │   │   ├── planner.py             #    📋 Task decomposition
    │   │   └── architect.py           #    🏗️  System design
    │   │
    │   ├── tools/                     # 🔧 Multi-Language Executors
    │   │   ├── python_repl.py         #    Python sandbox
    │   │   ├── node_runner.py         #    Node.js executor
    │   │   ├── rust_runner.py         #    Rust compile+run
    │   │   ├── shell_exec.py          #    PowerShell/Bash
    │   │   ├── filesystem.py          #    File I/O (sandboxed)
    │   │   └── web_search.py          #    King of Browser wrapper
    │   │
    │   ├── models/                    # 🧪 LLM Integration
    │   │   ├── teacher.py             #    Teacher client abstraction
    │   │   └── council.py             #    Council + VerificationEngine
    │   │
    │   ├── king/                      # 👑 Ground-Truth Verification
    │   │   ├── scrapers.py            #    GitHub/DNS/URL scrapers
    │   │   └── topology.py            #    TechnicalTopologyMap
    │   │
    │   ├── knowledge/                 # 📚 Knowledge Storage
    │   │   ├── graph.py               #    FAISS + SQLite KG
    │   │   ├── storage.py             #    LocalStorage file I/O
    │   │   ├── sharded_graph.py       #    Billion-scale sharded KG
    │   │   └── generator.py           #    Training question generator
    │   │
    │   ├── memory/                    # 🧠 4-Layer Memory System
    │   │   ├── manager.py             #    Unified memory interface
    │   │   ├── episodic.py            #    Past interactions
    │   │   ├── working.py             #    Active context
    │   │   ├── procedural.py          #    Learned skills
    │   │   ├── semantic.py            #    KG-backed concepts
    │   │   └── decay.py               #    Memory consolidation
    │   │
    │   ├── reasoning/                 # 🔗 Reasoning Engine
    │   │   ├── confidence.py          #    Multi-signal calibration
    │   │   └── chain.py               #    Chain-of-thought + reflection
    │   │
    │   ├── training/                  # 📈 Self-Training Pipeline
    │   │   ├── trainer.py             #    CPU training loop
    │   │   └── gpu_trainer.py         #    GPU-accelerated training
    │   │
    │   └── data/                      # 🔄 Data Management
    │       └── transfer.py            #    Knowledge store sync
    │
    ├── scripts/                       # 🏭 Billion-Scale Infrastructure
    │   ├── bulk_load_billion.py       #    Parallel sharded ingestion
    │   ├── data_loader.py             #    PyTorch DataLoader
    │   ├── generate_billion_dataset.py#    Synthetic data generator
    │   └── orchestrate_billion.py     #    5-phase pipeline orchestrator
    │
    └── docs/                          # 📖 Documentation
```

---

## 🔬 Supported LLM Teachers

| Provider | Model | Protocol |
|----------|-------|----------|
| **Anthropic** | Claude Opus 4 | Native Anthropic SDK |
| **Google** | Gemini 1.5 Pro | Google GenAI SDK |
| **Groq** | Llama 3.3 70B | OpenAI-compatible |
| **Together** | Llama 3 70B | OpenAI-compatible |
| **OpenAI** | GPT-4 Turbo | Native OpenAI SDK |

---

## 📈 Training Data Pipeline

Every agent execution automatically generates training data:

```
Z:/cortex_data/agent_traces/traces_YYYY-MM-DD.jsonl
```

Each trace captures the full decision-making process:
```json
{
  "query": "How does DNS resolution work?",
  "agent": "researcher",
  "answer": "DNS resolution is a hierarchical process...",
  "confidence": 0.87,
  "steps_taken": 3,
  "tools_used": ["web_search"],
  "full_trace": [
    {"step": 1, "action": "search", "description": "Searching knowledge graph"},
    {"step": 2, "action": "tool_call", "tool": "web_search"},
    {"step": 3, "action": "respond", "description": "Research complete"}
  ]
}
```

**Goal:** These traces will be used to fine-tune a custom agentic LLM that replicates CORTEX's decision-making — creating a standalone AI model that thinks and acts like the full CORTEX system.

---

## 🔒 Technology Stack

| Component | Technology |
|-----------|-----------|
| Core Language | Python 3.10+ |
| CLI Framework | prompt-toolkit + Rich |
| Agent Protocol | Custom asyncio + Pydantic v2 |
| Vector Search | FAISS (IndexFlatL2, 384D) |
| Embeddings | sentence-transformers (all-MiniLM-L6-v2) |
| Metadata | SQLite |
| Storage | JSONL + gzip compression |
| LLM APIs | anthropic, openai, google-generativeai |
| DNS | dnspython |
| Web Scraping | aiohttp, httpx |
| GPU Training | PyTorch (CUDA/ROCm) |

---

## ⚖️ License

**⚠️ PROPRIETARY SOFTWARE — ALL RIGHTS RESERVED**

Copyright (c) 2026 vimalspaceton618-afk

This software is protected under proprietary license. You may **NOT**:
- Copy, reproduce, or duplicate any portion
- Modify or create derivative works
- Distribute, sublicense, or transfer
- Reverse engineer or decompile
- Use to train AI/ML models without permission
- Use for commercial purposes

See [LICENSE](./LICENSE) for complete terms.

---

<div align="center">

**Built by [vimalspaceton618-afk](https://github.com/vimalspaceton618-afk)**

*CORTEX — The self-learning AI that doesn't trust any single model.*

Copyright © 2026 — All Rights Reserved

</div>
