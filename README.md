<div align="center">

# ⚡ CORTEX System v3.0

**Enterprise-Grade Agentic OS & Terminal Environment**

</div>

---

## 📖 Overview
CORTEX is a high-performance, fully autonomous Multi-Agent Operating System installed natively inside your Command Terminal via Node.js and TypeScript. 

Featuring a sleek, minimalist retro-CRT aesthetic rendered with React Ink, CORTEX operates linearly at 0% latency using asynchronous TS generators. By decoupling the "Body" (the native system execution environment) from the "Brain" (the AI model), CORTEX creates an unrestricted execution arena that can be driven by any LLM.

---

## 🚀 Key Features

### 🧠 Swappable Intelligence (Body & Brain Separation)
CORTEX provides the ultimate vessel: the tools, the agents, and the file-system permissions. You provide the Brain. Using universal proxy architecture, you can plug your `OPENAI_API_KEY` or custom `OPENAI_BASE_URL` into any compatible LLM:
* **Frontier Models**: OpenAI, Anthropic, Gemini, DeepSeek
* **Local / Open Source**: LLaMa 3, Mistral, LM Studio, Ollama

### 🤖 The Autonomous Agent Swarm
Six distinct, highly specialized agents handle complex software pipelines autonomously:
- **ExploreAgent**: Research and codebase exploration.
- **PlanAgent**: High-level task structuring and design.
- **DeveloperAgent**: Native code authoring and editing.
- **QualityAgent**: Testing, linting, and bug fixing.
- **DevOpsAgent**: Infrastructure and deployment operations.
- **BrowserAgent**: Full web perception via Puppeteer and Vision tools.

### ⚡ Global Operating Execution & Vision
Boot CORTEX instantly in any directory using the `cortex` command. It takes over the active workspace, granting full system read/write access. Combined with `Vision.ts` capabilities, it can visually parse images, screenshots, and web pages.

### 🛡️ Secure Config Management (`~/.cortexcli`)
API Keys are heavily shielded. The dynamic `ConfigManager` isolates secure payload data to a strictly locked `~/.cortexcli/config.json` outside of the project repository, ensuring your keys never slip into Git commits.

---

## 🛠️ Public Installation Guide

Follow these steps to install CORTEX globally on your machine:

### 1. Clone the Repository
```bash
git clone https://github.com/vimalspaceton618-afk/CORTEX.git
cd CORTEX
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Build the CLI
Compile the TypeScript orchestrator and tools into the functional executable:
```bash
npm run build
```

### 4. Install Globally
Link the executable to your global path:
```bash
npm install -g .
# Alternatively, you can use: npm link
```

### 5. Setup Configuration
You can supply your API keys by creating a `.env` file in your root workspace (or let the ConfigManager handle it dynamically):
```env
OPENAI_API_KEY="your_api_key_here"
```

---

## 💻 Usage

Once installed globally, you can initialize the OS in any directory on your computer:

```bash
# Navigate to any targeted project
cd C:\Users\Admin\Documents\MyProject

# Boot the Operating System
cortex
```

From within the OS, you can interact with the system via direct natural language:
> *"Analyze this directory and set up a React application."*

> *"Open the browser, navigate to GitHub, and summarize the trending repositories."*

**System Commands:**
- Type `/help` - View all active agents and commands.
- Type `/dashboard` - Toggle monitoring tools.
- Hit `1` during the boot sequence to trust new workspaces.

---

## ⚠️ License & Proprietary Info
**© 2026 SpaceTon.** 
See `LICENSE` for exact details on distribution, modification, and utilization constraints.
