import fs from 'fs';
import path from 'path';
import { GGUFExtractor, type GGUFParseResult, type ExtractedTensor, type LayerStats } from './GGUFExtractor.js';

/**
 * BIGROCK_v1 — Neural Extract (Deep Knowledge Extraction)
 * ─────────────────────────────────────────────────────────────────────────
 * TRUE ABSORPTION.
 *
 * This is NOT a wrapper around an LLM. This IS Bigrock's own extracted
 * neural knowledge, ripped directly from the GGUF weight tensors.
 *
 * What gets extracted:
 *   1. MODEL ARCHITECTURE — Every hyperparameter (layers, dims, heads, vocab)
 *   2. TOKEN EMBEDDINGS  — The full vocabulary->vector mapping (32K+ vectors)
 *   3. LAYER FINGERPRINTS — Statistical DNA of each transformer layer
 *   4. OUTPUT PROJECTION  — The final decode matrix
 *   5. VOCABULARY         — Every token the model knows
 *
 * With this data, Bigrock can:
 *   - Encode any text into the model's vector space (using extracted embeddings)
 *   - Compute semantic similarity between ANY two texts
 *   - Build its own knowledge index over the embedding space
 *   - Perform native vector search without loading the GGUF
 */

export interface NeuralFingerprint {
    source_model: string;
    source_file: string;
    source_size_bytes: number;
    architecture: string;
    vocab_size: number;
    embedding_dim: number;
    n_layers: number;
    n_heads: number;
    context_length: number;
    total_parameters: number;
    quantization_type: string;
    extracted_at: number;
    extraction_time_ms: number;
}

export interface EmbeddingIndex {
    /** Vocabulary tokens (string[]) */
    tokens: string[];
    /** Embedding vectors: flat Float32Array of [vocab_size × embedding_dim] */
    vectors: Float32Array;
    /** embedding dimension */
    dim: number;
    /** Pre-computed L2 norms for each token vector */
    norms: Float32Array;
}

export interface LayerDNA {
    layer_index: number;
    attn_q: LayerStats | null;
    attn_k: LayerStats | null;
    attn_v: LayerStats | null;
    attn_output: LayerStats | null;
    ffn_gate: LayerStats | null;
    ffn_up: LayerStats | null;
    ffn_down: LayerStats | null;
    attn_norm: LayerStats | null;
    ffn_norm: LayerStats | null;
}

export interface NeuralExtractData {
    fingerprint: NeuralFingerprint;
    embedding_index: EmbeddingIndex | null;
    layer_dna: LayerDNA[];
    output_weights: Float32Array | null;
    metadata: Record<string, any>;
}

export class NeuralExtract {
    private data: NeuralExtractData | null = null;
    private cache_path: string;

    constructor(models_dir: string) {
        this.cache_path = path.join(models_dir, '.neural_extract.bin');
    }

    /**
     * DEEP EXTRACT: Read the GGUF binary and rip out the neural knowledge.
     * This is the true "eating" — Bigrock digests the model's brain.
     */
    public async extractFromGGUF(filepath: string): Promise<NeuralExtractData> {
        const start = Date.now();
        const extractor = new GGUFExtractor(filepath);
        const filename = path.basename(filepath);
        const file_size = fs.statSync(filepath).size;

        // ═══ PHASE 1: Parse structure ═══
        console.log(`\n[NeuralExtract]: ═══ PHASE 1: PARSING GGUF STRUCTURE ═══`);
        const parsed = extractor.parseStructure();

        console.log(`[NeuralExtract]: Architecture: ${parsed.architecture}`);
        console.log(`[NeuralExtract]: Vocab size:   ${parsed.vocab_size}`);
        console.log(`[NeuralExtract]: Embedding dim: ${parsed.embedding_dim}`);
        console.log(`[NeuralExtract]: Layers:       ${parsed.n_layers}`);
        console.log(`[NeuralExtract]: Heads:        ${parsed.n_heads}`);
        console.log(`[NeuralExtract]: Context:      ${parsed.context_length}`);
        console.log(`[NeuralExtract]: Tensors:      ${parsed.n_tensors}`);

        // Print all tensor names for diagnostics
        console.log(`\n[NeuralExtract]: ═══ TENSOR MAP (${parsed.tensors.length} tensors) ═══`);
        for (const t of parsed.tensors.slice(0, 20)) {
            console.log(`  ${t.name.padEnd(45)} [${t.shape.join('×')}] ${t.type_name} (${(t.size_bytes / 1e6).toFixed(1)} MB)`);
        }
        if (parsed.tensors.length > 20) {
            console.log(`  ... and ${parsed.tensors.length - 20} more tensors`);
        }

        // Count total parameters
        const total_params = parsed.tensors.reduce((sum, t) => sum + t.total_elements, 0);

        // ═══ PHASE 2: Extract token embeddings ═══
        console.log(`\n[NeuralExtract]: ═══ PHASE 2: EXTRACTING TOKEN EMBEDDINGS ═══`);
        let embedding_index: EmbeddingIndex | null = null;

        // Find the embedding tensor (different naming conventions)
        const emb_names = ['token_embd.weight', 'tok_embeddings.weight', 'model.embed_tokens.weight', 'wte.weight'];
        let emb_tensor_name = '';
        for (const name of emb_names) {
            if (parsed.tensors.find(t => t.name === name)) {
                emb_tensor_name = name;
                break;
            }
        }

        if (emb_tensor_name) {
            console.log(`[NeuralExtract]: Found embedding tensor: "${emb_tensor_name}"`);
            const emb_info = parsed.tensors.find(t => t.name === emb_tensor_name)!;
            const emb_elements = emb_info.total_elements;
            const emb_mb = (emb_elements * 4) / 1e6; // float32 size

            // Only extract if it fits in memory (< 500MB float32)
            if (emb_mb < 500) {
                console.log(`[NeuralExtract]: Dequantizing ${emb_elements.toLocaleString()} embedding values (${emb_mb.toFixed(0)} MB float32)...`);
                const emb_data = extractor.extractTensor(parsed, emb_tensor_name);

                if (emb_data) {
                    // Extract vocabulary tokens from metadata
                    const arch = parsed.architecture;
                    const tokens: string[] = parsed.metadata['tokenizer.ggml.tokens'] || [];

                    // Compute L2 norms for each embedding vector
                    const dim = parsed.embedding_dim;
                    const vocab = tokens.length || Math.floor(emb_data.data.length / dim);
                    const norms = new Float32Array(vocab);

                    for (let i = 0; i < vocab; i++) {
                        let sq_sum = 0;
                        const base = i * dim;
                        for (let j = 0; j < dim && (base + j) < emb_data.data.length; j++) {
                            sq_sum += emb_data.data[base + j] * emb_data.data[base + j];
                        }
                        norms[i] = Math.sqrt(sq_sum);
                    }

                    embedding_index = {
                        tokens,
                        vectors: emb_data.data,
                        dim,
                        norms,
                    };

                    console.log(`[NeuralExtract]: ✅ Extracted ${vocab.toLocaleString()} token embeddings (${dim}D vectors)`);
                    console.log(`[NeuralExtract]: ✅ Vocabulary sample: [${tokens.slice(0, 10).map(t => `"${t}"`).join(', ')}...]`);
                }
            } else {
                console.log(`[NeuralExtract]: ⚠ Embedding too large (${emb_mb.toFixed(0)} MB), extracting partial...`);
                const partial = extractor.extractTensor(parsed, emb_tensor_name, parsed.embedding_dim * 10000);
                if (partial) {
                    const tokens = (parsed.metadata['tokenizer.ggml.tokens'] || []).slice(0, 10000);
                    const dim = parsed.embedding_dim;
                    const norms = new Float32Array(10000);
                    for (let i = 0; i < 10000; i++) {
                        let sq_sum = 0;
                        for (let j = 0; j < dim; j++) sq_sum += partial.data[i * dim + j] ** 2;
                        norms[i] = Math.sqrt(sq_sum);
                    }
                    embedding_index = { tokens, vectors: partial.data, dim, norms };
                    console.log(`[NeuralExtract]: ✅ Extracted 10,000 token embeddings (partial)`);
                }
            }
        } else {
            console.log(`[NeuralExtract]: ⚠ Embedding tensor not found. Tensor names available:`);
            for (const t of parsed.tensors.slice(0, 10)) {
                console.log(`    ${t.name}`);
            }
        }

        // ═══ PHASE 3: Extract layer DNA (statistical fingerprints) ═══
        console.log(`\n[NeuralExtract]: ═══ PHASE 3: EXTRACTING LAYER DNA ═══`);
        const layer_dna: LayerDNA[] = [];

        for (let layer = 0; layer < parsed.n_layers; layer++) {
            const prefix = `blk.${layer}`;
            const dna: LayerDNA = {
                layer_index: layer,
                attn_q: extractor.extractTensorStats(parsed, `${prefix}.attn_q.weight`),
                attn_k: extractor.extractTensorStats(parsed, `${prefix}.attn_k.weight`),
                attn_v: extractor.extractTensorStats(parsed, `${prefix}.attn_v.weight`),
                attn_output: extractor.extractTensorStats(parsed, `${prefix}.attn_output.weight`),
                ffn_gate: extractor.extractTensorStats(parsed, `${prefix}.ffn_gate.weight`),
                ffn_up: extractor.extractTensorStats(parsed, `${prefix}.ffn_up.weight`),
                ffn_down: extractor.extractTensorStats(parsed, `${prefix}.ffn_down.weight`),
                attn_norm: extractor.extractTensorStats(parsed, `${prefix}.attn_norm.weight`),
                ffn_norm: extractor.extractTensorStats(parsed, `${prefix}.ffn_norm.weight`),
            };
            layer_dna.push(dna);

            const stats_count = [dna.attn_q, dna.attn_k, dna.attn_v, dna.attn_output,
                dna.ffn_gate, dna.ffn_up, dna.ffn_down, dna.attn_norm, dna.ffn_norm]
                .filter(s => s !== null).length;

            if (layer % 8 === 0 || layer === parsed.n_layers - 1) {
                console.log(`  Layer ${String(layer).padStart(2)}: ${stats_count}/9 weight tensors fingerprinted`);
            }
        }

        // ═══ PHASE 4: Extract output projection ═══
        console.log(`\n[NeuralExtract]: ═══ PHASE 4: OUTPUT PROJECTION ═══`);
        let output_weights: Float32Array | null = null;
        const output_names = ['output.weight', 'lm_head.weight'];
        for (const name of output_names) {
            const info = parsed.tensors.find(t => t.name === name);
            if (info) {
                const out_mb = (info.total_elements * 4) / 1e6;
                if (out_mb < 500) {
                    console.log(`[NeuralExtract]: Extracting output projection "${name}" (${out_mb.toFixed(0)} MB)...`);
                    const out_tensor = extractor.extractTensor(parsed, name);
                    if (out_tensor) {
                        output_weights = out_tensor.data;
                        console.log(`[NeuralExtract]: ✅ Output projection: ${info.shape.join('×')} (${info.total_elements.toLocaleString()} weights)`);
                    }
                } else {
                    console.log(`[NeuralExtract]: ⚠ Output projection too large (${out_mb.toFixed(0)} MB), skipping full extraction`);
                }
                break;
            }
        }

        // ═══ BUILD FINAL EXTRACT ═══
        const extraction_time = Date.now() - start;
        const quant_type = parsed.tensors.length > 0 ? parsed.tensors[0].type_name : 'unknown';

        const fingerprint: NeuralFingerprint = {
            source_model: filename,
            source_file: filepath,
            source_size_bytes: file_size,
            architecture: parsed.architecture,
            vocab_size: parsed.vocab_size,
            embedding_dim: parsed.embedding_dim,
            n_layers: parsed.n_layers,
            n_heads: parsed.n_heads,
            context_length: parsed.context_length,
            total_parameters: total_params,
            quantization_type: quant_type,
            extracted_at: Date.now(),
            extraction_time_ms: extraction_time,
        };

        this.data = {
            fingerprint,
            embedding_index,
            layer_dna,
            output_weights,
            metadata: {
                general_name: parsed.metadata['general.name'],
                general_author: parsed.metadata['general.author'],
                general_description: parsed.metadata['general.description'],
                tokenizer_model: parsed.metadata['tokenizer.ggml.model'],
            },
        };

        // Print extraction summary
        console.log(`\n[NeuralExtract]: ═══════════════════════════════════════════════════`);
        console.log(`[NeuralExtract]: 🧠 NEURAL EXTRACTION COMPLETE`);
        console.log(`[NeuralExtract]:   Source:        ${filename}`);
        console.log(`[NeuralExtract]:   Architecture:  ${parsed.architecture}`);
        console.log(`[NeuralExtract]:   Parameters:    ${(total_params / 1e9).toFixed(2)}B`);
        console.log(`[NeuralExtract]:   Vocab:         ${parsed.vocab_size.toLocaleString()} tokens`);
        console.log(`[NeuralExtract]:   Embeddings:    ${embedding_index ? `${embedding_index.tokens.length.toLocaleString()} vectors (${embedding_index.dim}D)` : 'NOT EXTRACTED'}`);
        console.log(`[NeuralExtract]:   Layer DNA:     ${layer_dna.length} layers fingerprinted`);
        console.log(`[NeuralExtract]:   Output Proj:   ${output_weights ? `${output_weights.length.toLocaleString()} weights` : 'NOT EXTRACTED'}`);
        console.log(`[NeuralExtract]:   Time:          ${(extraction_time / 1000).toFixed(1)}s`);
        console.log(`[NeuralExtract]: ═══════════════════════════════════════════════════\n`);

        // Save fingerprint and layer DNA to disk (embeddings are too large for JSON)
        this.saveFingerprintCache();

        return this.data;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  NATIVE VECTOR OPERATIONS (using extracted embeddings)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Tokenize text using the extracted vocabulary.
     * Handles SentencePiece BPE format (▁ = word boundary prefix).
     */
    public tokenize(text: string): number[] {
        if (!this.data?.embedding_index) return [];
        const tokens = this.data.embedding_index.tokens;
        const result: number[] = [];

        // Build a quick lookup for real tokens (skip special/control tokens)
        if (!this._token_lookup) {
            this._token_lookup = new Map<string, number>();
            for (let i = 0; i < tokens.length; i++) {
                const t = tokens[i];
                if (!t || t.startsWith('<') || t.length === 0) continue;
                // Store both raw and lowercased versions
                this._token_lookup.set(t, i);
            }
        }

        // Split into words, then match each word against BPE vocabulary
        const words = text.split(/\s+/).filter(w => w.length > 0);

        for (let wi = 0; wi < words.length; wi++) {
            const word = words[wi];
            // SentencePiece uses ▁ prefix for word starts
            const sp_word = (wi === 0 ? '' : '▁') + word;

            // Try to find the whole word first
            let found = this._token_lookup.get(sp_word);
            if (found === undefined) found = this._token_lookup.get('▁' + word);
            if (found === undefined) found = this._token_lookup.get(word);
            if (found === undefined) found = this._token_lookup.get(word.toLowerCase());
            if (found === undefined) found = this._token_lookup.get('▁' + word.toLowerCase());

            if (found !== undefined) {
                result.push(found);
            } else {
                // Fall back to character-level matching
                for (const ch of word) {
                    const ch_id = this._token_lookup.get(ch) ?? this._token_lookup.get(ch.toLowerCase());
                    if (ch_id !== undefined) result.push(ch_id);
                }
            }
        }

        return result;
    }
    private _token_lookup: Map<string, number> | null = null;

    /**
     * Encode text to a vector using the extracted embedding matrix.
     * Returns the mean of all token embedding vectors (bag-of-tokens).
     */
    public encode(text: string): Float32Array | null {
        if (!this.data?.embedding_index) return null;
        const { vectors, dim, norms } = this.data.embedding_index;
        const token_ids = this.tokenize(text);
        if (token_ids.length === 0) return null;

        const result = new Float32Array(dim);
        let count = 0;

        for (const id of token_ids) {
            const base = id * dim;
            if (base + dim <= vectors.length && norms[id] > 0) {
                for (let j = 0; j < dim; j++) {
                    result[j] += vectors[base + j] / norms[id]; // normalize each vector
                }
                count++;
            }
        }

        if (count > 0) {
            for (let j = 0; j < dim; j++) result[j] /= count;
        }

        return result;
    }

    /**
     * Compute cosine similarity between two texts using extracted embeddings.
     */
    public similarity(text_a: string, text_b: string): number {
        const vec_a = this.encode(text_a);
        const vec_b = this.encode(text_b);
        if (!vec_a || !vec_b) return 0;
        return this.cosineSim(vec_a, vec_b);
    }

    /**
     * Find the K most similar tokens to a query text.
     */
    public findSimilarTokens(text: string, top_k: number = 10): { token: string; score: number }[] {
        if (!this.data?.embedding_index) return [];
        const query_vec = this.encode(text);
        if (!query_vec) return [];

        const { tokens, vectors, dim, norms } = this.data.embedding_index;
        const scores: { token: string; score: number }[] = [];

        for (let i = 0; i < tokens.length; i++) {
            const tok = tokens[i];
            // Skip special/control tokens
            if (!tok || tok.startsWith('<') || tok.length === 0 || norms[i] === 0 || isNaN(norms[i])) continue;
            const base = i * dim;
            if (base + dim > vectors.length) break;

            let dot = 0, norm_q = 0;
            for (let j = 0; j < dim; j++) {
                dot += query_vec[j] * vectors[base + j];
                norm_q += query_vec[j] * query_vec[j];
            }
            const sim = dot / (Math.sqrt(norm_q) * norms[i] + 1e-8);
            if (!isNaN(sim) && isFinite(sim)) {
                scores.push({ token: tok.replace('▁', ''), score: sim });
            }
        }

        return scores.sort((a, b) => b.score - a.score).slice(0, top_k);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  ACCESSORS & PERSISTENCE
    // ═══════════════════════════════════════════════════════════════════════════

    private cosineSim(a: Float32Array, b: Float32Array): number {
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
    }

    public getFingerprint(): NeuralFingerprint | null {
        return this.data?.fingerprint ?? null;
    }

    public getLayerDNA(): LayerDNA[] {
        return this.data?.layer_dna ?? [];
    }

    public hasEmbeddings(): boolean {
        return (this.data?.embedding_index?.vectors?.length ?? 0) > 0;
    }

    public getVocabSize(): number {
        return this.data?.embedding_index?.tokens?.length ?? 0;
    }

    public getEmbeddingDim(): number {
        return this.data?.embedding_index?.dim ?? 0;
    }

    public isExtracted(): boolean {
        return this.data !== null;
    }

    private saveFingerprintCache(): void {
        try {
            const cache = {
                fingerprint: this.data?.fingerprint,
                layer_dna_summary: this.data?.layer_dna.map(l => ({
                    layer: l.layer_index,
                    attn_q_norm: l.attn_q?.l2_norm ?? 0,
                    attn_k_norm: l.attn_k?.l2_norm ?? 0,
                    ffn_gate_norm: l.ffn_gate?.l2_norm ?? 0,
                })),
                metadata: this.data?.metadata,
            };
            const cache_json_path = this.cache_path.replace('.bin', '.json');
            fs.writeFileSync(cache_json_path, JSON.stringify(cache, null, 2), 'utf-8');
            console.log(`[NeuralExtract]: Fingerprint cached to ${path.basename(cache_json_path)}`);
        } catch (e: any) {
            console.log(`[NeuralExtract]: Cache save failed: ${e.message}`);
        }
    }
}
