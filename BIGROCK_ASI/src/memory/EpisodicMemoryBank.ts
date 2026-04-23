import { createHash } from 'crypto';
import type { Thought } from '../core/types.js';

/**
 * BIGROCK_v1 — Episodic Memory Bank (EMB)
 * ─────────────────────────────────────────────────────────────────────────
 * A long-term, semantically-searchable memory store that persists
 * all significant thoughts beyond the 2-minute TTL of MemoryCore.
 *
 * ARCHITECTURE:
 *   MemoryCore     — Fast, volatile, working memory (2m TTL)
 *   EpisodicMemoryBank — Long-term, semantic, searchable, persistent
 *
 * SIMILARITY SEARCH:
 *   Uses NATIVE DENSE VECTORS extracted from GGUF models.
 *   Falls back to TF-IDF if embeddings are unavailable.
 *
 * MEMORY TIERS:
 *   EPISODIC    — Raw thought records (what happened)
 *   SEMANTIC    — Abstracted knowledge (what was learned)
 *   PROCEDURAL  — Action sequences that worked (how to do things)
 */

export type MemoryTier = 'episodic' | 'semantic' | 'procedural';

export interface MemoryRecord {
    id: string;
    tier: MemoryTier;
    timestamp: number;
    domain: string;
    query: string;
    result: string;
    confidence: number;
    proof_trace: string[];
    tags: string[];
    access_count: number;
    hash: string;  // SHA-256(query + result) — tamper detection
    dense_vector?: Float32Array | null; // Extracted GGUF embeddings
}

export interface SearchResult {
    record: MemoryRecord;
    similarity: number;  // 0.0–1.0
    reason: string;
}

export class EpisodicMemoryBank {
    private bank: Map<string, MemoryRecord> = new Map();
    private idf_cache: Map<string, number> = new Map();
    private idf_dirty: boolean = true;
    private encoder: ((text: string) => Float32Array | null) | null = null;

    // ─── Encoder ───────────────────────────────────────────────────────────────
    public setEncoder(encoder: (text: string) => Float32Array | null) {
        this.encoder = encoder;
    }

    // ─── Write ─────────────────────────────────────────────────────────────────

    /**
     * Store a Thought from the CognitionCore into long-term memory.
     * Automatically converts it to a MemoryRecord.
     */
    public store(thought: Thought, tier: MemoryTier = 'episodic'): MemoryRecord {
        const query = thought.raw_input;
        const result = String(thought.result?.value ?? '');
        const hash = createHash('sha256').update(query + result).digest('hex').slice(0, 32);

        // De-duplicate: update access_count if same hash exists
        const existing = this.findByHash(hash);
        if (existing) {
            existing.access_count++;
            return existing;
        }

        const record: MemoryRecord = {
            id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            tier,
            timestamp: thought.timestamp,
            domain: thought.parsed_intent.domain,
            query,
            result,
            confidence: thought.confidence,
            proof_trace: thought.result?.proof_trace ?? [],
            tags: this.extractTags(query, thought.parsed_intent.domain),
            access_count: 1,
            hash,
            dense_vector: this.encoder ? this.encoder(query) : null
        };

        this.bank.set(record.id, record);
        this.idf_dirty = true;
        return record;
    }

    /**
     * Store an abstracted semantic fact (not from a Thought object).
     */
    public storeFact(query: string, result: string, domain: string, confidence: number = 1.0): MemoryRecord {
        const hash = createHash('sha256').update(query + result).digest('hex').slice(0, 32);
        const existing = this.findByHash(hash);
        if (existing) { existing.access_count++; return existing; }

        const record: MemoryRecord = {
            id: `fact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            tier: 'semantic',
            timestamp: Date.now(),
            domain,
            query,
            result,
            confidence,
            proof_trace: [],
            tags: this.extractTags(query, domain),
            access_count: 1,
            hash,
            dense_vector: this.encoder ? this.encoder(query) : null
        };
        this.bank.set(record.id, record);
        this.idf_dirty = true;
        return record;
    }

    // ─── Search ────────────────────────────────────────────────────────────────

    /**
     * Find the most semantically similar memory records to a query.
     * Uses dense neural embeddings if available, otherwise falls back to TF-IDF.
     */
    public search(query: string, topK: number = 5, minSimilarity: number = 0.1): SearchResult[] {
        if (this.bank.size === 0) return [];

        const dense_query = this.encoder ? this.encoder(query) : null;
        
        let queryTokens: string[] = [];
        let queryVec: Map<string, number> | null = null;
        if (!dense_query) {
            this.rebuildIDF();
            queryTokens = this.tokenize(query);
            queryVec = this.tfVector(queryTokens);
        }

        const results: SearchResult[] = [];

        for (const record of this.bank.values()) {
            let sim = 0;
            let reason = '';

            // Neural Dense Vector Similarity
            if (dense_query && record.dense_vector) {
                sim = this.denseCosineSimilarity(dense_query, record.dense_vector);
                if (sim >= minSimilarity) {
                    reason = `Neural embedding match (${(sim*100).toFixed(1)}%)`;
                }
            } 
            // Fallback TF-IDF
            else if (queryVec) {
                const docTokens = this.tokenize(record.query + ' ' + record.result + ' ' + record.tags.join(' '));
                const docVec = this.tfVector(docTokens);
                sim = this.cosineSimilarity(queryVec, docVec);
                if (sim >= minSimilarity) {
                    reason = this.explainSimilarity(queryTokens, docTokens);
                }
            }

            if (sim >= minSimilarity) {
                results.push({ record, similarity: sim, reason });
            }
        }

        return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
    }

    /**
     * Find memories by exact domain.
     */
    public findByDomain(domain: string, tier?: MemoryTier): MemoryRecord[] {
        return Array.from(this.bank.values()).filter(r =>
            r.domain === domain && (!tier || r.tier === tier)
        ).sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Find the most-accessed (consolidated) memories.
     */
    public getHotMemories(n: number = 10): MemoryRecord[] {
        return Array.from(this.bank.values())
            .sort((a, b) => b.access_count - a.access_count)
            .slice(0, n);
    }

    // ─── Maintenance ───────────────────────────────────────────────────────────

    /**
     * Consolidate episodic → semantic: find repeated patterns and distill them
     * into a compact semantic fact. This is how Bigrock "learns" a domain.
     */
    public consolidate(): { facts_created: number; records_pruned: number } {
        const episodic = Array.from(this.bank.values()).filter(r => r.tier === 'episodic' && r.access_count >= 3);
        let facts_created = 0;
        let records_pruned = 0;

        // Group by domain
        const byDomain = new Map<string, MemoryRecord[]>();
        for (const r of episodic) {
            if (!byDomain.has(r.domain)) byDomain.set(r.domain, []);
            byDomain.get(r.domain)!.push(r);
        }

        for (const [domain, records] of byDomain) {
            if (records.length >= 3) {
                // Create a semantic summary record for this domain cluster
                const summary = `Domain ${domain}: ${records.length} verified computations.`;
                this.storeFact(
                    `consolidated::${domain}`,
                    summary,
                    domain,
                    records.reduce((s, r) => s + r.confidence, 0) / records.length
                );
                facts_created++;

                // Prune oldest episodic records beyond 20 per domain
                const sorted = records.sort((a, b) => a.timestamp - b.timestamp);
                const toRemove = sorted.slice(0, Math.max(0, sorted.length - 20));
                for (const r of toRemove) {
                    this.bank.delete(r.id);
                    records_pruned++;
                }
                this.idf_dirty = true;
            }
        }

        return { facts_created, records_pruned };
    }

    // ─── LoRA Synthesis (Phi-3 Auto-Training) ─────────────────────────────────

    /**
     * Synthesize all verified episodic and semantic memories into a JSONL
     * dataset formatted for LoRA fine-tuning of Microsoft Phi-3 or similar SLMs.
     * Bigrock literally generates its own training data.
     */
    public exportLoRADataset(): string {
        const dataset: Array<{ system: string, user: string, assistant: string }> = [];
        const system_prompt = "You are an auxiliary component of Bigrock_v1 ASI. Answer strictly with verified deterministic logic.";

        for (const r of this.bank.values()) {
            if (r.confidence >= 0.8 && r.result.length > 5 && !r.result.includes('[SLM')) {
                dataset.push({
                    system: system_prompt,
                    user: r.query,
                    assistant: r.result + (r.proof_trace.length ? `\nProof Trace:\n${r.proof_trace.join('\n')}` : '')
                });
            }
        }

        return dataset.map(d => JSON.stringify(d)).join('\n');
    }

    public getStats() {
        const byTier = { episodic: 0, semantic: 0, procedural: 0 };
        const byDomain: Record<string, number> = {};
        for (const r of this.bank.values()) {
            byTier[r.tier]++;
            byDomain[r.domain] = (byDomain[r.domain] ?? 0) + 1;
        }
        return { total: this.bank.size, by_tier: byTier, by_domain: byDomain };
    }

    public size(): number { return this.bank.size; }

    // ─── TF-IDF / Similarity Internals ─────────────────────────────────────────

    private tokenize(text: string): string[] {
        return text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 1 && !STOP_WORDS.has(t));
    }

    private tfVector(tokens: string[]): Map<string, number> {
        const tf = new Map<string, number>();
        for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
        for (const [t, count] of tf) tf.set(t, count / tokens.length);
        return tf;
    }

    private rebuildIDF(): void {
        if (!this.idf_dirty) return;
        this.idf_cache.clear();
        const N = this.bank.size;
        if (N === 0) return;

        const df = new Map<string, number>();
        for (const r of this.bank.values()) {
            const tokens = new Set(this.tokenize(r.query + ' ' + r.result));
            for (const t of tokens) df.set(t, (df.get(t) ?? 0) + 1);
        }

        for (const [term, freq] of df) {
            this.idf_cache.set(term, Math.log((N + 1) / (freq + 1)) + 1);
        }
        this.idf_dirty = false;
    }

    private cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
        let dot = 0, normA = 0, normB = 0;

        for (const [term, tfA] of a) {
            const idf = this.idf_cache.get(term) ?? 1;
            const tfidfA = tfA * idf;
            const tfidfB = (b.get(term) ?? 0) * idf;
            dot += tfidfA * tfidfB;
            normA += tfidfA * tfidfA;
        }
        for (const [term, tfB] of b) {
            const idf = this.idf_cache.get(term) ?? 1;
            normB += (tfB * idf) ** 2;
        }

        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom === 0 ? 0 : dot / denom;
    }

    private denseCosineSimilarity(a: Float32Array, b: Float32Array): number {
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
    }

    private explainSimilarity(queryTokens: string[], docTokens: string[]): string {
        const qSet = new Set(queryTokens);
        const dSet = new Set(docTokens);
        const overlap = [...qSet].filter(t => dSet.has(t));
        return overlap.slice(0, 4).join(', ');
    }

    private extractTags(text: string, domain: string): string[] {
        const tags = [domain];
        const keywords = ['energy', 'force', 'velocity', 'mass', 'time', 'light', 'quantum',
                          'derivative', 'integral', 'solve', 'prove', 'logic', 'tautology'];
        for (const kw of keywords) {
            if (text.toLowerCase().includes(kw)) tags.push(kw);
        }
        return [...new Set(tags)];
    }

    private findByHash(hash: string): MemoryRecord | undefined {
        for (const r of this.bank.values()) {
            if (r.hash === hash) return r;
        }
    }
}

const STOP_WORDS = new Set([
    'the','a','an','is','it','of','in','at','to','for','on','with','as','by',
    'from','that','this','and','or','not','be','was','are','were','been','has'
]);
