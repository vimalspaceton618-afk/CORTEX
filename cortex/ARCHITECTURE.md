# CORTEX Architecture Documentation

## System Overview

CORTEX is a self-learning AI system that achieves "100-year humanoid programmer" status by:

1. **Querying multiple teacher models** (Claude, Gemini, GPT-4, etc.) for answers
2. **Verifying against ground truth** using King of Browser (scrapes source code, DNS, official docs)
3. **Storing verified Q&A** in local knowledge graph with vector embeddings
4. **Tracking teacher mistakes** to learn patterns of hallucination
5. **Continuous self-training** to grow knowledge exponentially

## Data Flow

```
┌─────────────┐
│   User      │
│  Question   │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ Knowledge Graph     │◄─Fast lookup (<10ms)
│ (SQLite + FAISS)    │
└─────────┬───────────┘
          │ Miss (similarity < 0.95)
          ▼
┌─────────────────────┐
│  Council of Critics │
│  (Query Teachers)   │
└─────────┬───────────┘
          │
    ┌─────┴─────┐
    │           │
    ▼           ▼
┌───────┐  ┌─────────────┐
│Claude │  │ King of     │
│Gemini │  │ Browser     │
│Groq   │  │ (Verify)    │
│Llama  │  └──────┬──────┘
└───────┘         │
                  ▼
          ┌───────────────┐
          │ Verification  │
          │ Engine        │
          └──────┬────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
   Correct          Incorrect
        │                 │
        └────────┬────────┘
                 ▼
          ┌──────────────┐
          │ Synthesis    │
          │ (Write from  │
          │  scratch)    │
          └──────┬───────┘
                 │
                 ▼
          ┌──────────────┐
          │ Store in     │
          │ Knowledge    │
          │ Graph        │
          └──────┬───────┘
                 │
                 ▼
          ┌──────────────┐
          │ Return       │
          │ Answer       │
          │ + Summary    │
          └──────────────┘
```

## Component Details

### 1. King of Browser (`cortex/king/`)

**Purpose**: Technical reconnaissance to obtain verified ground truth.

**Sources**:
- GitHub repositories (code, functions, classes)
- DNS records (A, AAAA, CNAME, MX, TXT)
- URLs and documentation (scraped text, code blocks)
- API specifications (OpenAPI/Swagger)

**Output**: `TechnicalTopologyMap` (JSON structure)
```json
{
  "source_url": "github.com/python/cpython",
  "source_type": "github",
  "timestamp": "2025-04-05T...",
  "code_files": [
    {
      "path": "...",
      "language": "python",
      "content": "...",
      "functions": ["func1", "func2"],
      "classes": ["ClassA"]
    }
  ],
  "dns_records": [...],
  "api_endpoints": [...],
  "documentation_snippets": [...]
}
```

### 2. Knowledge Graph (`cortex/knowledge/`)

**Storage** (`storage.py`):
- Base path: `Z:/cortex_data/`
- Partitioned by date: `knowledge_graph/YYYY/MM/*.json`
- Mistake registry: `mistakes/*.json`
- Embedding cache: `embeddings_cache/*.npy`

**Index** (`graph.py`):
- SQLite `local_index.db` for metadata and full-text search
- FAISS index for fast vector similarity search (cosine/L2)
- Embeddings from `sentence-transformers` (384-dim for MiniLM)

**Schema**:
```sql
CREATE TABLE entries (
    id TEXT PRIMARY KEY,
    question TEXT,
    answer TEXT,
    embedding BLOB,
    metadata JSON,
    source_teacher TEXT,
    verification_source TEXT,
    created_at TIMESTAMP
)
```

### 3. Council of Critics (`cortex/models/`)

**Teacher Clients** (`teacher.py`):
- Abstract `TeacherClient` base class
- Implementations: `AnthropicTeacher`, `OpenAITeacher`, `GoogleTeacher`
- Factory `create_teacher()` instantiates from config
- All responses normalized to `TeacherResponse` dataclass

**Verification Engine** (`council.py`):
- `VerificationResult` class holds labels: CORRECT/INCORRECT/UNVERIFIED
- Compares teacher claims to King data using semantic similarity
- Detects contradictions pairwise between teachers
- Classifies errors: code, math, factual, reasoning

**Council Orchestration**:
```python
council = CouncilOfCritics(config, knowledge_graph, storage)
result = await council.process_question("...", store_in_knowledge=True)
# result = {answer, source, verification_summary, teacher_labels, ...}
```

### 4. Self-Training Loop

**Training Mode** (`cortex/cli.py train`):
```bash
python cortex/cli.py train --iterations 1000
```

**Process**:
1. Generate training questions (from seed pool + paraphrasing)
2. For each question:
   - Query teachers (if not in knowledge)
   - Run King verification
   - Synthesize verified answer
   - Store in knowledge graph
   - Log mistakes
3. Repeat until iterations complete

**Knowledge Growth**:
- Each iteration adds ~1 verified Q&A to knowledge graph
- After 1000 iterations: ~1000 entries (seed coverage)
- After 10,000 iterations: ~8,000-10,000 entries (substantial coverage)

### 5. Synthesis Engine

**Final Answer Generation** (`council._synthesize_answer`):
- **Primary**: Use ground truth from verification (King's verified data)
- **Fallback**: If King has no direct match, synthesize from King's extracted snippets
- **Last resort**: Majority vote from teachers (with warning)

**Answer Sources**:
1. Knowledge graph hit (95%+ similarity)
2. Verified ground truth from King
3. Synthesized from King's code/docs
4. Unverified teacher consensus

**Never** copy teachers verbatim - always rewrite from verified data.

## Configuration

See `config.yaml` for example. Key sections:

```yaml
teachers:  # List of teacher models
  - name: "ClaudeOpus"
    provider: "anthropic"  # anthropic, openai, google, groq, together
    api_key_env: "ANTHROPIC_API_KEY"
    model_id: "claude-opus-4-6-20250514"
    enabled: true

king:  # King of Browser settings
  github_token_env: "GITHUB_TOKEN"  # Optional but good for rate limits
  user_agent: "CORTEX-King/1.0"

knowledge:  # Knowledge graph settings
  storage_path: "Z:/cortex_data"
  embedding_model: "all-MiniLM-L6-v2"
  use_faiss: true
  similarity_threshold: 0.85  # Vector similarity threshold
```

## File Structure

```
cortex/
├── cortex/
│   ├── king/
│   │   ├── browser.py      # KingOfBrowser main class + analyze()
│   │   ├── scrapers.py     # GitHub, DNS, URL scrapers
│   │   └── topology.py     # TechnicalTopologyMap dataclass
│   ├── knowledge/
│   │   ├── storage.py      # LocalStorage (Z: drive I/O)
│   │   ├── graph.py        # KnowledgeGraph (SQLite + FAISS)
│   │   └── generator.py    # Question generation for training
│   ├── models/
│   │   ├── teacher.py      # TeacherClient classes
│   │   └── council.py      # CouncilOfCritics + VerificationEngine
│   ├── config.py           # Config loader (env + YAML)
│   └── cli.py             # CLI entry point
├── main.py                # Alternative entry point
├── demo.py                # Integration test / demo
├── requirements.txt
├── config.yaml
├── .env.example
└── README.md
CORTEX_Project_Plan.md   # This document
```

## Setup Checklist

- [ ] Install Python 3.10+
- [ ] `pip install -r requirements.txt`
- [ ] Set up API keys in `.env` (at least 2 teachers)
- [ ] Configure `config.yaml` with teachers and storage path
- [ ] Create storage directory on Z: drive: `mkdir Z:\cortex_data`
- [ ] Run `python demo.py` to test
- [ ] Run `python cortex/cli.py ask "test question"` first query
- [ ] Run `python cortex/cli.py train --iterations 100` to bootstrap knowledge

## Performance Expectations

| Operation | Expected Time | Notes |
|-----------|---------------|-------|
| Knowledge lookup (hit) | < 10ms | No external calls |
| Knowledge lookup (miss) | ~50ms | SQLite + FAISS search |
| Teacher query (parallel) | 1-3s | Depends on API latency |
| King verification | 0.5-2s | Varies by source |
| Full pipeline (miss) | 2-5s | Teachers + King + synthesis |
| Self-training iteration | 3-10s | Includes storage |

## Scalability

- **Knowledge Graph**: Can scale to millions of entries (FAISS + SQLite)
- **Storage**: 5TB Z: drive = ~100M Q&A pairs (at 50KB each)
- **Throughput**: Knowledge lookups are extremely fast; training is I/O bound

## Extensibility

### Add New Teacher

```python
# In teacher.py, add to TEACHER_CLASSES
class MyProviderTeacher(TeacherClient):
    async def query(self, prompt: str) -> TeacherResponse:
        # Implement API call
        pass

TEACHER_CLASSES['myprovider'] = MyProviderTeacher
```

### Add New Verification Source

```python
# In scrapers.py, extend KingOfBrowser.analyze()
if target_type == 'my_source':
    data = await self._scrape_my_source(target)
    # Convert to CodeFile/DNSRecord/APIEndpoint
```

### Custom Contradiction Detection

Extend `VerificationEngine._detect_contradictions()` with:
- Embedding-based semantic similarity (SBERT cross-encoder)
- LLM-based claim extraction and comparison
- Symbolic logic comparison

## Monitoring

### Key Metrics

- Knowledge graph entry count
- Teacher accuracy rates (from verification labels)
- Average response latency (broken down by hit/miss)
- Contradiction rate over time (should decrease as knowledge grows)
- King caching hit rate

### Logs to Track

- `[CORTEX] Processing: ...`
- `[KING] Analyzing ...`
- `[Verification] labels: {Claude: CORRECT, Gemini: INCORRECT}`
- `[Storage] Stored entry: ...`

## Troubleshooting

**Problem**: Import errors for `anthropic`, `google.generativeai`
**Solution**: `pip install anthropic google-generativeai`

**Problem**: FAISS index corrupted or empty
**Solution**: Delete `local_index.db` and `faiss.index`, restart (will rebuild from storage)

**Problem**: King verification too slow
**Solution**: Cache per domain (`king_cache.json`), or run King asynchronously while teachers query

**Problem**: Memory errors with large knowledge graph
**Solution**: Use HNSW index in FAISS (more memory efficient) or switch to ChromaDB

## Next Steps

1. **Implement embedding-based contradiction detection** (currently using Jaccard similarity)
2. **Add King result caching** (domain-based TTL)
3. **Build curriculum trainer** with adaptive question generation
4. **Expose REST API** for programmatic access
5. **Add metrics endpoint** (`/metrics`) for Prometheus
6. **Implement mistake pattern analysis** (find systematic hallucination patterns)
7. **Add multi-modal support** (images, PDFs) for King

---

**CORTEX - The Self-Auditing AI**
