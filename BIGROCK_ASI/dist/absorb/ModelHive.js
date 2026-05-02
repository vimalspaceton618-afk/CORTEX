import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { AbsorptionMemory } from './AbsorptionMemory.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_HIVE_CONFIG = {
    models_dir: path.resolve(__dirname, '../../models'),
    memory_reserve_bytes: 2 * 1024 * 1024 * 1024, // 2 GB
    max_hot_models: 2,
    auto_watch: true,
    hot_eviction_ms: 90_000, // 90 seconds
};
/** Domain weights for CPI calculation — cybersecurity/code/reasoning are highest value */
const DOMAIN_WEIGHTS = {
    reasoning: 1.5,
    mathematics: 1.4,
    code: 1.4,
    cybersecurity: 1.3,
    logic: 1.2,
    science: 1.1,
    language: 1.0,
    creative: 0.9,
};
export class ModelHive {
    config;
    memory;
    hive = new Map();
    watcher = null;
    eviction_timer = null;
    new_model_callback = null;
    constructor(config) {
        this.config = { ...DEFAULT_HIVE_CONFIG, ...config };
        this.memory = new AbsorptionMemory(this.config.models_dir);
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  INITIALISE — Load existing profiles into WARM tier
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Scan the models directory and discover all .gguf files.
     */
    scanModels() {
        const dir = this.config.models_dir;
        if (!fs.existsSync(dir)) {
            console.log(`[ModelHive]: Models directory not found: ${dir}`);
            return [];
        }
        return fs.readdirSync(dir)
            .filter(f => f.toLowerCase().endsWith('.gguf'))
            .map(f => {
            const filepath = path.join(dir, f);
            const stat = fs.statSync(filepath);
            return { filename: f, filepath, size_bytes: stat.size };
        });
    }
    /**
     * Boot the hive. Loads all cached profiles from disk into WARM tier.
     * Returns number of models registered.
     */
    initialise() {
        const all_profiles = this.memory.getAllProfiles();
        for (const profile of all_profiles) {
            if (fs.existsSync(profile.filepath)) {
                this.registerModel(profile, null, null);
            }
        }
        // Start eviction loop
        this.eviction_timer = setInterval(() => this.runEvictionCycle(), 15_000);
        // Start filesystem watcher
        if (this.config.auto_watch) {
            this.startWatcher();
        }
        console.log(`[ModelHive]: 🐝 Hive initialised — ${this.hive.size} model(s) in WARM tier`);
        return this.hive.size;
    }
    /**
     * Register a new absorption callback — called when auto-watch detects a new GGUF.
     */
    onNewModel(callback) {
        this.new_model_callback = callback;
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  REGISTER / UPDATE MODELS
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Register or update a model in the hive.
     * If session/llama_instance provided → HOT tier. Otherwise WARM.
     */
    registerModel(profile, session, llama_instance) {
        const tier = session ? 'hot' : 'warm';
        const cpi = this.computeCPI(profile);
        const diversity_bonus = this.computeDiversityBonus(profile);
        const entry = {
            filename: profile.filename,
            filepath: profile.filepath,
            size_bytes: profile.size_bytes,
            profile,
            tier,
            session,
            llama_instance,
            last_accessed: Date.now(),
            access_count: 0,
            cpi,
            diversity_bonus,
            absorbed_at: profile.absorbed_at,
            queries_served: profile.total_queries_served ?? 0,
        };
        this.hive.set(profile.filename, entry);
        return entry;
    }
    /**
     * Promote a WARM/COLD model to HOT tier (after loading).
     */
    promoteToHot(filename, session, llama_instance) {
        const entry = this.hive.get(filename);
        if (!entry)
            return;
        entry.tier = 'hot';
        entry.session = session;
        entry.llama_instance = llama_instance;
        entry.last_accessed = Date.now();
        console.log(`[ModelHive]: 🔥 ${filename} promoted to HOT tier`);
    }
    /**
     * Demote a HOT model to WARM (evict from memory, keep profile).
     */
    demoteToWarm(filename) {
        const entry = this.hive.get(filename);
        if (!entry || entry.tier !== 'hot')
            return;
        entry.tier = 'warm';
        entry.session = null;
        entry.llama_instance = null;
        console.log(`[ModelHive]: 🌡️  ${filename} demoted to WARM tier`);
    }
    /** Mark a model as accessed (update LRU) */
    touch(filename) {
        const entry = this.hive.get(filename);
        if (entry) {
            entry.last_accessed = Date.now();
            entry.access_count++;
            entry.queries_served++;
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  QUERY HIVE
    // ═══════════════════════════════════════════════════════════════════════════
    /** Get a model entry by filename */
    get(filename) {
        return this.hive.get(filename);
    }
    /** All model entries sorted by CPI (highest first) */
    getAllRanked() {
        return [...this.hive.values()].sort((a, b) => b.cpi - a.cpi);
    }
    /** Models with HOT tier only */
    getHotModels() {
        return [...this.hive.values()].filter(e => e.tier === 'hot');
    }
    /** Models with WARM or HOT tier (profile available) */
    getActiveModels() {
        return [...this.hive.values()].filter(e => e.tier !== 'cold');
    }
    /** Total count */
    size() { return this.hive.size; }
    /** True if any model is registered */
    hasModels() { return this.hive.size > 0; }
    /**
     * Find the domain champion — model with the highest score for the given domain.
     */
    getDomainChampion(domain) {
        let best = null;
        let best_score = -1;
        for (const entry of this.hive.values()) {
            const ds = entry.profile.domain_scores.find(d => d.domain === domain);
            if (ds && ds.score > best_score) {
                best_score = ds.score;
                best = entry;
            }
        }
        return best;
    }
    /**
     * Get top-N models for a domain, sorted by score.
     */
    getTopModelsForDomain(domain, n = 3) {
        return [...this.hive.values()]
            .map(entry => ({
            entry,
            score: entry.profile.domain_scores.find(d => d.domain === domain)?.score ?? 0,
        }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, n)
            .map(x => x.entry);
    }
    /**
     * Get all domain champions as a map: domain → { model, score }
     */
    getAllChampions() {
        return this.memory.getAllChampions();
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  COMPOSITE POWER INDEX
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * CPI = Σ(domain_score × domain_weight) × coverage_multiplier × efficiency_factor
     *
     * coverage_multiplier: bonus when model scores well across MANY domains
     * efficiency_factor:   smaller models that perform well get a bonus
     */
    computeCPI(profile) {
        let weighted_sum = 0;
        let weight_total = 0;
        let domains_above_threshold = 0;
        for (const ds of profile.domain_scores) {
            const weight = DOMAIN_WEIGHTS[ds.domain] ?? 1.0;
            weighted_sum += ds.score * weight;
            weight_total += weight;
            if (ds.score >= 0.5)
                domains_above_threshold++;
        }
        const base_score = weight_total > 0 ? weighted_sum / weight_total : 0;
        // Coverage multiplier: 1.0 at 0 domains, up to 1.5 at 8+ domains passing
        const coverage_multiplier = 1.0 + (Math.min(domains_above_threshold, 8) / 8) * 0.5;
        // Efficiency factor: smaller models that perform well get a bonus (max 1.2)
        const size_gb = profile.size_bytes / 1e9;
        const efficiency_factor = size_gb > 0
            ? Math.min(1.2, 1.0 + (base_score / Math.sqrt(size_gb)) * 0.1)
            : 1.0;
        return parseFloat((base_score * coverage_multiplier * efficiency_factor * 100).toFixed(2));
    }
    /**
     * Diversity bonus: models that excel in domains where other models are weak get extra value.
     */
    computeDiversityBonus(profile) {
        if (this.hive.size === 0)
            return 0;
        let bonus = 0;
        for (const ds of profile.domain_scores) {
            // Check if this model is the ONLY one scoring well in this domain
            const others_in_domain = [...this.hive.values()].filter(e => e.filename !== profile.filename &&
                (e.profile.domain_scores.find(d => d.domain === ds.domain)?.score ?? 0) >= 0.5);
            if (ds.score >= 0.5 && others_in_domain.length === 0) {
                bonus += 10; // 10 CPI bonus per unique domain championed
            }
        }
        return bonus;
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  COLLECTIVE INTELLIGENCE QUOTIENT
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * CIQ = Sum of all model CPIs × (1 + log10(model_count)) × fusion_multiplier
     *
     * Grows super-linearly with each new model absorbed.
     */
    getCollectiveIQ() {
        if (this.hive.size === 0)
            return 0;
        const total_cpi = [...this.hive.values()].reduce((s, e) => s + e.cpi + e.diversity_bonus, 0);
        const scale_factor = 1 + Math.log10(this.hive.size);
        // Fusion multiplier: if models cover complementary domains, bonus
        const all_domains = new Set();
        for (const entry of this.hive.values()) {
            for (const ds of entry.profile.domain_scores) {
                if (ds.score >= 0.5)
                    all_domains.add(ds.domain);
            }
        }
        const fusion_multiplier = 1.0 + (all_domains.size / 8) * 0.3;
        return parseFloat((total_cpi * scale_factor * fusion_multiplier).toFixed(1));
    }
    /**
     * Domain confidence heat map — for each domain, what's the best score we have?
     */
    getWisdomMap() {
        const map = {};
        for (const entry of this.hive.values()) {
            for (const ds of entry.profile.domain_scores) {
                const existing = map[ds.domain];
                if (!existing || ds.score > existing.score) {
                    map[ds.domain] = {
                        champion: entry.filename,
                        score: ds.score,
                        tier: entry.tier,
                    };
                }
            }
        }
        return map;
    }
    /**
     * Total combined power (sum of all model overall_power scores).
     */
    getTotalPower() {
        return [...this.hive.values()].reduce((s, e) => s + e.profile.overall_power, 0);
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  MEMORY & EVICTION
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Compute how much RAM is available for model loading.
     */
    getAvailableMemory() {
        return Math.max(0, os.freemem() - this.config.memory_reserve_bytes);
    }
    /**
     * Check if there's enough memory to load a model of the given size.
     * GGUF Q8_0 models typically use ~1.1× their file size in RAM.
     */
    canLoadModel(size_bytes) {
        const estimated_ram = size_bytes * 1.15; // 15% overhead
        const hot_count = this.getHotModels().length;
        return (this.getAvailableMemory() >= estimated_ram &&
            hot_count < this.config.max_hot_models);
    }
    /**
     * LRU eviction cycle — called every 15 seconds.
     * Demotes idle HOT models to WARM.
     */
    runEvictionCycle() {
        const now = Date.now();
        const hot_models = this.getHotModels()
            .sort((a, b) => a.last_accessed - b.last_accessed); // oldest first
        for (const entry of hot_models) {
            const idle_ms = now - entry.last_accessed;
            if (idle_ms >= this.config.hot_eviction_ms) {
                this.demoteToWarm(entry.filename);
            }
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  AUTO-WATCH — Filesystem watcher for new GGUF drops
    // ═══════════════════════════════════════════════════════════════════════════
    startWatcher() {
        const dir = this.config.models_dir;
        if (!fs.existsSync(dir)) {
            console.log(`[ModelHive]: ⚠ Models dir not found, watcher disabled: ${dir}`);
            return;
        }
        try {
            this.watcher = fs.watch(dir, async (eventType, filename) => {
                if (!filename || !filename.toLowerCase().endsWith('.gguf'))
                    return;
                if (eventType !== 'rename')
                    return; // 'rename' fires on new file creation
                const filepath = path.join(dir, filename);
                // Brief delay to ensure file is fully written
                await new Promise(r => setTimeout(r, 2000));
                if (!fs.existsSync(filepath))
                    return; // File was deleted, not created
                if (this.hive.has(filename))
                    return; // Already known
                console.log(`\n[ModelHive]: 🆕 NEW GGUF DETECTED: ${filename}`);
                console.log(`[ModelHive]: 🍽️  Auto-absorbing...`);
                if (this.new_model_callback) {
                    try {
                        await this.new_model_callback(filepath);
                    }
                    catch (e) {
                        console.error(`[ModelHive]: ❌ Auto-absorption failed: ${e.message}`);
                    }
                }
            });
            console.log(`[ModelHive]: 👁️  Watching ${dir} for new GGUF files...`);
        }
        catch (e) {
            console.log(`[ModelHive]: ⚠ Watcher failed to start: ${e.message}`);
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  STATUS REPORT
    // ═══════════════════════════════════════════════════════════════════════════
    getStatus() {
        const entries = [...this.hive.values()];
        const free_gb = os.freemem() / 1e9;
        const total_gb = os.totalmem() / 1e9;
        const used_gb = parseFloat((total_gb - free_gb).toFixed(2));
        const ceiling_gb = parseFloat(((total_gb - this.config.memory_reserve_bytes / 1e9)).toFixed(2));
        const domain_coverage = {};
        const wisdom = this.getWisdomMap();
        for (const [domain, info] of Object.entries(wisdom)) {
            domain_coverage[domain] = { champion: info.champion, score: info.score };
        }
        return {
            total_models: entries.length,
            hot_models: entries.filter(e => e.tier === 'hot').length,
            warm_models: entries.filter(e => e.tier === 'warm').length,
            cold_models: entries.filter(e => e.tier === 'cold').length,
            total_power: parseFloat(this.getTotalPower().toFixed(3)),
            collective_iq: this.getCollectiveIQ(),
            memory_used_gb: used_gb,
            memory_ceiling_gb: ceiling_gb,
            domain_coverage,
            cpi_ranking: entries
                .sort((a, b) => b.cpi - a.cpi)
                .map(e => ({ filename: e.filename, cpi: e.cpi, tier: e.tier })),
        };
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  PERSISTENCE
    // ═══════════════════════════════════════════════════════════════════════════
    /** Flush all profiles to AbsorptionMemory cache */
    flush() {
        for (const entry of this.hive.values()) {
            this.memory.storeProfile(entry.profile);
        }
    }
    /** Shutdown — evict all HOT models, save profiles */
    shutdown() {
        if (this.eviction_timer) {
            clearInterval(this.eviction_timer);
            this.eviction_timer = null;
        }
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        for (const entry of this.hive.values()) {
            if (entry.tier === 'hot') {
                entry.session = null;
                entry.llama_instance = null;
                entry.tier = 'warm';
            }
        }
        this.flush();
        console.log(`[ModelHive]: 🔒 Hive shut down. ${this.hive.size} model profiles saved.`);
    }
    /** Get AbsorptionMemory for direct access */
    getMemory() { return this.memory; }
}
