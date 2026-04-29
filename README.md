<div align="center">

# ⚡ CORTEX

**Sovereign Intelligence Infrastructure.**  
**Private local AI for sensitive codebases.**

[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](#)
[![Version: 4.0](https://img.shields.io/badge/Version-4.0.0-brightgreen.svg)](#)

</div>

---

## 🚀 Recent Updates (v4.0.1)
- **Workspace Cleanup**: Removed legacy research documents, scratch files, and debug artifacts to minimize footprint.
- **Windows Compatibility**: Fixed `EPERM` initialization bug in `SharedContext.ts` when running the CLI from a Windows drive root (`C:\`).

---

## 📑 Table of Contents
- [📖 What is CORTEX?](#-what-is-cortex)
- [🧠 The Cognition Core](#-the-cognition-core)
- [🤖 The Agent Swarm](#-the-agent-swarm)
- [🏗️ Architecture](#-architecture)
- [🛠️ Installation & Setup](#-installation--setup)
- [💻 Usage](#-usage)
- [🛡️ Security](#-security)
- [📄 License](#-license)

---

## 📖 What is CORTEX?

**CORTEX** is a local-first AI development environment that combines a **multi-agent terminal interface** with a **neuro-symbolic cognition engine** (BIGROCK ASI) in a single process.

It is designed for teams that need AI-assisted development without sending proprietary code to third-party cloud services — defense contractors, healthcare organizations, financial firms, and government agencies.

### Core Capabilities

- **100% Local Execution**: All cognition runs on your hardware. No HTTP calls to external AI services for STEM computation.
- **Deterministic STEM Proofs**: Symbolic math, physics simulation, and formal logic — with full proof traces and 100% confidence.
- **Local LLM Absorption**: Drop any GGUF model into the `models/` directory. CORTEX probes it, profiles its domain strengths, and routes queries to the best model.
- **Multi-Agent Development**: 7 specialized agents (Developer, Explorer, Planner, Quality, DevOps, Browser, Network) with automatic task routing.
- **Cloud Fallback**: When local models aren't available, CORTEX routes to cloud LLMs (OpenRouter/OpenAI) with automatic retry and model cascade.

---

## 🧠 The Cognition Core

CORTEX's local intelligence is powered by **BIGROCK ASI** — a neuro-symbolic engine that runs **in-process** with zero network latency.

### Engines

| Engine | What It Does | Output |
|:---|:---|:---|
| **Symbolic Math Engine** | Algebraic evaluation, differentiation, solving — with step-by-step proof traces | Deterministic |
| **Physics Engine** | First-principles simulation across 6 domains (Newtonian, Relativistic, Quantum, Thermodynamics, Electromagnetism, Orbital) | Deterministic |
| **Formal Logic Prover** | Exhaustive truth-table evaluation of propositional logic expressions | Deterministic |
| **ODE Neural Network** | Liquid Time-Constant network with RK4 integration and Hebbian learning — adapts during inference | Adaptive |
| **LLM Devourer** | Scans local GGUF models, probes domain performance, profiles and ranks them | Adaptive |
| **Mythos Threat Engine** | 12-domain cybersecurity threat ontology — maps architecture descriptions to known TTPs | Heuristic |
| **Episodic Memory** | TF-IDF + dense vector semantic search over conversation and thought history | N/A |
| **Self-Reflection Engine** | 7-check metacognitive auditor that adjusts confidence of outputs | N/A |
| **Autonomous Reasoning Loop** | Background cycles: system health patrol, self-directed curiosity queries, memory consolidation | N/A |

### Pipeline

```
Input → Security Scan → DAG Decomposition → Hypervisor Sandbox
  → [Symbolic | Physics | Logic | Neural | Kernel | LLM Devourer]
  → Self-Reflection → Episodic Memory → Output
```

---

## 🤖 The Agent Swarm

| Agent | Responsibility |
| :--- | :--- |
| **ExploreAgent** | Filesystem reading and codebase analysis |
| **PlanAgent** | Task decomposition and planning |
| **DeveloperAgent** | Code authoring, editing, and refactoring |
| **QualityAgent** | Testing, linting, and verification |
| **DevOpsAgent** | Infrastructure and dependency management |
| **BrowserAgent** | Headless web navigation and data extraction |
| **NetworkAgent** | API testing and network diagnostics |

### Routing Logic

- **STEM queries** (math, physics, logic) → Local CognitionCore (deterministic, zero latency)
- **System queries** (CPU, memory, processes) → Kernel Interface (direct OS telemetry)
- **Code/language tasks** → Cloud LLM with automatic 12-model fallback cascade
- **Security analysis** → Mythos Engine + CyberSecurityKing (10-engine scan)

---

## 🏗️ Architecture

```
┌─── CORTEX v4.0 ─── Single Unified Process ────────────────────────────┐
│                                                                        │
│  ┌─ CortexKernel (Singleton) ───────────────────────────────────┐     │
│  │  CognitionCore │ ARL │ Mythos │ Absorber │ Hypervisor        │     │
│  │  BeastMode     │ EpisodicMemory │ SymbolicEngine │ Physics   │     │
│  └──────────────────────────────────────────────────────────────┘     │
│        ↕ direct function call (zero-latency)                          │
│  ┌─ AgentManager ──────────────────────────────────────────────┐     │
│  │  Smart Routing → Local CognitionCore OR Cloud LLM            │     │
│  │  7 Sub-agents │ Plugin System │ SharedContext                 │     │
│  └──────────────────────────────────────────────────────────────┘     │
│        ↕                                                               │
│  ┌─ React Ink TTY ─────────────────────────────────────────────┐     │
│  │  Chat UI │ /beast │ /dashboard Live Telemetry                │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Installation & Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher)
- [Git](https://git-scm.com/)

### 2. Clone the Repository
```bash
git clone https://github.com/vimalspaceton618-afk/CORTEX.git
cd CORTEX
```

### 3. Install Dependencies
```bash
npm install
cd BIGROCK_ASI && npm install && cd ..
```

### 4. Build & Boot
```bash
# Compiles BIGROCK ASI + CORTEX, then launches the terminal
npm run boot
```

### 5. Install Globally (Optional)
```bash
npm install -g .
```

---

## 💻 Usage

### Terminal Commands

| Command | Action |
| :--- | :--- |
| `/help` | Display all commands and agents |
| `/beast` | Toggle BEASTMODE (cranks all subsystem configs to max) |
| `/dashboard` | Toggle live real-time system monitoring |
| `/status` | Full system status report |
| `/think <query>` | Force route through local CognitionCore |
| `/arl` | Show Autonomous Reasoning Loop metrics |
| `/arl start` | Start ARL background cycles |
| `/arl stop` | Stop ARL background cycles |
| `/brain eat` | Scan and absorb local GGUF models |
| `/brain` | Show active brain info and model status |
| `/brain iq` | Show Collective Intelligence Quotient breakdown |
| `/brain wisdom` | Show domain coverage heat map |
| `/mythos <arch>` | Run Mythos threat analysis on an architecture description |
| `/cyberscan` | Full spectrum 10-engine security scan |
| `/cyberheal` | Generate autonomous remediation scripts |
| `/demo` | Run the automated showcase sequence |
| `/health` | Show runtime readiness checks |
| `/setup` | Brain configuration wizard |
| `/exit` | Quit |

### Examples
```
cortex> escape velocity from Earth
→ [Local CognitionCore] 11186.0 m/s (100% Deterministic Proof)

cortex> /think p AND q IMPLIES p
→ [Formal Logic Prover] TAUTOLOGY (always true) — 100% Confidence

cortex> /mythos A Node.js API connected to S3 and Stripe
→ ⚠️ 8 Myth Gaps detected (Cloud Security, Web & API, DevSecOps...)

cortex> Refactor the authentication module to use JWT
→ [AgentManager → DeveloperAgent → QualityAgent auto-verification]
```

---

## 🛡️ Security

- **Input Sanitization**: SecurityProcessor scans all inputs before processing (injection, prompt attack, path traversal detection)
- **Integrity Chain**: Every thought is cryptographically hashed (AES-256-GCM) into a sequential chain — tampering is detectable
- **Process Hypervisor**: All engine executions are sandboxed with capability-based access tokens
- **Mythos Threat Ontology**: 12-domain threat taxonomy mapping architecture descriptions to known TTPs
- **Air-Gap Compatible**: The CognitionCore, physics engine, math engine, and logic prover require zero network access

---

## 📄 License

**© 2026 SpaceTon.**  
This software is **proprietary**. Unauthorized copying, distribution, or modification is prohibited.
