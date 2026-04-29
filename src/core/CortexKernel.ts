/**
 * CORTEX — Unified Cognition Kernel (CortexKernel)
 * ─────────────────────────────────────────────────────────────────────────
 * The single entry point to ALL intelligence capabilities.
 *
 * This is the beating heart of CORTEX — a singleton that boots the entire
 * BIGROCK ASI cognition stack in-process and exposes it to the Agent Swarm,
 * React Ink UI, and all subsystems via direct function calls (ZERO HTTP).
 *
 *  ┌──────────────────────────────────────────────────────────────────────┐
 *  │                    CORTEX KERNEL v4.0                                │
 *  ├──────────────────────────────────────────────────────────────────────┤
 *  │  CognitionCore  │  ARL  │  Mythos  │  Absorber  │  Hypervisor      │
 *  │  BeastMode      │  EpisodicMemory  │  NeuroBridge  │  Logic        │
 *  │  SymbolicEngine │  PhysicsEngine   │  LiquidNeural │  Security     │
 *  └──────────────────────────────────────────────────────────────────────┘
 *
 * © 2026 SpaceTon. CORTEX Sovereign Intelligence Infrastructure.
 */

// Import from compiled BIGROCK dist (boot.js compiles BIGROCK first)
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname_val = dirname(fileURLToPath(import.meta.url));
const BIGROCK_DIST = resolve(__dirname_val, '..', '..', 'BIGROCK_ASI', 'dist');

// Dynamic imports for BIGROCK modules (they live in a separate compilation unit)
// We must use file:// URLs on Windows for ESM dynamic imports.
let CognitionCoreClass: any = null;
let AutonomousReasoningLoopClass: any = null;

async function loadBigrockModules() {
    try {
        const coreUrl = pathToFileURL(resolve(BIGROCK_DIST, 'core', 'CognitionCore.js')).href;
        const coreMod = await import(/* webpackIgnore: true */ coreUrl);
        CognitionCoreClass = coreMod.CognitionCore;

        const arlUrl = pathToFileURL(resolve(BIGROCK_DIST, 'reasoning', 'AutonomousReasoningLoop.js')).href;
        const arlMod = await import(/* webpackIgnore: true */ arlUrl);
        AutonomousReasoningLoopClass = arlMod.AutonomousReasoningLoop;

        return true;
    } catch (e: any) {
        console.error(`[CORTEX KERNEL] Failed to load BIGROCK modules: ${e.message}`);
        console.error(`[CORTEX KERNEL] Ensure BIGROCK_ASI is compiled (npm run build in BIGROCK_ASI/)`);
        return false;
    }
}

import { BeastMode, BEAST_CONFIG, NORMAL_CONFIG } from './BeastMode.js';
import type { BeastModeConfig, BeastModeStatus } from './BeastMode.js';

// ─── System Metrics Interface ────────────────────────────────────────────────

export interface SystemMetrics {
    // Core status
    kernel_booted: boolean;
    bigrock_loaded: boolean;
    beastmode: BeastModeStatus;
    uptime_ms: number;

    // Telemetry
    platform: string;
    cpu_model: string;
    cpu_threads: number;
    cpu_freq_mhz: number;
    memory_used_gb: number;
    memory_total_gb: number;
    memory_usage_percent: number;

    // Cognition
    thoughts_processed: number;
    domains_active: string[];
    global_entropy: number;
    network_energy: number;
    synaptic_updates: number;

    // Security
    integrity_chain_valid: boolean;
    integrity_chain_length: number;
    threats_blocked: number;
    security_audit_count: number;

    // ARL
    arl_running: boolean;
    arl_cycles: number;
    arl_anomalies: number;
    arl_self_queries: number;

    // Memory
    memory_cells: number;
    episodic_records: number;

    // Absorber
    models_absorbed: number;
    absorber_total_power: number;

    // Mythos
    mythos_layers: number;

    // Brain
    collective_iq?: number;
    fusion_quality?: number;
}

// ─── CORTEX KERNEL ──────────────────────────────────────────────────────────

export class CortexKernel {
    private static instance: CortexKernel | null = null;

    private core: any = null;           // CognitionCore instance
    private arl: any = null;            // AutonomousReasoningLoop instance
    private beast: BeastMode;
    private booted: boolean = false;
    private boot_time: number = 0;
    private bigrock_loaded: boolean = false;

    private constructor() {
        this.beast = new BeastMode((config: BeastModeConfig) => {
            this.applyConfig(config);
        });
    }

    /**
     * Boot the kernel — singleton initializer.
     * Call this ONCE at application startup.
     */
    public static async boot(): Promise<CortexKernel> {
        if (CortexKernel.instance) {
            return CortexKernel.instance;
        }

        const kernel = new CortexKernel();
        kernel.boot_time = Date.now();

        // Load BIGROCK modules
        const loaded = await loadBigrockModules();
        if (loaded && CognitionCoreClass && AutonomousReasoningLoopClass) {
            kernel.core = new CognitionCoreClass();
            kernel.arl = new AutonomousReasoningLoopClass(kernel.core);
            kernel.bigrock_loaded = true;
        }

        kernel.booted = true;
        CortexKernel.instance = kernel;
        return kernel;
    }

    /**
     * Get the singleton instance. Throws if not booted.
     */
    public static get(): CortexKernel {
        if (!CortexKernel.instance) {
            throw new Error('[CORTEX KERNEL] Not booted. Call CortexKernel.boot() first.');
        }
        return CortexKernel.instance;
    }

    /**
     * Check if the kernel has been booted.
     */
    public static isBooted(): boolean {
        return CortexKernel.instance !== null && CortexKernel.instance.booted;
    }

    // ─── COGNITION ──────────────────────────────────────────────────────────

    /**
     * Process any input through the FULL Bigrock ASI cognition pipeline.
     * Returns a Thought object with result, confidence, proof trace, etc.
     */
    public async think(input: string): Promise<any> {
        if (!this.core) {
            return {
                id: 'no-core',
                timestamp: Date.now(),
                mode: 'heuristic',
                raw_input: input,
                parsed_intent: { domain: 'unknown', operation: 'none', parameters: {}, requires_proof: false, security_level: 'read_only' },
                result: { type: 'error', value: 'BIGROCK CognitionCore not loaded. Run build first.', confidence: 0 },
                confidence: 0,
                execution_time_ms: 0,
            };
        }
        return this.core.process(input);
    }

    /**
     * Quick check if a query should be handled by the local cognition core
     * instead of being sent to a cloud LLM.
     */
    public shouldHandleLocally(input: string): boolean {
        if (!this.core) return false;

        const lower = input.toLowerCase();

        // STEM domains — always handle locally (deterministic proof)
        const stemPatterns = [
            /\b(solve|derivative|integral|differentiate|calculate|compute|evaluate|simplify)\b/,
            /(?:[\d\.]+|[a-zA-Z_]+)\s*[\+\-\*\/\^]\s*(?:[\d\.]+|[a-zA-Z_]+)/,
            /\b(sin|cos|tan|ln|log|sqrt|abs)\s*\(/,
            /\b(force|mass|velocity|acceleration|momentum|energy|gravity|quantum|photon)\b/,
            /\b(escape velocity|orbital velocity|time dilation|mass.energy|gravitational)\b/i,
            /\b(coulomb|de broglie|hydrogen transition|planck)\b/i,
            /E\s*=\s*m\s*c/i,
            /\b(AND|OR|NOT|IMPLIES|IFF|XOR)\b/,
            /∧|∨|¬|→|↔/,
        ];

        for (const pattern of stemPatterns) {
            if (pattern.test(lower) || pattern.test(input)) {
                return true;
            }
        }

        // System/kernel queries
        if (/\b(cpu|memory|uptime|telemetry|system status|process|thread)\b/i.test(lower)) {
            return true;
        }

        return false;
    }

    // ─── BEASTMODE ──────────────────────────────────────────────────────────

    public engageBeastMode(): BeastModeStatus {
        const status = this.beast.engage();

        // Start ARL in aggressive mode
        if (this.arl && !this.arl.isRunning()) {
            this.arl.start();
        }

        // Auto-absorb if configured
        if (status.config.auto_absorb_on_boot && this.core) {
            const absorber = this.core.getAbsorber();
            if (!absorber.hasAbsorbedModels()) {
                absorber.absorbAll(false).catch(() => { /* non-blocking */ });
            }
        }

        return status;
    }

    public disengageBeastMode(): BeastModeStatus {
        const status = this.beast.disengage();

        // Stop ARL
        if (this.arl && this.arl.isRunning()) {
            this.arl.stop();
        }

        return status;
    }

    public toggleBeastMode(): BeastModeStatus {
        return this.beast.isActive() ? this.disengageBeastMode() : this.engageBeastMode();
    }

    public isBeastMode(): boolean {
        return this.beast.isActive();
    }

    public getBeastStatus(): BeastModeStatus {
        return this.beast.getStatus();
    }

    // ─── ARL CONTROLS ───────────────────────────────────────────────────────

    public startARL(): void {
        if (this.arl) this.arl.start();
    }

    public stopARL(): void {
        if (this.arl) this.arl.stop();
    }

    public isARLRunning(): boolean {
        return this.arl ? this.arl.isRunning() : false;
    }

    public getARLMetrics(): any {
        return this.arl ? this.arl.getMetrics() : { cycles_completed: 0, anomalies_detected: 0, self_queries_generated: 0, mode_history: [], last_cycle_ms: 0, uptime_ms: 0 };
    }

    // ─── SUBSYSTEM ACCESS ───────────────────────────────────────────────────

    public getCore(): any { return this.core; }
    public getARL(): any { return this.arl; }

    public getAbsorber(): any {
        return this.core ? this.core.getAbsorber() : null;
    }

    public getBrain(): any {
        return this.core ? this.core.getBrain() : null;
    }

    public getSovereign(): any {
        return this.core ? this.core.getSovereign() : null;
    }

    public getCyberKing(): any {
        return this.core ? this.core.getCyberKing() : null;
    }

    public hasNativeBrain(): boolean {
        return this.booted && this.core && this.getBrain() && this.getBrain().getHive().hasModels();
    }

    public getNativeBrainInfo(): any {
        if (!this.hasNativeBrain()) return null;
        const status = this.getBrain().getStatus();
        const profiles = status.hive_status.cpi_ranking;
        if (profiles.length === 0) return null;
        const champ = profiles[0];
        return {
            filename: champ.filename,
            power: champ.cpi,
            top_domain: Object.keys(status.hive_status.domain_coverage)[0] || 'general',
            champions: Object.fromEntries(
                Object.entries(status.hive_status.domain_coverage).map(([k, v]: [string, any]) => [k, v.champion])
            ),
            collective_iq: status.collective_iq
        };
    }

    public getMythos(): any {
        return this.core ? this.core.getMythos() : null;
    }

    public getEpisodicMemory(): any {
        return this.core ? this.core.getEpisodicMemory() : null;
    }

    public getHypervisor(): any {
        return this.core ? this.core.getHypervisor() : null;
    }

    public getSecurity(): any {
        return this.core ? this.core.getSecurity() : null;
    }

    public getThoughtLog(): any[] {
        return this.core ? this.core.getThoughtLog() : [];
    }

    // ─── REAL-TIME METRICS ──────────────────────────────────────────────────

    /**
     * Collect a snapshot of ALL system metrics for the dashboard.
     */
    public getRealtimeMetrics(): SystemMetrics {
        const base: SystemMetrics = {
            kernel_booted: this.booted,
            bigrock_loaded: this.bigrock_loaded,
            beastmode: this.beast.getStatus(),
            uptime_ms: Date.now() - this.boot_time,
            platform: '-',
            cpu_model: '-',
            cpu_threads: 0,
            cpu_freq_mhz: 0,
            memory_used_gb: 0,
            memory_total_gb: 0,
            memory_usage_percent: 0,
            thoughts_processed: 0,
            domains_active: [],
            global_entropy: 0,
            network_energy: 0,
            synaptic_updates: 0,
            integrity_chain_valid: true,
            integrity_chain_length: 0,
            threats_blocked: 0,
            security_audit_count: 0,
            arl_running: false,
            arl_cycles: 0,
            arl_anomalies: 0,
            arl_self_queries: 0,
            memory_cells: 0,
            episodic_records: 0,
            models_absorbed: 0,
            absorber_total_power: 0,
            mythos_layers: 12,
            collective_iq: 0,
            fusion_quality: 0
        } as any;

        if (!this.core) return base;

        try {
            // Telemetry
            const telemetry = this.core.getKernel().getTelemetry();
            base.platform = `${telemetry.os.platform} | ${telemetry.os.release}`;
            base.cpu_model = telemetry.cpu.model;
            base.cpu_threads = telemetry.cpu.threads;
            base.cpu_freq_mhz = telemetry.cpu.frequency_mhz;
            base.memory_used_gb = telemetry.memory.used_gb;
            base.memory_total_gb = telemetry.memory.total_gb;
            base.memory_usage_percent = telemetry.memory.usage_percent;

            // Neural
            const neural = this.core.getLearning().getMetrics();
            base.thoughts_processed = neural.total_thoughts_processed;
            base.domains_active = neural.domains_active;
            base.global_entropy = neural.global_entropy;
            base.network_energy = neural.network_energy;
            base.synaptic_updates = neural.synaptic_updates;

            // Security
            const hyp = this.core.getHypervisor();
            const chainStatus = hyp.verifyChain();
            base.integrity_chain_valid = chainStatus.valid;
            base.integrity_chain_length = hyp.getChainLength();
            base.threats_blocked = this.core.getSecurity().getThreatCount();
            base.security_audit_count = this.core.getSecurity().getAuditLog().length;

            // ARL
            if (this.arl) {
                base.arl_running = this.arl.isRunning();
                const arlM = this.arl.getMetrics();
                base.arl_cycles = arlM.cycles_completed;
                base.arl_anomalies = arlM.anomalies_detected;
                base.arl_self_queries = arlM.self_queries_generated;
            }

            // Memory
            base.memory_cells = this.core.getMemory().getCellCount();
            base.episodic_records = this.core.getEpisodicMemory().size();

            // Absorber / Brain
            const brain = this.core.getBrain();
            if (brain) {
                const bStat = brain.getStatus();
                base.models_absorbed = bStat.hive_status.total_models;
                base.absorber_total_power = bStat.hive_status.total_power;
                base.collective_iq = bStat.collective_iq;
                base.fusion_quality = bStat.fusion_status.fusion_quality;
            } else {
                const absorber = this.core.getAbsorber();
                base.models_absorbed = absorber.getAbsorbedProfiles().length;
                base.absorber_total_power = absorber.getTotalPower();
                base.collective_iq = 0;
                base.fusion_quality = 0;
            }

        } catch (e) {
            // Graceful degradation — return partial metrics
        }

        return base;
    }

    // ─── THOUGHT FORMATTING ─────────────────────────────────────────────────

    /**
     * Format a Thought into a human-readable string for terminal display.
     */
    public formatThought(thought: any): string {
        if (!thought || !thought.result) return '[No result]';

        const domain = thought.parsed_intent?.domain || 'unknown';
        const mode = thought.mode || 'unknown';
        const confidence = thought.confidence ?? 0;
        const time = thought.execution_time_ms ?? 0;
        const val = thought.result?.value;

        const lines: string[] = [];

        // Header
        lines.push(`─────────────────────────────────────────────────`);
        lines.push(`⚡ Domain    : ${domain.toUpperCase()}`);
        lines.push(`🔬 Mode      : ${mode === 'symbolic' ? 'PROOF MODE' : mode === 'heuristic' ? 'COMPUTE MODE' : mode === 'meta' ? 'META-SYNTHESIS' : 'NEURAL MODE'}`);
        lines.push(`🎯 Confidence: ${confidence === 1.0 ? '100% (Deterministic Proof)' : `${(confidence * 100).toFixed(1)}% (Neural Estimate)`}`);
        lines.push(`⏱  Time      : ${time}ms`);

        // Proof trace
        if (thought.result?.proof_trace?.length) {
            lines.push(`\n📋 PROOF TRACE:`);
            for (const step of thought.result.proof_trace) {
                lines.push(`  │ ${step}`);
            }
        }

        // Result
        if (thought.result?.type === 'error') {
            lines.push(`\n⛔ BLOCKED: ${val}`);
        } else if (typeof val === 'object') {
            lines.push(`\n✅ RESULT:`);
            lines.push(JSON.stringify(val, null, 2));
        } else {
            lines.push(`\n✅ RESULT: ${val}`);
        }

        // Reflection
        const reflectionLine = confidence >= 0.9 ? 'VERIFIED ✓' :
                              confidence >= 0.5 ? 'SUSPECT ⚠' :
                              'REJECTED ✗';
        lines.push(`🪞 Reflection: ${reflectionLine}`);
        lines.push(`─────────────────────────────────────────────────`);

        return lines.join('\n');
    }

    /**
     * Generate the full system status report.
     */
    public getStatusReport(): string {
        const m = this.getRealtimeMetrics();
        const lines: string[] = [];

        lines.push('╔══════════════════════════════════════════════════════════╗');
        lines.push(`║  CORTEX SYSTEM STATUS  ${m.beastmode.active ? '              ⚡ BEASTMODE ON' : '                            '}  ║`);
        lines.push('╠══════════════════════════════════════════════════════════╣');

        lines.push(`║  Kernel     : ${m.kernel_booted ? '✓ BOOTED' : '✗ DOWN'}  │  BIGROCK: ${m.bigrock_loaded ? '✓ LOADED' : '✗ MISSING'}      ║`);
        lines.push(`║  Uptime     : ${(m.uptime_ms / 1000 / 60).toFixed(1)} min                              ║`);
        lines.push(`║  Platform   : ${m.platform.slice(0, 40).padEnd(40)}  ║`);

        lines.push('╠══════════════════════════════════════════════════════════╣');
        lines.push(`║  🧠 COGNITION                                            ║`);
        lines.push(`║  Thoughts   : ${String(m.thoughts_processed).padEnd(6)} │ Domains: ${m.domains_active.length}                ║`);
        lines.push(`║  Entropy    : ${m.global_entropy.toFixed(3).padEnd(6)} │ Energy : ${m.network_energy.toFixed(3).padEnd(8)}        ║`);
        lines.push(`║  Synapses   : ${String(m.synaptic_updates).padEnd(6)}                                  ║`);

        lines.push('╠══════════════════════════════════════════════════════════╣');
        lines.push(`║  🔒 SECURITY                                             ║`);
        lines.push(`║  Chain      : ${m.integrity_chain_valid ? '✓ VALID' : '✗ BROKEN'} (${m.integrity_chain_length} links)                    ║`);
        lines.push(`║  Threats    : ${m.threats_blocked} blocked  │  Audit: ${m.security_audit_count} entries        ║`);
        lines.push(`║  Mythos     : ${m.mythos_layers} layers active                           ║`);

        lines.push('╠══════════════════════════════════════════════════════════╣');
        lines.push(`║  🔄 ARL: ${m.arl_running ? 'RUNNING' : 'STOPPED'}                                          ║`);
        lines.push(`║  Cycles     : ${m.arl_cycles}  │  Anomalies: ${m.arl_anomalies}  │  Queries: ${m.arl_self_queries}   ║`);

        lines.push('╠══════════════════════════════════════════════════════════╣');
        lines.push(`║  💾 MEMORY: ${m.memory_cells} cells  │  📝 Episodic: ${m.episodic_records} records       ║`);
        lines.push(`║  🍽️  ABSORBER: ${m.models_absorbed} models  │  Power: ${m.absorber_total_power.toFixed(3)}            ║`);

        lines.push('╚══════════════════════════════════════════════════════════╝');

        return lines.join('\n');
    }

    // ─── INTERNAL ───────────────────────────────────────────────────────────

    /**
     * Apply a BeastMode config change to all subsystems.
     */
    private applyConfig(config: BeastModeConfig): void {
        // ARL timing is managed by start/stop (the ARL class uses fixed intervals internally)
        // For a full implementation, we'd modify the ARL's interval properties
        // For now, the BEASTMODE engage/disengage handles ARL start/stop

        // Process env for agents
        process.env.AUTO_LOOP_MAX_ITERATIONS = String(config.agent_max_iterations);
        process.env.AUTO_LOOP_MAX_DURATION_MS = String(config.agent_max_duration_ms);
    }
}
