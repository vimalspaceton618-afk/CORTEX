# CORTEX: Self-Learning Superintelligence

CORTEX is a self-auditing AI system that becomes a "100-year humanoid programmer" by learning from the mistakes of other AI models and verifying answers against real technical sources.

## Architecture

```
User Question → Knowledge Lookup → Teacher Query → King Verification → Synthesis → Store
```

### Components

1. **Council of Critics** - Orchestrates multiple teacher models (Claude, Gemini, GPT-4, etc.)
2. **King of Browser** - Technical reconnaissance agent that scrapes source code, DNS, API docs
3. **Knowledge Graph** - Local vector database of verified Q&A pairs (FAISS + SQLite)
4. **Verification Engine** - Compares teacher responses against King's verified data
5. **Self-Training Loop** - Continuously expands knowledge by asking questions, verifying, storing

### Key Features

- **No Hallucination Ground Truth**: Uses real technical sources (source code, official docs) as truth
- **Teacher Mistake Tracking**: Knows exactly where each model fails
- **Instant Knowledge Recall**: Answers from knowledge graph in < 10ms
- **Private Azure Storage**: All data stored locally on Z: drive (5TB)
- **Continuous Learning**: Gets smarter with every query

## Installation

```bash
# Clone and setup
cd cortex
python -m venv venv
venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Install FAISS (CPU version)
pip install faiss-cpu

# Configure environment
cp .env.example .env
# Edit .env with your API keys
```

### Required API Keys

- `ANTHROPIC_API_KEY` - For Claude
- `GOOGLE_API_KEY` - For Gemini
- `GROQ_API_KEY` - For Groq (free tier)
- `TOGETHER_API_KEY` - For Llama (free tier)
- `GITHUB_TOKEN` - Optional but recommended for King

## Configuration

Create `config.yaml` or use environment variables. Example:

```yaml
teachers:
  - name: "ClaudeOpus"
    provider: "anthropic"
    api_key_env: "ANTHROPIC_API_KEY"
    model_id: "claude-opus-4-6-20250514"
    enabled: true

king:
  github_token_env: "GITHUB_TOKEN"

knowledge:
  storage_path: "Z:/cortex_data"
  embedding_model: "all-MiniLM-L6-v2"
  use_faiss: true
  similarity_threshold: 0.85
```

## Usage

### Ask a Question

```bash
# Interactive query
python cortex/cli.py ask "How do I validate an IPv4 address with regex in Python?"

# Or use main.py
python main.py ask "What's the signature of Python's re.compile()?"
```

### Run Self-Training

```bash
python cortex/cli.py train --iterations 100
```

### Check Status

```bash
python cortex/cli.py status
```

## How It Works

### 1. Initial State (Empty Knowledge)
```
User Question
    ↓
Knowledge graph miss
    ↓
Query all teachers (Claude, Gemini, Groq, etc.)
    ↓
King of Browser scrapes verification source (GitHub, docs, DNS)
    ↓
Verify teacher responses against King's verified data
    ↓
Synthesize answer from scratch using only verified data
    ↓
Store in knowledge graph
    ↓
Return answer + verification summary
```

### 2. Mature State (Knowledge Grows)
Once a question has been asked and verified:
```
User Question
    ↓
Knowledge graph hit (>95% similarity)
    ↓
Return answer immediately (no teacher calls, no King)
    ↓
< 10ms response time
```

### 3. Self-Training Mode
Continuously ask questions to fill knowledge gaps:
```bash
python cortex/cli.py train --iterations 1000
```
Result: Knowledge graph grows from 0 → 10,000+ verified Q&A pairs.

## Storage

All data stored on Z: drive (5TB Google Drive):

```
Z:/cortex_data/
├── knowledge_graph/       # JSONL files (partitioned by year/month)
│   ├── 2025/
│   │   └── 04/
│   │       └── ...json
├── embeddings_cache/      # Cached embeddings
├── mistakes/             # Teacher mistake registry
└── local_index.db        # SQLite index (FAISS vector index nearby)
```

## Architecture Highlights

### Verification Sources (King of Browser)

- **GitHub Repos**: Scrape source code, extract functions/classes
- **Official Docs**: Download and parse documentation
- **DNS Records**: Query live DNS for domain verification
- **API Schemas**: Extract OpenAPI/Swagger specs
- **URLs**: Scrape markdown/text content

### Teacher Models

- Claude (Anthropic)
- Gemini (Google)
- GPT-4 (OpenAI)
- Llama 3/4 (Groq, Together)
- Add your own via OpenAI-compatible API

### Contradiction Detection

- Semantic similarity using sentence-transformers
- Numerical conflict detection
- Oppositional keyword matching
- Code-specific pattern analysis

## Advanced Usage

### Programmatic API

```python
import asyncio
from cortex.config import load_config
from cortex.models.council import create_council

async def main():
    council = await create_council('config.yaml')

    # Single question
    result = await council.process_question("Your question here")
    print(result['answer'])

    # Batch processing
    questions = ["Q1", "Q2", "Q3"]
    for q in questions:
        result = await council.process_question(q)
        print(f"Q: {q}\nA: {result['answer']}\n")

asyncio.run(main())
```

### Custom Verification Source

```python
# Extend King of Browser
from cortex.king.browser import KingOfBrowser

class CustomKing(KingOfBrowser):
    async def analyze(self, target, target_type="auto"):
        # Add custom scraping logic
        map = await super().analyze(target, target_type)
        # Modify map as needed
        return map
```

### Teacher Customization

```python
from cortex.config import TeacherConfig

config = TeacherConfig(
    name="MyTeacher",
    provider="openai",
    api_key_env="MY_API_KEY",
    model_id="my-model-id",
    base_url="https://api.example.com/v1"
)
```

## Development

### Project Structure

```
cortex/
├── cortex/
│   ├── king/               # King of Browser
│   │   ├── browser.py
│   │   ├── scrapers.py
│   │   └── topology.py
│   ├── knowledge/          # Storage & Graph
│   │   ├── storage.py     # File I/O to Z: drive
│   │   ├── graph.py       # SQLite + FAISS
│   │   └── generator.py   # Training question generation
│   ├── models/            # Teacher & Council
│   │   ├── teacher.py    # Teacher clients
│   │   └── council.py    # Orchestrator + verification
│   ├── config.py         # Configuration management
│   └── cli.py           # Command line interface
├── main.py              # Entry point
├── config.yaml          # Config template
├── requirements.txt     # Dependencies
└── README.md
```

## Performance Goals

| Metric | Target |
|--------|--------|
| Knowledge lookup latency | < 10ms |
| Full verification latency | < 3s |
| Training iterations per hour | 1000+ |
| Knowledge graph capacity | 10M+ Q&A pairs (limited by disk) |
| Storage efficiency | ~5KB per entry |

## FAQ

**Q: Does CORTEX call the teacher models for every question?**
A: No. Once a question is in the knowledge graph, CORTEX retrieves it instantly without any teacher calls.

**Q: What if King of Browser can't verify something?**
A: Answer is returned with a warning. Verification source is recorded.

**Q: How do I add more teacher models?**
A: Add to `config.yaml` with provider, model_id, and api_key_env.

**Q: Can I use cloud storage instead of Z: drive?**
A: Yes, modify `LocalStorage` to use Azure Blob, Google Cloud, or AWS S3.

## Contributing

This is a living project. Contribute:
1. New scrapers for verification sources
2. Better contradiction detection algorithms
3. More efficient embedding models
4. Training curriculum improvements

## License

TBD

---

**CORTEX** - The self-auditing AI that learns by watching other AIs fail.
