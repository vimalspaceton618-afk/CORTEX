import fs from 'fs';
import path from 'path';
export class AbsorptionMemory {
    cache_path;
    cache;
    constructor(models_dir) {
        this.cache_path = path.join(models_dir, '.absorption_cache.json');
        this.cache = this.loadCache();
    }
    /**
     * Load the absorption cache from disk, or create a fresh one.
     */
    loadCache() {
        try {
            if (fs.existsSync(this.cache_path)) {
                const raw = fs.readFileSync(this.cache_path, 'utf-8');
                const parsed = JSON.parse(raw);
                if (parsed.version && parsed.models) {
                    return parsed;
                }
            }
        }
        catch (e) {
            console.log(`[AbsorptionMemory]: Cache read failed (${e.message}), starting fresh.`);
        }
        return {
            version: 1,
            bigrock_version: 'v1.0-self-absorbing',
            last_updated: Date.now(),
            models: [],
        };
    }
    /**
     * Save the current cache state to disk.
     */
    save() {
        try {
            this.cache.last_updated = Date.now();
            fs.writeFileSync(this.cache_path, JSON.stringify(this.cache, null, 2), 'utf-8');
        }
        catch (e) {
            console.error(`[AbsorptionMemory]: Failed to save cache: ${e.message}`);
        }
    }
    /**
     * Check if a model has already been absorbed (and cache is still valid).
     * Returns the cached profile if valid, or null if re-probing is needed.
     */
    getCachedProfile(filename, size_bytes) {
        const entry = this.cache.models.find(m => m.filename === filename);
        if (!entry)
            return null;
        // Invalidate if file size changed (different quant/version)
        if (entry.size_bytes !== size_bytes) {
            console.log(`[AbsorptionMemory]: ${filename} size changed (${entry.size_bytes} → ${size_bytes}), re-probing needed.`);
            return null;
        }
        return entry;
    }
    /**
     * Store/update a model's absorption profile in the cache.
     */
    storeProfile(profile) {
        const idx = this.cache.models.findIndex(m => m.filename === profile.filename);
        if (idx >= 0) {
            this.cache.models[idx] = profile;
        }
        else {
            this.cache.models.push(profile);
        }
        this.save();
    }
    /**
     * Increment the query count for a model.
     */
    recordQuery(filename) {
        const entry = this.cache.models.find(m => m.filename === filename);
        if (entry) {
            entry.total_queries_served++;
            // Don't save on every query — save periodically
        }
    }
    /**
     * Flush query counts to disk (call periodically or on shutdown).
     */
    flush() {
        this.save();
    }
    /**
     * Get all cached profiles.
     */
    getAllProfiles() {
        return [...this.cache.models];
    }
    /**
     * Get the total power across all absorbed models.
     */
    getTotalPower() {
        return this.cache.models.reduce((sum, m) => sum + m.overall_power, 0);
    }
    /**
     * Get the domain champion — model with the highest score for a domain.
     */
    getDomainChampion(domain) {
        let best = null;
        let bestScore = -1;
        for (const model of this.cache.models) {
            const ds = model.domain_scores.find(d => d.domain === domain);
            if (ds && ds.score > bestScore) {
                bestScore = ds.score;
                best = model;
            }
        }
        return best;
    }
    /**
     * Get domain champions across all domains.
     */
    getAllChampions() {
        const champions = new Map();
        for (const model of this.cache.models) {
            for (const ds of model.domain_scores) {
                const current = champions.get(ds.domain);
                if (!current || ds.score > current.score) {
                    champions.set(ds.domain, { model: model.filename, score: ds.score });
                }
            }
        }
        return champions;
    }
    /** Model count */
    getModelCount() { return this.cache.models.length; }
}
