import os from 'os';
import fs from 'fs';
import { ProcessHypervisor } from '../hypervisor/ProcessHypervisor.js';
import { AdaptiveBrain } from './AdaptiveBrain.js';
import { KernelInterface } from '../kernel/KernelInterface.js';

/**
 * BIGROCK_v2 — SystemSovereign (System-Level Autonomy)
 * ─────────────────────────────────────────────────────────────────────────
 * Gives the AdaptiveBrain the ability to observe and manage its host environment.
 * 
 * CORE CAPABILITIES:
 *   1. Resource Allocation: Auto-evicts models when system RAM drops.
 *   2. Health Guardian: Detects if Node-llama-cpp hangs and re-initialises.
 *   3. Growth Planner: Analyses Hive domains and suggests which models to download next.
 *   4. System Telemetry: Provides OS-level metrics back to the brain.
 */

export interface SystemHealth {
    cpu_usage_percent: number;
    ram_usage_gb: number;
    ram_free_gb: number;
    is_memory_critical: boolean;
    uptime_hours: number;
}

export class SystemSovereign {
    private brain: AdaptiveBrain;
    private hypervisor: ProcessHypervisor;
    private kernel: KernelInterface;
    
    private monitor_interval: ReturnType<typeof setInterval> | null = null;
    private readonly MEMORY_CRITICAL_THRESHOLD_GB = 1.0; // 1 GB free

    constructor(brain: AdaptiveBrain) {
        this.brain = brain;
        this.hypervisor = new ProcessHypervisor();
        this.kernel = new KernelInterface();
    }

    /**
     * Start the sovereign monitoring loop.
     */
    public assumeControl(): void {
        console.log(`[SystemSovereign]: 👑 Assuming system control...`);
        this.monitor_interval = setInterval(() => this.healthCheck(), 30_000); // Every 30s
    }

    public relinquishControl(): void {
        if (this.monitor_interval) {
            clearInterval(this.monitor_interval);
            this.monitor_interval = null;
        }
        console.log(`[SystemSovereign]: Control relinquished.`);
    }

    /**
     * Periodic health check of the host system.
     */
    private async healthCheck(): Promise<void> {
        const health = this.getHealth();

        // 1. RESOURCE MANAGEMENT: If memory is critical, force hive eviction
        if (health.is_memory_critical) {
            console.log(`[SystemSovereign]: ⚠️ CRITICAL MEMORY (${health.ram_free_gb}GB free). Initiating emergency model eviction...`);
            const hive = this.brain.getHive();
            const hot_models = hive.getHotModels().sort((a: any, b: any) => a.last_accessed - b.last_accessed);
            
            // Evict the oldest model immediately
            if (hot_models.length > 0) {
                const target = hot_models[0];
                console.log(`[SystemSovereign]: Force demoting ${target.filename} to WARM tier.`);
                try {
                    await target.llama_instance?.dispose();
                    hive.demoteToWarm(target.filename);
                } catch (e: any) {
                    console.error(`[SystemSovereign]: Eviction failed: ${e.message}`);
                }
            }
        }

        // 2. HEALTH GUARDIAN: Preemptive Champion Loading
        const brain_status = this.brain.getStatus();
        if (brain_status.hive_status.hot_models === 0 && health.ram_free_gb > 4.0) {
            console.log(`[SystemSovereign]: 🛡️ Substantial RAM available. Preemptively loading primary champion...`);
            const hive = this.brain.getHive();
            const ranked_models = hive.getAllRanked();
            
            if (ranked_models.length > 0) {
                const champion = ranked_models[0].filename;
                // Preemptively load it by invoking a dummy ping, allowing AdaptiveBrain to handle the underlying node-llama-cpp state.
                this.brain.think('ping', 'system', 'single_champion').catch(e => {
                    console.error(`[SystemSovereign]: Preemptive load failed: ${e.message}`);
                });
            }
        }
    }

    /**
     * Get current system health telemetry.
     */
    public getHealth(): SystemHealth {
        const free_gb = os.freemem() / 1e9;
        const total_gb = os.totalmem() / 1e9;
        const cpus = os.cpus();
        
        // Naive CPU usage (requires previous tick for accuracy, doing instant approximation here)
        let idle = 0;
        let total = 0;
        for (const cpu of cpus) {
            for (const type in cpu.times) {
                total += (cpu.times as any)[type];
            }
            idle += cpu.times.idle;
        }
        const cpu_usage = total > 0 ? 100 - ~~(100 * idle / total) : 0;

        return {
            cpu_usage_percent: cpu_usage,
            ram_usage_gb: parseFloat((total_gb - free_gb).toFixed(2)),
            ram_free_gb: parseFloat(free_gb.toFixed(2)),
            is_memory_critical: free_gb < this.MEMORY_CRITICAL_THRESHOLD_GB,
            uptime_hours: parseFloat((os.uptime() / 3600).toFixed(2))
        };
    }

    /**
     * Analyse the hive and suggest which domains the brain is weak in.
     */
    public getGrowthPlan(): { suggested_domains: string[]; reason: string } {
        const hive = this.brain.getHive();
        if (!hive.hasModels()) {
            return { suggested_domains: ['all'], reason: 'No models absorbed yet.' };
        }

        const wisdom = hive.getWisdomMap();
        const weak_domains: { domain: string, score: number }[] = [];

        // All possible domains
        const ALL_DOMAINS = ['reasoning', 'mathematics', 'code', 'cybersecurity', 'logic', 'science', 'language', 'creative'];

        for (const domain of ALL_DOMAINS) {
            const score = wisdom[domain]?.score || 0;
            if (score < 0.6) {
                weak_domains.push({ domain, score });
            }
        }

        weak_domains.sort((a, b) => a.score - b.score);

        if (weak_domains.length === 0) {
            return { 
                suggested_domains: [], 
                reason: 'All core domains are highly capable (score > 0.6). Hive is balanced.' 
            };
        }

        return {
            suggested_domains: weak_domains.map(d => d.domain),
            reason: `Identified ${weak_domains.length} weak domains. Priorities: ${weak_domains.slice(0,2).map(d => `${d.domain} (${d.score.toFixed(2)})`).join(', ')}`
        };
    }
}
