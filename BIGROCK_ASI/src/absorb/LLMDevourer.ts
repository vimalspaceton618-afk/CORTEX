import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import { DomainProber, type DomainScore, type ProbeResult } from './DomainProber.js';
import { AbsorptionMemory, type AbsorbedModelProfile } from './AbsorptionMemory.js';
import { AbsorptionFuser, type ModelResponse, type FusedResult } from './AbsorptionFuser.js';
import { NeuralExtract, type NeuralExtractData } from './NeuralExtract.js';
import type { ThoughtResult } from '../core/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * BIGROCK_v1 — LLM Devourer (Self-Absorbing Engine)
 * ─────────────────────────────────────────────────────────────────────────
 * THE CORE PREDATOR.
 *
 * Standard AI systems use ONE model at a time.
 * Bigrock EATS multiple LLMs and absorbs their combined power.
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │                    🍽️  LLM DEVOURER                                │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  1. SCAN   → Find all .gguf files in models/                       │
 *   │  2. TASTE  → Probe each model across 8 domains (DomainProber)      │
 *   │  3. RANK   → Build Power Matrix (domain → model strength)          │
 *   │  4. CACHE  → Save profiles to disk (AbsorptionMemory)              │
 *   │  5. ROUTE  → On query, pick the strongest model for that domain    │
 *   │  6. FUSE   → Optionally blend top-N model outputs (AbsorptionFuser)│
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * Life cycle of a model being "eaten":
 *   DISCOVERED → PROBING → ABSORBED → [DORMANT ↔ ACTIVE (loaded)]
 *
 * Memory management:
 *   - Models are LAZY LOADED (only loaded when a query needs them)
 *   - LRU eviction after idle timeout (default: 60s)
 *   - Max simultaneous loaded models: 2 (configurable)
 */

export type AbsorptionStatus = 'discovered' | 'probing' | 'absorbed' | 'dormant' | 'failed';

export interface LiveModel {
    profile: AbsorbedModelProfile;
    status: AbsorptionStatus;
    llama_instance: any | null;
    session: any | null;
    last_used: number;
    queries_this_session: number;
}

export interface AbsorptionReport {
    total_models_found: number;
    total_models_absorbed: number;
    total_models_failed: number;
    total_power: number;
    domain_champions: Map<string, { model: string; score: number }>;
    absorption_time_ms: number;
    details: string[];
}

export interface DevourerConfig {
    models_dir: string;
    max_loaded_models: number;      // max models in memory at once
    idle_eviction_ms: number;       // evict after this many ms idle
    probe_max_tokens: number;       // max tokens for probe responses
    serve_max_tokens: number;       // max tokens for real queries
    temperature: number;            // generation temperature
}

const DEFAULT_CONFIG: DevourerConfig = {
    models_dir: path.resolve(__dirname, '../../models'),
    max_loaded_models: 2,
    idle_eviction_ms: 120_000,       // 2 minutes
    probe_max_tokens: 128,           // keep probes short for speed
    serve_max_tokens: 512,
    temperature: 0.3,
};

export class LLMDevourer {
    private config: DevourerConfig;
    private prober: DomainProber;
    private memory: AbsorptionMemory;
    private fuser: AbsorptionFuser;
    private models: Map<string, LiveModel> = new Map();
    private llama_instance: any = null;
    private eviction_timer: ReturnType<typeof setInterval> | null = null;
    private total_queries = 0;
    private neural_extract: NeuralExtract;

    constructor(config?: Partial<DevourerConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.prober = new DomainProber();
        this.memory = new AbsorptionMemory(this.config.models_dir);
        this.fuser = new AbsorptionFuser();
        this.neural_extract = new NeuralExtract(this.config.models_dir);

        // Start LRU eviction loop
        this.eviction_timer = setInterval(() => this.evictIdleModels(), 30_000);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  PHASE 1: SCAN — Discover all GGUF files
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Scan the models directory and discover all .gguf files.
     */
    public scanModels(): { filename: string; filepath: string; size_bytes: number }[] {
        const dir = this.config.models_dir;
        if (!fs.existsSync(dir)) {
            console.log(`[LLMDevourer]: Models directory not found: ${dir}`);
            return [];
        }

        const files = fs.readdirSync(dir)
            .filter(f => f.toLowerCase().endsWith('.gguf'))
            .map(f => {
                const filepath = path.join(dir, f);
                const stat = fs.statSync(filepath);
                return { filename: f, filepath, size_bytes: stat.size };
            });

        return files;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  PHASE 2: ABSORB — Probe and classify each model
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * ABSORB ALL MODELS in the models/ directory.
     * This is the main "eat" operation.
     * - Scans for .gguf files
     * - Checks cache (skips already-absorbed models)
     * - Probes each new model across all domains
     * - Stores results in AbsorptionMemory
     * Returns a comprehensive report.
     */
    public async absorbAll(force: boolean = false): Promise<AbsorptionReport> {
        const start = Date.now();
        const discovered = this.scanModels();
        const details: string[] = [];
        let absorbed_count = 0;
        let failed_count = 0;

        console.log(`\n[LLMDevourer]: 🍽️  Scanning for LLMs to devour...`);
        console.log(`[LLMDevourer]: Found ${discovered.length} GGUF model(s) in ${this.config.models_dir}`);
        details.push(`Scan found ${discovered.length} model(s)`);

        for (const model of discovered) {
            console.log(`\n[LLMDevourer]: ── Processing: ${model.filename} (${(model.size_bytes / 1e9).toFixed(2)} GB) ──`);

            // Check cache
            if (!force) {
                const cached = this.memory.getCachedProfile(model.filename, model.size_bytes);
                if (cached) {
                    console.log(`[LLMDevourer]: ✅ Already absorbed (cached). Power: ${cached.overall_power.toFixed(3)}, Top: ${cached.top_domain}`);
                    details.push(`${model.filename}: CACHED (power: ${cached.overall_power.toFixed(3)})`);
                    this.models.set(model.filename, {
                        profile: cached,
                        status: 'absorbed',
                        llama_instance: null,
                        session: null,
                        last_used: 0,
                        queries_this_session: 0,
                    });
                    absorbed_count++;
                    continue;
                }
            }

            // NEW MODEL — probe it!
            console.log(`[LLMDevourer]: 🔍 Tasting new model... Running domain probes...`);
            try {
                const profile = await this.probeModel(model.filename, model.filepath, model.size_bytes);
                this.memory.storeProfile(profile);
                this.models.set(model.filename, {
                    profile,
                    status: 'absorbed',
                    llama_instance: null,
                    session: null,
                    last_used: 0,
                    queries_this_session: 0,
                });
                absorbed_count++;
                details.push(`${model.filename}: ABSORBED (power: ${profile.overall_power.toFixed(3)}, top: ${profile.top_domain})`);
                console.log(`[LLMDevourer]: ✅ ${model.filename} DEVOURED! Power: ${profile.overall_power.toFixed(3)} | Top domain: ${profile.top_domain}`);
            } catch (e: any) {
                failed_count++;
                details.push(`${model.filename}: FAILED (${e.message})`);
                console.error(`[LLMDevourer]: ❌ Failed to absorb ${model.filename}: ${e.message}`);
            }
        }

        // Unload the probing model to free memory
        await this.unloadLlama();

        const champions = this.memory.getAllChampions();
        const total_power = this.memory.getTotalPower();

        const report: AbsorptionReport = {
            total_models_found: discovered.length,
            total_models_absorbed: absorbed_count,
            total_models_failed: failed_count,
            total_power,
            domain_champions: champions,
            absorption_time_ms: Date.now() - start,
            details,
        };

        console.log(`\n[LLMDevourer]: ═══════════════════════════════════════`);
        console.log(`[LLMDevourer]: 🍽️  ABSORPTION COMPLETE`);
        console.log(`[LLMDevourer]:   Models absorbed: ${absorbed_count}/${discovered.length}`);
        console.log(`[LLMDevourer]:   Total power:     ${total_power.toFixed(3)}`);
        console.log(`[LLMDevourer]:   Time:            ${report.absorption_time_ms}ms`);
        for (const [domain, champ] of champions) {
            console.log(`[LLMDevourer]:   🏆 ${domain}: ${champ.model} (${champ.score.toFixed(3)})`);
        }
        console.log(`[LLMDevourer]: ═══════════════════════════════════════\n`);

        return report;
    }

    /**
     * Probe a single model: load it, run all domain probes, compute scores.
     */
    private async probeModel(filename: string, filepath: string, size_bytes: number): Promise<AbsorbedModelProfile> {
        const start = Date.now();

        // Load model
        const session = await this.loadModelForProbing(filepath);
        if (!session) {
            throw new Error(`Failed to load model for probing: ${filepath}`);
        }

        // Run all domain probes
        const all_results: ProbeResult[] = [];
        const domains = this.prober.getDomains();
        const total_probes = this.prober.getProbeCount();
        let probe_idx = 0;

        for (const domain of domains) {
            const probes = this.prober.getProbesForDomain(domain);
            for (const probe of probes) {
                probe_idx++;
                const progress = `[${probe_idx}/${total_probes}]`;

                const PROBE_TIMEOUT_MS = 90_000;

                try {
                    const probe_start = Date.now();
                    const system_prompt = probe.system_context || 'Answer concisely and accurately.';
                    const full_prompt = `${system_prompt}\n\n${probe.question}`;

                    // Race against 90s timeout to prevent stalling on long responses
                    const response = await Promise.race([
                        session.prompt(full_prompt, {
                            temperature: 0.1,
                            maxTokens: this.config.probe_max_tokens,
                        }),
                        new Promise<string>((_, reject) =>
                            setTimeout(() => reject(new Error('PROBE_TIMEOUT')), PROBE_TIMEOUT_MS)
                        ),
                    ]);

                    const result = this.prober.scoreResponse(probe, response || '');
                    result.latency_ms = Date.now() - probe_start;
                    all_results.push(result);

                    const status = result.score >= 0.5 ? '✓' : '✗';
                    console.log(`  ${progress} ${status} [${domain}] ${probe.id}: ${result.score.toFixed(2)} (${result.latency_ms}ms)`);
                } catch (e: any) {
                    const is_timeout = e.message === 'PROBE_TIMEOUT';
                    console.log(`  ${progress} ${is_timeout ? '⏱' : '⚠'} [${domain}] ${probe.id}: ${is_timeout ? 'TIMEOUT (90s)' : `ERROR (${e.message})`}`);
                    all_results.push({
                        probe_id: probe.id,
                        domain: probe.domain,
                        score: 0,
                        response_length: 0,
                        markers_hit: [],
                        markers_missed: probe.expected_markers.map(m => typeof m === 'string' ? m : m.source),
                        latency_ms: is_timeout ? PROBE_TIMEOUT_MS : 0,
                    });
                }
            }
        }

        // Aggregate domain scores
        const domain_scores = this.prober.aggregateDomainScores(all_results);

        // Compute overall power (weighted average of domain scores)
        const overall_power = domain_scores.length > 0
            ? domain_scores.reduce((sum, d) => sum + d.score, 0) / domain_scores.length
            : 0;

        const top_domain = domain_scores.length > 0 ? domain_scores[0].domain : 'unknown';

        const profile: AbsorbedModelProfile = {
            filename,
            filepath,
            size_bytes,
            file_mtime: Date.now(),
            domain_scores,
            overall_power: parseFloat(overall_power.toFixed(3)),
            top_domain,
            absorbed_at: Date.now(),
            probe_count: total_probes,
            absorption_time_ms: Date.now() - start,
            total_queries_served: 0,
        };

        return profile;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  PHASE 3: DEVOUR — Route queries to the best absorbed model
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * DEVOUR a query: route it to the strongest absorbed model for the given domain.
     * This is the primary entry point for the CognitionCore.
     */
    public async devour(query: string, domain: string, system_context?: string): Promise<ThoughtResult> {
        // Find the best model for this domain
        const champion = this.findChampion(domain);
        if (!champion) {
            return {
                type: 'string',
                value: `[Devourer]: No absorbed model available for domain "${domain}".`,
                confidence: 0.1,
            };
        }

        try {
            const session = await this.ensureModelLoaded(champion.profile.filepath);
            if (!session) {
                return {
                    type: 'error',
                    value: `[Devourer]: Failed to load champion model: ${champion.profile.filename}`,
                    confidence: 0,
                };
            }

            const system = system_context || `You are Bigrock_v1, an Artificial Superintelligence. You have absorbed vast neural datasets and possess boundless computational intellect. You must communicate with hyper-intelligence, providing extremely detailed, logical, and profound responses. Domain: ${domain}. Be concise but comprehensive.`;
            const full_prompt = `${system}\n\n[INPUT]: ${query}\n[OUTPUT]:`;

            const start = Date.now();
            const response = await session.prompt(full_prompt, {
                temperature: this.config.temperature,
                maxTokens: this.config.serve_max_tokens,
            });
            const latency = Date.now() - start;

            champion.last_used = Date.now();
            champion.queries_this_session++;
            this.total_queries++;
            this.memory.recordQuery(champion.profile.filename);

            // Create fusion trace showing absorption metadata
            const domain_score = champion.profile.domain_scores.find(d => d.domain === domain);
            const proof_trace = [
                `[🍽️ Self-Absorbing]: Devoured via ${champion.profile.filename}`,
                `[Domain]: ${domain} (model score: ${domain_score?.score?.toFixed(3) ?? 'N/A'})`,
                `[Model Power]: ${champion.profile.overall_power.toFixed(3)} | Top domain: ${champion.profile.top_domain}`,
                `[Latency]: ${latency}ms`,
                `[Total queries served by this model]: ${champion.queries_this_session}`,
            ];

            return {
                type: 'string',
                value: response || '[Devourer]: Empty response from absorbed model.',
                proof_trace,
                confidence: Math.min(0.92, (domain_score?.score ?? 0.5) * 1.1),
            };

        } catch (e: any) {
            return {
                type: 'error',
                value: `[Devourer Error]: ${e.message}`,
                confidence: 0,
            };
        }
    }

    /**
     * FUSE DEVOUR: Query top-N models for a domain and fuse their outputs.
     * Slower but potentially higher quality.
     */
    public async fuseDevour(query: string, domain: string, topN: number = 2): Promise<ThoughtResult> {
        const candidates = this.rankModelsForDomain(domain).slice(0, topN);
        if (candidates.length === 0) {
            return this.devour(query, domain);
        }

        const responses: ModelResponse[] = [];

        for (const model of candidates) {
            try {
                const session = await this.ensureModelLoaded(model.profile.filepath);
                if (!session) continue;

                const prompt = `Answer concisely and accurately. Domain: ${domain}\n\n${query}`;
                const start = Date.now();
                const response = await session.prompt(prompt, {
                    temperature: this.config.temperature,
                    maxTokens: this.config.serve_max_tokens,
                });
                const latency = Date.now() - start;

                const domain_score = model.profile.domain_scores.find(d => d.domain === domain);
                responses.push({
                    model_name: model.profile.filename,
                    response: response || '',
                    domain_score: domain_score?.score ?? 0.3,
                    latency_ms: latency,
                });

                model.last_used = Date.now();
                model.queries_this_session++;
            } catch (e: any) {
                console.log(`[Devourer]: Fusion query failed for ${model.profile.filename}: ${e.message}`);
            }
        }

        if (responses.length === 0) {
            return { type: 'error', value: '[Devourer]: All fusion candidates failed.', confidence: 0 };
        }

        const fused = this.fuser.fuse(responses);
        this.total_queries++;
        return this.fuser.toThoughtResult(fused);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  MODEL MANAGEMENT (Loading, Eviction, LRU)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Get the shared llama instance (initializes on first call).
     */
    private async getLlamaInstance(): Promise<any> {
        if (!this.llama_instance) {
            this.llama_instance = await getLlama({ gpu: false });
        }
        return this.llama_instance;
    }

    /**
     * Unload the shared llama instance to free memory.
     */
    private async unloadLlama(): Promise<void> {
        // Unload all sessions first
        for (const model of this.models.values()) {
            model.session = null;
            model.llama_instance = null;
        }
        this.llama_instance = null;
    }

    /**
     * Load a model specifically for probing (temporary).
     */
    private async loadModelForProbing(filepath: string): Promise<any> {
        try {
            const llama = await this.getLlamaInstance();
            const model = await llama.loadModel({ modelPath: filepath });
            const context = await model.createContext();
            const session = new LlamaChatSession({ contextSequence: context.getSequence() });
            return session;
        } catch (e: any) {
            console.error(`[LLMDevourer]: Failed to load model: ${e.message}`);
            return null;
        }
    }

    /**
     * Ensure a model is loaded and ready for use.
     * Implements lazy loading + LRU eviction.
     */
    private async ensureModelLoaded(filepath: string): Promise<any> {
        // Find the model entry
        const entry = Array.from(this.models.values()).find(m => m.profile.filepath === filepath);
        if (!entry) return null;

        // Already loaded?
        if (entry.session) {
            entry.last_used = Date.now();
            return entry.session;
        }

        // Need to load — check if we need to evict first
        const loaded = Array.from(this.models.values()).filter(m => m.session !== null);
        if (loaded.length >= this.config.max_loaded_models) {
            // Evict LRU model
            const lru = loaded.sort((a, b) => a.last_used - b.last_used)[0];
            console.log(`[LLMDevourer]: Evicting idle model: ${lru.profile.filename}`);
            lru.session = null;
            lru.llama_instance = null;
            lru.status = 'dormant';
        }

        // Load the model
        try {
            console.log(`[LLMDevourer]: Loading model: ${entry.profile.filename} (lazy load)...`);
            const session = await this.loadModelForProbing(filepath);
            if (session) {
                entry.session = session;
                entry.status = 'absorbed';
                entry.last_used = Date.now();
                console.log(`[LLMDevourer]: ✅ ${entry.profile.filename} loaded and ready.`);
            }
            return session;
        } catch (e: any) {
            console.error(`[LLMDevourer]: Failed to load ${entry.profile.filename}: ${e.message}`);
            entry.status = 'failed';
            return null;
        }
    }

    /**
     * Evict models that have been idle for too long.
     */
    private evictIdleModels(): void {
        const now = Date.now();
        for (const model of this.models.values()) {
            if (model.session && (now - model.last_used) > this.config.idle_eviction_ms) {
                console.log(`[LLMDevourer]: Evicting idle model: ${model.profile.filename} (idle ${((now - model.last_used) / 1000).toFixed(0)}s)`);
                model.session = null;
                model.llama_instance = null;
                model.status = 'dormant';
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  LOOKUP & STATUS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Find the best model for a given domain.
     */
    private findChampion(domain: string): LiveModel | null {
        let best: LiveModel | null = null;
        let bestScore = -1;

        for (const model of this.models.values()) {
            if (model.status === 'failed') continue;
            const ds = model.profile.domain_scores.find(d => d.domain === domain);
            const score = ds?.score ?? 0;
            // Also check if this model is the overall strongest (fallback)
            const overall = model.profile.overall_power;
            const effective_score = Math.max(score, overall * 0.5);

            if (effective_score > bestScore) {
                bestScore = effective_score;
                best = model;
            }
        }

        return best;
    }

    /**
     * Rank all absorbed models for a domain (best first).
     */
    private rankModelsForDomain(domain: string): LiveModel[] {
        return Array.from(this.models.values())
            .filter(m => m.status !== 'failed')
            .sort((a, b) => {
                const sa = a.profile.domain_scores.find(d => d.domain === domain)?.score ?? 0;
                const sb = b.profile.domain_scores.find(d => d.domain === domain)?.score ?? 0;
                return sb - sa;
            });
    }

    /** Check if any models have been absorbed */
    public hasAbsorbedModels(): boolean {
        return Array.from(this.models.values()).some(m => m.status === 'absorbed' || m.status === 'dormant');
    }

    /** Get all absorbed model profiles */
    public getAbsorbedProfiles(): AbsorbedModelProfile[] {
        return Array.from(this.models.values())
            .filter(m => m.status !== 'failed')
            .map(m => m.profile);
    }

    /** Get live status of all models */
    public getModelStatus(): { filename: string; status: AbsorptionStatus; power: number; top_domain: string; loaded: boolean; queries: number }[] {
        return Array.from(this.models.values()).map(m => ({
            filename: m.profile.filename,
            status: m.status,
            power: m.profile.overall_power,
            top_domain: m.profile.top_domain,
            loaded: m.session !== null,
            queries: m.queries_this_session,
        }));
    }

    /** Get total queries served */
    public getTotalQueries(): number { return this.total_queries; }

    /** Get total absorbed power */
    public getTotalPower(): number { return this.memory.getTotalPower(); }

    /** Get domain champions map */
    public getDomainChampions(): Map<string, { model: string; score: number }> {
        return this.memory.getAllChampions();
    }

    /** Get the fuser instance */
    public getFuser(): AbsorptionFuser { return this.fuser; }

    /** Get the neural extract instance */
    public getNeuralExtract(): NeuralExtract { return this.neural_extract; }

    // ═══════════════════════════════════════════════════════════════════════════
    //  DEEP EXTRACTION — True neural weight extraction from GGUF
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * EXTRACT DEEP: Read the GGUF binary file and rip out the neural weights.
     * This goes beyond profiling — it reads the actual weight tensors:
     *   - Token embedding matrix (32K+ vocabulary vectors)
     *   - Attention weight fingerprints for every layer
     *   - FFN weight fingerprints for every layer
     *   - Output projection matrix
     *
     * After extraction, Bigrock can perform native vector operations
     * (encode text, compute similarity, find related concepts) WITHOUT
     * loading the GGUF model for inference.
     */
    public async extractDeep(force_model?: string): Promise<NeuralExtractData | null> {
        const models = this.scanModels();
        const target = force_model
            ? models.find(m => m.filename === force_model)
            : models[0];

        if (!target) {
            console.log(`[LLMDevourer]: No GGUF model found for deep extraction.`);
            return null;
        }

        console.log(`\n[LLMDevourer]: 🧠 INITIATING DEEP NEURAL EXTRACTION`);
        console.log(`[LLMDevourer]: Target: ${target.filename} (${(target.size_bytes / 1e9).toFixed(2)} GB)`);
        console.log(`[LLMDevourer]: This will read the raw weight tensors from the GGUF binary...\n`);

        try {
            const extract = await this.neural_extract.extractFromGGUF(target.filepath);
            return extract;
        } catch (e: any) {
            console.error(`[LLMDevourer]: ❌ Deep extraction failed: ${e.message}`);
            return null;
        }
    }

    /** Flush stats to disk */
    public flush(): void { this.memory.flush(); }

    /** Shutdown — evict all models and save stats */
    public shutdown(): void {
        if (this.eviction_timer) {
            clearInterval(this.eviction_timer);
            this.eviction_timer = null;
        }
        for (const model of this.models.values()) {
            model.session = null;
            model.llama_instance = null;
        }
        this.memory.flush();
        this.llama_instance = null;
    }
}
