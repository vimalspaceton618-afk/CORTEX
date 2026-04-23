import type { CognitionCore } from '../core/CognitionCore.js';
import type { Thought } from '../core/types.js';
import { randomUUID } from 'crypto';

/**
 * BIGROCK_v1 — Autonomous Reasoning Loop (ARL)
 * ─────────────────────────────────────────────────────────────────────────
 * The ARL transforms Bigrock from a REACTIVE system (responds to input) into
 * a PROACTIVE one (initiates its own cognitive cycles).
 *
 * Cognitive Modes:
 *
 *  1. PATROL MODE (15s cycle):
 *     Continuously monitors system entropy, neural health, and memory
 *     consistency. Flags anomalies to the integrity chain.
 *
 *  2. CURIOSITY MODE (60s cycle):
 *     Bigrock generates its own exploratory queries based on the current
 *     knowledge frontier. Like a scientist asking "what if..." questions.
 *     This is self-directed learning — not prompted by any user.
 *
 *  3. CONSOLIDATION MODE (300s cycle):
 *     Reviews the episodic memory bank, compresses old thoughts into
 *     declarative long-term memory, and runs integrity verification.
 *
 * Architecture note:
 *   The ARL runs as a non-blocking background service.
 *   Each cycle runs through the full CognitionCore pipeline with the
 *   added context that the caller is the ASI itself.
 */

export type ARLMode = 'patrol' | 'curiosity' | 'consolidation' | 'idle';

export interface ARLCycleResult {
    id: string;
    mode: ARLMode;
    timestamp: number;
    queries_generated: string[];
    thoughts_produced: Thought[];
    anomalies_detected: string[];
    execution_ms: number;
}

export interface ARLMetrics {
    cycles_completed: number;
    anomalies_detected: number;
    self_queries_generated: number;
    mode_history: ARLMode[];
    last_cycle_ms: number;
    uptime_ms: number;
}

class CuriosityEngine {
    /** Generate a self-directed exploratory query from current system state */
    public generate(
        domainHistory: string[],
        entropy: number,
        energy: number
    ): string {
        const highEntropyQueries = [
            'differentiate x^5 - 3*x^3 + 7*x with respect to x',
            'h * 1e15',             // High-frequency photon energy
            'escape velocity from Earth',
            'p IMPLIES (q IMPLIES p)',
            'G * (1.989e30 * 5.972e24) / (1.496e11^2)',  // Earth-Sun gravity
        ];
        const lowEntropyQueries = [
            'de broglie wavelength',
            'differentiate e^x + sin(x) with respect to x',
            '2^10 + 3^5 - 7^3',
            'p XOR q',
            'coulomb force',
            'time dilation at 90% speed of light',
        ];

        const pool = entropy > 5 ? highEntropyQueries : lowEntropyQueries;
        return pool[Math.floor(Math.random() * pool.length)];
    }
}

export class AutonomousReasoningLoop {
    private core: CognitionCore;
    private curiosity: CuriosityEngine;
    private running: boolean = false;
    private cycle_log: ARLCycleResult[] = [];
    private start_time: number = 0;

    // Cycle intervals (ms)
    private PATROL_INTERVAL   = 20_000;   // 20s
    private CURIOSITY_INTERVAL = 60_000;  // 60s
    private CONSOLIDATION_INTERVAL = 300_000; // 5 min

    private patrol_timer?: ReturnType<typeof setInterval>;
    private curiosity_timer?: ReturnType<typeof setInterval>;
    private consolidation_timer?: ReturnType<typeof setInterval>;

    constructor(core: CognitionCore) {
        this.core = core;
        this.curiosity = new CuriosityEngine();
    }

    // ─── Public Controls ───────────────────────────────────────────────────────

    public start(): void {
        if (this.running) return;
        this.running = true;
        this.start_time = Date.now();

        // Patrol cycle — system health checks
        this.patrol_timer = setInterval(() => this.runCycle('patrol'), this.PATROL_INTERVAL);

        // Curiosity cycle — self-generated queries
        this.curiosity_timer = setInterval(() => this.runCycle('curiosity'), this.CURIOSITY_INTERVAL);

        // Consolidation cycle — long-term memory
        this.consolidation_timer = setInterval(() => this.runCycle('consolidation'), this.CONSOLIDATION_INTERVAL);

        console.log('[ARL]: Autonomous Reasoning Loop started.');
    }

    public stop(): void {
        if (!this.running) return;
        this.running = false;
        clearInterval(this.patrol_timer);
        clearInterval(this.curiosity_timer);
        clearInterval(this.consolidation_timer);
        console.log('[ARL]: Autonomous Reasoning Loop stopped.');
    }

    public isRunning(): boolean { return this.running; }

    /**
     * Run a single cycle synchronously (for testing).
     */
    public async runCycleNow(mode: ARLMode): Promise<ARLCycleResult> {
        return this.runCycle(mode);
    }

    public getMetrics(): ARLMetrics {
        const anomalies = this.cycle_log.flatMap(c => c.anomalies_detected).length;
        const queries = this.cycle_log.flatMap(c => c.queries_generated).length;
        const lastCycle = this.cycle_log[this.cycle_log.length - 1];
        return {
            cycles_completed: this.cycle_log.length,
            anomalies_detected: anomalies,
            self_queries_generated: queries,
            mode_history: this.cycle_log.slice(-20).map(c => c.mode),
            last_cycle_ms: lastCycle?.execution_ms ?? 0,
            uptime_ms: this.running ? Date.now() - this.start_time : 0
        };
    }

    public getCycleLog(): ARLCycleResult[] { return this.cycle_log; }

    // ─── Cycle Implementations ─────────────────────────────────────────────────

    private async runCycle(mode: ARLMode): Promise<ARLCycleResult> {
        const start = Date.now();
        const id = randomUUID().slice(0, 8);
        const queries_generated: string[] = [];
        const thoughts_produced: Thought[] = [];
        const anomalies_detected: string[] = [];

        try {
            if (mode === 'patrol') {
                await this.patrolCycle(anomalies_detected, thoughts_produced);

            } else if (mode === 'curiosity') {
                const metrics = this.core.getLearning().getMetrics();
                const query = this.curiosity.generate(
                    metrics.domains_active,
                    metrics.global_entropy,
                    metrics.network_energy
                );
                queries_generated.push(query);
                const t = await this.core.process(query);
                thoughts_produced.push(t);

            } else if (mode === 'consolidation') {
                await this.consolidationCycle(anomalies_detected, thoughts_produced);
            }
        } catch (e: any) {
            anomalies_detected.push(`[CYCLE ERROR]: ${e.message}`);
        }

        const result: ARLCycleResult = {
            id, mode, timestamp: Date.now(), queries_generated,
            thoughts_produced, anomalies_detected,
            execution_ms: Date.now() - start
        };
        this.cycle_log.push(result);
        return result;
    }

    private async patrolCycle(anomalies: string[], thoughts: Thought[]): Promise<void> {
        // 1. Integrity chain check
        const chain = this.core.getHypervisor().verifyChain();
        if (!chain.valid) {
            anomalies.push(`INTEGRITY CHAIN BROKEN at link #${chain.broken_at}`);
        }

        // 2. Neural entropy health check
        const metrics = this.core.getLearning().getMetrics();
        if (metrics.global_entropy > 15.0) {
            anomalies.push(`NEURAL ENTROPY CRITICAL: ${metrics.global_entropy.toFixed(4)} (threshold: 15.0)`);
        }

        // 3. Memory cell count sanity check
        const cellCount = this.core.getMemory().getCellCount();
        if (cellCount > 5000) {
            anomalies.push(`MEMORY PRESSURE: ${cellCount} cells (threshold: 5000)`);
        }

        // 4. Run a known-good probe to verify engine responsiveness
        const probe = await this.core.process('1 + 1');
        thoughts.push(probe);
        if (probe.result?.value !== 2 && String(probe.result?.value) !== '2') {
            anomalies.push(`ENGINE PROBE FAILED: expected 2, got ${probe.result?.value}`);
        }
    }

    private async consolidationCycle(anomalies: string[], thoughts: Thought[]): Promise<void> {
        // 1. Re-verify all physical constants
        const c = this.core.getMemory().readCell('CONST::c');
        if (c !== 299792458) anomalies.push(`CONSTANT DRIFT: c = ${c} (expected 299792458)`);

        const h = this.core.getMemory().readCell('CONST::h');
        if (Math.abs((h as number) - 6.62607015e-34) > 1e-45) {
            anomalies.push(`CONSTANT DRIFT: h drifted from expected value`);
        }

        // 2. Run one full physics proof to verify engine integrity
        const t = await this.core.process('escape velocity from Earth');
        thoughts.push(t);

        // 3. Prune old episodic memory (future: EpisodicMemoryBank integration)
        // (placeholder — EpisodicMemoryBank will handle this)
    }
}
