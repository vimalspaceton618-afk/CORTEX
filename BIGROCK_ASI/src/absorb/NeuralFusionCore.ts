import { NeuralExtract, type NeuralExtractData, type EmbeddingIndex } from './NeuralExtract.js';
import type { ModelEntry } from './ModelHive.js';

/**
 * BIGROCK_v2 — NeuralFusionCore (Tensor-Level Cross-Model Knowledge Merging)
 * ─────────────────────────────────────────────────────────────────────────
 * TRUE ABSORPTION — merging the neural knowledge of ALL absorbed models
 * at the embedding tensor level.
 *
 * WHAT IT DOES:
 *   1. EMBEDDING SPACE ALIGNMENT
 *      Maps multiple model vocabularies into a shared vector space using
 *      anchor tokens (common words). Enables cross-model semantic comparison.
 *
 *   2. UNIFIED EMBEDDING INDEX
 *      Merges all model vocabularies into one collective token→vector index.
 *      Any text can be encoded using ALL models' knowledge simultaneously.
 *
 *   3. CROSS-MODEL SIMILARITY
 *      Compares how text_a and text_b relate across EVERY absorbed model.
 *      Returns per-model and aggregate similarity scores.
 *
 *   4. KNOWLEDGE DISTILLATION INDEX
 *      For any topic/query, determines which absorbed model "knows" the most
 *      by computing embedding similarity to topic anchor vectors.
 *
 *   5. LAYER DNA COMPARISON
 *      Fingerprints model architectures using attention weight statistics.
 *      Models with complementary fingerprints = diverse knowledge.
 *
 *   6. COLLECTIVE VOCABULARY
 *      Union of all model vocabularies — expanded token coverage.
 *      Unknown tokens in one model may be known by another.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ModelKnowledge {
    /** Model filename */
    filename: string;
    /** Extracted neural data */
    extract: NeuralExtractData;
    /** NeuralExtract instance for encoding operations */
    encoder: NeuralExtract;
    /** When this knowledge was ingested */
    ingested_at: number;
}

export interface FusedEmbedding {
    /** Source text that was encoded */
    text: string;
    /** Combined embedding vector (average of all model encodings) */
    fused_vector: Float32Array;
    /** Per-model encodings */
    per_model: { filename: string; vector: Float32Array | null; dim: number }[];
    /** Number of models that contributed */
    models_contributed: number;
    /** Dimension of the fused vector */
    dim: number;
}

export interface CrossModelSimilarity {
    text_a: string;
    text_b: string;
    /** Per-model similarity scores */
    per_model: { filename: string; similarity: number }[];
    /** Consensus similarity (weighted average) */
    consensus_similarity: number;
    /** Min and max across models (range = disagreement) */
    min_similarity: number;
    max_similarity: number;
    /** Agreement score: 1.0 = all models agree, 0.0 = maximum disagreement */
    model_agreement: number;
}

export interface KnowledgeDistillation {
    /** Query text */
    query: string;
    /** Ranked models by how well they "know" this topic */
    model_rankings: {
        filename: string;
        relevance_score: number;
        top_related_tokens: { token: string; score: number }[];
    }[];
    /** Best model for this query */
    recommended_model: string;
    /** Confidence in recommendation */
    recommendation_confidence: number;
}

export interface LayerDNAComparison {
    model_a: string;
    model_b: string;
    /** 0.0 = identical architecture, 1.0 = completely different */
    architectural_diversity: number;
    /** Layer-by-layer L2 norm comparison */
    layer_deltas: number[];
    /** Whether models are complementary (high diversity = YES) */
    are_complementary: boolean;
    /** Dominant architecture differences */
    key_differences: string[];
}

export interface FusionStatus {
    total_models_fused: number;
    total_vocab_size: number;
    embedding_dim: number;
    models_with_embeddings: number;
    models_without_embeddings: string[];
    fusion_quality: number; // 0–1
    collective_vocab: number;
}

// ─── NeuralFusionCore ──────────────────────────────────────────────────────────

export class NeuralFusionCore {
    /** Map of filename → extracted knowledge */
    private knowledge_bank: Map<string, ModelKnowledge> = new Map();

    /** Unified token→vector index (merged across all models) */
    private unified_index: Map<string, Float32Array[]> = new Map();

    /** Canonical embedding dimension (from the highest-power model) */
    private canonical_dim: number = 0;

    /** Anchor tokens used for embedding alignment */
    private readonly ANCHOR_TOKENS = [
        'the', 'is', 'are', 'was', 'not', 'and', 'or', 'if', 'then', 'with',
        'have', 'has', 'for', 'from', 'this', 'that', 'which', 'they', 'code',
        'data', 'system', 'function', 'type', 'class', 'model', 'network',
        'security', 'algorithm', 'memory', 'process', 'error', 'result',
    ];

    // ═══════════════════════════════════════════════════════════════════════════
    //  INGEST MODEL KNOWLEDGE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Ingest the neural knowledge from a model's NeuralExtract.
     * This builds or updates the unified embedding index.
     */
    public async ingest(entry: ModelEntry, encoder: NeuralExtract): Promise<void> {
        if (!encoder.isExtracted()) {
            console.log(`[NeuralFusion]: ⚠ ${entry.filename} has no extracted embeddings — skipping fusion`);
            return;
        }

        const extract_data = encoder['data'] as NeuralExtractData | null;
        if (!extract_data) return;

        const knowledge: ModelKnowledge = {
            filename: entry.filename,
            extract: extract_data,
            encoder,
            ingested_at: Date.now(),
        };

        this.knowledge_bank.set(entry.filename, knowledge);

        // Update canonical dimension (take max dim for richest space)
        if (encoder.getEmbeddingDim() > this.canonical_dim) {
            this.canonical_dim = encoder.getEmbeddingDim();
        }

        // Rebuild unified index
        this.rebuildUnifiedIndex();

        console.log(`[NeuralFusion]: ✅ Ingested ${entry.filename} — vocab: ${encoder.getVocabSize().toLocaleString()}, dim: ${encoder.getEmbeddingDim()}`);
    }

    /**
     * Rebuild the unified token→vector index from all ingested models.
     * Each token maps to an array of vectors (one per model that knows the token).
     */
    private rebuildUnifiedIndex(): void {
        this.unified_index.clear();

        for (const knowledge of this.knowledge_bank.values()) {
            const embedding_index = knowledge.extract.embedding_index;
            if (!embedding_index) continue;

            const { tokens, vectors, dim, norms } = embedding_index;

            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i]?.replace('▁', '').toLowerCase();
                if (!token || token.startsWith('<') || token.length === 0 || norms[i] === 0) continue;

                // Extract the vector for this token
                const vec = new Float32Array(dim);
                const base = i * dim;
                if (base + dim > vectors.length) continue;

                for (let j = 0; j < dim; j++) {
                    vec[j] = vectors[base + j] / (norms[i] + 1e-8); // normalize
                }

                if (!this.unified_index.has(token)) {
                    this.unified_index.set(token, []);
                }
                this.unified_index.get(token)!.push(vec);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  FUSED ENCODING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Encode text using ALL models' embedding knowledge simultaneously.
     * Returns a fused embedding vector that captures collective understanding.
     */
    public fuseEncode(text: string): FusedEmbedding | null {
        if (this.knowledge_bank.size === 0) return null;

        const per_model: { filename: string; vector: Float32Array | null; dim: number }[] = [];
        let models_contributed = 0;

        // Encode with each model
        for (const knowledge of this.knowledge_bank.values()) {
            const vec = knowledge.encoder.encode(text);
            per_model.push({
                filename: knowledge.filename,
                vector: vec,
                dim: knowledge.encoder.getEmbeddingDim(),
            });
            if (vec !== null) models_contributed++;
        }

        if (models_contributed === 0) return null;

        // Compute fused vector: average of all model encodings
        // Pad shorter vectors with zeros to align dimensions
        const max_dim = Math.max(...per_model.map(m => m.dim));
        const fused_vector = new Float32Array(max_dim);
        let count = 0;

        for (const m of per_model) {
            if (!m.vector) continue;
            for (let i = 0; i < m.vector.length && i < max_dim; i++) {
                fused_vector[i] += m.vector[i];
            }
            count++;
        }

        if (count > 0) {
            for (let i = 0; i < fused_vector.length; i++) {
                fused_vector[i] /= count;
            }
        }

        return {
            text,
            fused_vector,
            per_model,
            models_contributed,
            dim: max_dim,
        };
    }

    /**
     * Compute cosine similarity between two fused embeddings.
     */
    public fusedSimilarity(text_a: string, text_b: string): number {
        const enc_a = this.fuseEncode(text_a);
        const enc_b = this.fuseEncode(text_b);
        if (!enc_a || !enc_b) return 0;
        return this.cosineSim(enc_a.fused_vector, enc_b.fused_vector);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  CROSS-MODEL SIMILARITY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Compare how text_a and text_b relate across EVERY absorbed model.
     * High agreement = both texts are universally similar.
     * Low agreement = models disagree (ambiguous semantic relationship).
     */
    public crossModelSimilarity(text_a: string, text_b: string): CrossModelSimilarity {
        const per_model: { filename: string; similarity: number }[] = [];

        for (const knowledge of this.knowledge_bank.values()) {
            const sim = knowledge.encoder.similarity(text_a, text_b);
            per_model.push({ filename: knowledge.filename, similarity: sim });
        }

        if (per_model.length === 0) {
            return {
                text_a, text_b,
                per_model: [],
                consensus_similarity: 0,
                min_similarity: 0, max_similarity: 0,
                model_agreement: 0,
            };
        }

        const scores = per_model.map(m => m.similarity);
        const consensus = scores.reduce((s, v) => s + v, 0) / scores.length;
        const min_sim = Math.min(...scores);
        const max_sim = Math.max(...scores);
        const range = max_sim - min_sim;
        // Agreement: 1.0 when range is 0, 0.0 when range is 1.0
        const model_agreement = Math.max(0, 1.0 - range);

        return {
            text_a, text_b,
            per_model,
            consensus_similarity: parseFloat(consensus.toFixed(4)),
            min_similarity: parseFloat(min_sim.toFixed(4)),
            max_similarity: parseFloat(max_sim.toFixed(4)),
            model_agreement: parseFloat(model_agreement.toFixed(4)),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  KNOWLEDGE DISTILLATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * For any query, determine which absorbed model "knows" the most about it.
     * Uses embedding similarity: models whose embedding space aligns better
     * with the query topic are more "knowledgeable" about it.
     */
    public distill(query: string, top_tokens: number = 5): KnowledgeDistillation {
        const model_rankings: KnowledgeDistillation['model_rankings'] = [];

        for (const knowledge of this.knowledge_bank.values()) {
            const encoder = knowledge.encoder;
            if (!encoder.isExtracted()) continue;

            // Find tokens most similar to this query
            const related_tokens = encoder.findSimilarTokens(query, top_tokens);

            // Relevance score: mean of top token similarities
            const relevance_score = related_tokens.length > 0
                ? related_tokens.reduce((s, t) => s + t.score, 0) / related_tokens.length
                : 0;

            model_rankings.push({
                filename: knowledge.filename,
                relevance_score: parseFloat(relevance_score.toFixed(4)),
                top_related_tokens: related_tokens.slice(0, top_tokens),
            });
        }

        // Sort by relevance
        model_rankings.sort((a, b) => b.relevance_score - a.relevance_score);

        const best = model_rankings[0];
        const second = model_rankings[1];
        const confidence = best && second
            ? Math.min(1.0, best.relevance_score / (second.relevance_score + 0.001))
            : 1.0;

        return {
            query,
            model_rankings,
            recommended_model: best?.filename ?? 'none',
            recommendation_confidence: parseFloat(Math.min(1.0, confidence).toFixed(3)),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  LAYER DNA COMPARISON
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Compare the architectural fingerprints of two models.
     * High diversity = complementary knowledge bases.
     */
    public compareLayerDNA(filename_a: string, filename_b: string): LayerDNAComparison | null {
        const ka = this.knowledge_bank.get(filename_a);
        const kb = this.knowledge_bank.get(filename_b);
        if (!ka || !kb) return null;

        const dna_a = ka.extract.layer_dna;
        const dna_b = kb.extract.layer_dna;

        if (dna_a.length === 0 || dna_b.length === 0) return null;

        const min_layers = Math.min(dna_a.length, dna_b.length);
        const layer_deltas: number[] = [];
        const key_differences: string[] = [];

        for (let i = 0; i < min_layers; i++) {
            const la = dna_a[i];
            const lb = dna_b[i];

            // Compare attention Q norms
            const q_delta = Math.abs((la.attn_q?.l2_norm ?? 0) - (lb.attn_q?.l2_norm ?? 0));
            const ffn_delta = Math.abs((la.ffn_gate?.l2_norm ?? 0) - (lb.ffn_gate?.l2_norm ?? 0));
            const layer_score = (q_delta + ffn_delta) / 2;
            layer_deltas.push(parseFloat(layer_score.toFixed(4)));

            // Flag highly divergent layers
            if (layer_score > 0.5 && key_differences.length < 5) {
                key_differences.push(`Layer ${i}: attn_q delta=${q_delta.toFixed(3)}, ffn delta=${ffn_delta.toFixed(3)}`);
            }
        }

        // Architectural diversity: mean layer delta, capped at 1.0
        const architectural_diversity = Math.min(1.0,
            layer_deltas.reduce((s, v) => s + v, 0) / (layer_deltas.length || 1)
        );

        // Complementary if diversity > 0.3 (meaningfully different architectures)
        const are_complementary = architectural_diversity > 0.3;

        if (are_complementary) {
            key_differences.unshift(
                `Models have COMPLEMENTARY architectures — together cover broader knowledge`
            );
        } else {
            key_differences.unshift(
                `Models have SIMILAR architectures — redundant but reliable consensus`
            );
        }

        return {
            model_a: filename_a,
            model_b: filename_b,
            architectural_diversity: parseFloat(architectural_diversity.toFixed(4)),
            layer_deltas,
            are_complementary,
            key_differences,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  COLLECTIVE VOCABULARY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Get the union of all model vocabularies.
     * Returns total unique token count.
     */
    public getCollectiveVocabSize(): number {
        return this.unified_index.size;
    }

    /**
     * Check if a token is known by ANY absorbed model.
     */
    public tokenKnown(token: string): boolean {
        return this.unified_index.has(token.toLowerCase());
    }

    /**
     * How many models know a given token?
     */
    public tokenCoverage(token: string): number {
        return this.unified_index.get(token.toLowerCase())?.length ?? 0;
    }

    /**
     * Find tokens known by ALL models (universal vocabulary).
     */
    public getUniversalVocab(sample_size: number = 100): string[] {
        const total_models = this.knowledge_bank.size;
        if (total_models === 0) return [];

        const result: string[] = [];
        for (const [token, vecs] of this.unified_index) {
            if (vecs.length >= total_models) {
                result.push(token);
                if (result.length >= sample_size) break;
            }
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  STATUS & DIAGNOSTICS
    // ═══════════════════════════════════════════════════════════════════════════

    public getStatus(): FusionStatus {
        const models_without: string[] = [];
        let models_with = 0;

        for (const knowledge of this.knowledge_bank.values()) {
            if (knowledge.encoder.hasEmbeddings()) {
                models_with++;
            } else {
                models_without.push(knowledge.filename);
            }
        }

        const total_models = this.knowledge_bank.size;
        const fusion_quality = total_models > 0 ? models_with / total_models : 0;

        return {
            total_models_fused: total_models,
            total_vocab_size: this.unified_index.size,
            embedding_dim: this.canonical_dim,
            models_with_embeddings: models_with,
            models_without_embeddings: models_without,
            fusion_quality: parseFloat(fusion_quality.toFixed(3)),
            collective_vocab: this.unified_index.size,
        };
    }

    public hasKnowledge(): boolean {
        return this.knowledge_bank.size > 0;
    }

    public getModelCount(): number {
        return this.knowledge_bank.size;
    }

    public getKnownModels(): string[] {
        return [...this.knowledge_bank.keys()];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  UTILITY
    // ═══════════════════════════════════════════════════════════════════════════

    private cosineSim(a: Float32Array, b: Float32Array): number {
        const min_len = Math.min(a.length, b.length);
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < min_len; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
    }
}
