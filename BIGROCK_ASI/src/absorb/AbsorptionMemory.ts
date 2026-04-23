import fs from 'fs';
import path from 'path';
import type { DomainScore } from './DomainProber.js';

/**
 * BIGROCK_v1 — Absorption Memory (Self-Absorbing Subsystem)
 * ─────────────────────────────────────────────────────────────────────────
 * Persistent cache for absorption results. When Bigrock "eats" an LLM and
 * maps its domain strengths, those results are saved to disk so they
 * survive restarts. No need to re-probe a model we've already digested.
 *
 * Cache file: models/.absorption_cache.json
 *
 * Re-probing triggers:
 *   1. Model file size changed (different quantization downloaded)
 *   2. Cache entry missing for this filename
 *   3. User forces re-absorption via /absorb --force
 */

export interface AbsorbedModelProfile {
    filename: string;
    filepath: string;
    size_bytes: number;
    file_mtime: number;
    domain_scores: DomainScore[];
    overall_power: number;        // 0.0–1.0 composite
    top_domain: string;           // strongest domain
    absorbed_at: number;
    probe_count: number;
    absorption_time_ms: number;
    total_queries_served: number;
}

export interface AbsorptionCache {
    version: number;
    bigrock_version: string;
    last_updated: number;
    models: AbsorbedModelProfile[];
}

export class AbsorptionMemory {
    private cache_path: string;
    private cache: AbsorptionCache;

    constructor(models_dir: string) {
        this.cache_path = path.join(models_dir, '.absorption_cache.json');
        this.cache = this.loadCache();
    }

    /**
     * Load the absorption cache from disk, or create a fresh one.
     */
    private loadCache(): AbsorptionCache {
        try {
            if (fs.existsSync(this.cache_path)) {
                const raw = fs.readFileSync(this.cache_path, 'utf-8');
                const parsed = JSON.parse(raw) as AbsorptionCache;
                if (parsed.version && parsed.models) {
                    return parsed;
                }
            }
        } catch (e: any) {
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
    public save(): void {
        try {
            this.cache.last_updated = Date.now();
            fs.writeFileSync(this.cache_path, JSON.stringify(this.cache, null, 2), 'utf-8');
        } catch (e: any) {
            console.error(`[AbsorptionMemory]: Failed to save cache: ${e.message}`);
        }
    }

    /**
     * Check if a model has already been absorbed (and cache is still valid).
     * Returns the cached profile if valid, or null if re-probing is needed.
     */
    public getCachedProfile(filename: string, size_bytes: number): AbsorbedModelProfile | null {
        const entry = this.cache.models.find(m => m.filename === filename);
        if (!entry) return null;

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
    public storeProfile(profile: AbsorbedModelProfile): void {
        const idx = this.cache.models.findIndex(m => m.filename === profile.filename);
        if (idx >= 0) {
            this.cache.models[idx] = profile;
        } else {
            this.cache.models.push(profile);
        }
        this.save();
    }

    /**
     * Increment the query count for a model.
     */
    public recordQuery(filename: string): void {
        const entry = this.cache.models.find(m => m.filename === filename);
        if (entry) {
            entry.total_queries_served++;
            // Don't save on every query — save periodically
        }
    }

    /**
     * Flush query counts to disk (call periodically or on shutdown).
     */
    public flush(): void {
        this.save();
    }

    /**
     * Get all cached profiles.
     */
    public getAllProfiles(): AbsorbedModelProfile[] {
        return [...this.cache.models];
    }

    /**
     * Get the total power across all absorbed models.
     */
    public getTotalPower(): number {
        return this.cache.models.reduce((sum, m) => sum + m.overall_power, 0);
    }

    /**
     * Get the domain champion — model with the highest score for a domain.
     */
    public getDomainChampion(domain: string): AbsorbedModelProfile | null {
        let best: AbsorbedModelProfile | null = null;
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
    public getAllChampions(): Map<string, { model: string; score: number }> {
        const champions = new Map<string, { model: string; score: number }>();

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
    public getModelCount(): number { return this.cache.models.length; }
}
