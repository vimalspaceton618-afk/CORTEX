# CORTEX — Autonomous AI Agent OS

<div align="center">

```
   ██████╗ ██████╗ ██████╗ ████████╗███████╗██╗  ██╗
  ██╔════╝██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝╚██╗██╔╝
  ██║     ██║   ██║██████╔╝   ██║   █████╗   ╚███╔╝
  ██║     ██║   ██║██╔══██╗   ██║   ██╔══╝   ██╔██╗
  ╚██████╗╚██████╔╝██║  ██║   ██║   ███████╗██╔╝ ██╗
   ╚═════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
```

**Self-Learning CLI Virtual Machine with Autonomous Subagents**

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## What is CORTEX?

CORTEX is a **self-learning, self-auditing AI system** that operates as an interactive CLI Virtual Machine. It orchestrates multiple LLM teacher models, verifies their outputs against live technical sources, stores verified knowledge in a vector database, and continuously self-trains.

**No single LLM is trustworthy alone.** CORTEX cross-references multiple teachers against ground truth, catches contradictions, and only stores verified knowledge.

### Key Features

| Feature | Description |
|---------|-------------|
| 🤖 **6 Autonomous Subagents** | Triage, Researcher, Coder, Verifier, Planner, Architect |
| 💻 **Multi-Language Execution** | Python, Node.js, Rust, PowerShell/Bash — all sandboxed |
| 👑 **King of Browser** | Ground-truth verification via GitHub, DNS, URL scraping |
| 🧠 **4-Layer Memory** | Working, Episodic, Semantic, Procedural memory systems |
| 📊 **Confidence Calibration** | Multi-signal scoring on every output |
| 🔗 **Council of Critics** | Multi-LLM orchestration with contradiction detection |
| 📈 **Self-Training** | CPU & GPU training pipelines with curriculum learning |
| 🏗️ **Billion-Scale** | Sharded FAISS + JSONL for up to 1B knowledge entries |

---

## Architecture

```
User Input → CortexShell (REPL)
              │
              ├─→ /ask      → TriageAgent → routes to best specialist
              ├─→ /code     → CoderAgent → generate → execute → debug
              ├─→ /research → ResearcherAgent → council + KG + King
              ├─→ /verify   → VerifierAgent → fact-check + report
              ├─→ /plan     → PlannerAgent → decompose tasks
              ├─→ /architect→ ArchitectAgent → system design
              ├─→ /exec     → Tool System → Python/Node/Rust/PS
              └─→ raw text  → TriageAgent → auto-route

All agents use:
  ├── Council of Critics (multi-LLM synthesis)
  ├── King of Browser (ground-truth verification)
  ├── Knowledge Graph (FAISS + SQLite)
  ├── Memory Manager (episodic/semantic/procedural/working)
  └── Confidence Calibrator (multi-signal scoring)
```

---

## Quick Start

### 1. Install

```bash
cd cortex
python -m pip install -r requirements.txt
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your API keys:
#   ANTHROPIC_API_KEY=...
#   GROQ_API_KEY=...
#   GOOGLE_API_KEY=...
```

### 3. Launch

```bash
# Interactive shell (the CLI VM)
python cortex/cli.py

# Or direct commands:
python cortex/cli.py ask "What is DNS?"
python cortex/cli.py train --iterations 100
python cortex/cli.py status
```

---

## Shell Commands

| Command | Description |
|---------|-------------|
| `/ask <question>` | Ask CORTEX (auto-routed via Triage) |
| `/code <task>` | Generate & execute code |
| `/research <topic>` | Deep research with verification |
| `/verify <claim>` | Fact-check a statement |
| `/plan <goal>` | Create a step-by-step plan |
| `/architect <system>` | Design system architecture |
| `/exec python <code>` | Execute Python code |
| `/exec node <code>` | Execute JavaScript |
| `/exec rust <code>` | Compile & run Rust |
| `/exec ps <command>` | Run PowerShell/Bash |
| `/status` | System dashboard |
| `/memory` | Memory stats |
| `/agents` | List agents |
| `/tools` | List tools |
| `/train N` | Run N training iterations |
| `/help` | Show all commands |

---

## Project Structure

```
CORTEX/
├── council_of_critics.py          # Legacy standalone council
└── cortex/                        # Main project
    ├── cortex/                    # Python package
    │   ├── cli.py                 # CLI entry point
    │   ├── shell.py               # Interactive REPL (CLI VM)
    │   ├── renderer.py            # Rich terminal UI engine
    │   ├── config.py              # Configuration management
    │   ├── agents/                # 6 Autonomous Subagents
    │   │   ├── base.py            # BaseAgent protocol + Pydantic models
    │   │   ├── orchestrator.py    # Agent lifecycle + trace collection
    │   │   ├── triage.py          # Query routing agent
    │   │   ├── researcher.py      # Deep research agent
    │   │   ├── coder.py           # Code gen + execution agent
    │   │   ├── verifier.py        # Fact-checking agent
    │   │   ├── planner.py         # Task decomposition agent
    │   │   └── architect.py       # System design agent
    │   ├── tools/                 # Multi-language executors
    │   │   ├── base.py            # BaseTool protocol + ToolRegistry
    │   │   ├── python_repl.py     # Sandboxed Python
    │   │   ├── node_runner.py     # Node.js executor
    │   │   ├── rust_runner.py     # Rust compile+run
    │   │   ├── shell_exec.py      # PowerShell/Bash
    │   │   ├── filesystem.py      # File I/O (path-sandboxed)
    │   │   └── web_search.py      # King of Browser wrapper
    │   ├── models/
    │   │   ├── teacher.py         # LLM teacher abstraction
    │   │   └── council.py         # Council + Verification engine
    │   ├── king/
    │   │   ├── scrapers.py        # GitHub/DNS/URL scrapers
    │   │   └── topology.py        # TechnicalTopologyMap
    │   ├── knowledge/
    │   │   ├── graph.py           # KnowledgeGraph (FAISS+SQLite)
    │   │   ├── storage.py         # LocalStorage file I/O
    │   │   ├── sharded_graph.py   # Billion-scale sharded KG
    │   │   └── generator.py       # Training question generator
    │   ├── memory/
    │   │   ├── manager.py         # Unified memory interface
    │   │   ├── episodic.py        # Past interaction storage
    │   │   ├── working.py         # In-memory context
    │   │   ├── procedural.py      # Learned skills
    │   │   ├── semantic.py        # KG-backed concepts
    │   │   └── decay.py           # Memory consolidation
    │   ├── reasoning/
    │   │   ├── confidence.py      # Multi-signal calibration
    │   │   └── chain.py           # Chain-of-thought engine
    │   ├── training/
    │   │   ├── trainer.py         # CPU training loop
    │   │   └── gpu_trainer.py     # GPU-accelerated training
    │   └── data/
    │       └── transfer.py        # Knowledge store sync
    ├── scripts/                   # Billion-scale infrastructure
    └── docs/                      # Documentation
```

---

## Supported Teachers

| Provider | Model | Status |
|----------|-------|--------|
| Anthropic | Claude Opus 4 | ✅ |
| Google | Gemini Pro | ✅ |
| Groq | Llama 3.3 70B | ✅ |
| Together | Llama 3 70B | ✅ |
| OpenAI | GPT-4 Turbo | ✅ |

---

## Training Data Pipeline

Every agent execution is automatically logged to `agent_traces/*.jsonl`:

```json
{
  "query": "How does DNS work?",
  "agent": "researcher",
  "answer": "...",
  "confidence": 0.87,
  "steps_taken": 3,
  "tools_used": ["web_search"],
  "full_trace": [...]
}
```

These traces are designed for **fine-tuning a custom agentic LLM** — the model learns to replicate the agent's decision-making process.

---

## Requirements

- Python 3.10+
- At least one LLM API key (Anthropic, Google, Groq, or OpenAI)
- Node.js (optional, for JS execution)
- Rust/rustc (optional, for Rust execution)

---

## License

MIT License — Build the future.
