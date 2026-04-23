/**
 * CORTEX — BEASTMODE Activation System
 * ─────────────────────────────────────────────────────────────────────────
 * BEASTMODE cranks ALL subsystems to maximum power simultaneously.
 * This is the "turbo button" for the entire CORTEX system.
 *
 *  ┌────────────────────────────────────────────────────────────────────┐
 *  │                   ⚡ B E A S T M O D E ⚡                         │
 *  ├──────────────────┬─────────────┬──────────────────────────────────┤
 *  │ ARL: AGGRESSIVE  │ NEURAL: MAX │ MEMORY: EXTENDED                │
 *  │ ABSORBER: ACTIVE │ MYTHOS: HOT │ REFLECTION: 7-PASS DEEP        │
 *  │ TIMEOUT: 30s     │ AGENTS: 25  │ PATROL: 5s CYCLE               │
 *  └──────────────────┴─────────────┴──────────────────────────────────┘
 *
 * © 2026 SpaceTon. CORTEX Sovereign Intelligence Infrastructure.
 */

export interface BeastModeConfig {
    // ARL intervals (ms)
    arl_patrol_interval: number;
    arl_curiosity_interval: number;
    arl_consolidation_interval: number;

    // Neural parameters
    neural_think_depth: number;
    cognition_timeout_ms: number;

    // Self-reflection
    reflection_passes: number;

    // Memory
    memory_ttl_ms: number;

    // Absorber
    auto_absorb_on_boot: boolean;

    // Mythos
    mythos_continuous_scan: boolean;

    // Agent loop
    agent_max_iterations: number;
    agent_max_duration_ms: number;
}

export interface BeastModeStatus {
    active: boolean;
    engaged_at: number | null;
    uptime_ms: number;
    config: BeastModeConfig;
    systems_cranked: string[];
}

// ─── DEFAULT CONFIGS ────────────────────────────────────────────────────────

export const NORMAL_CONFIG: BeastModeConfig = {
    arl_patrol_interval: 20_000,        // 20s
    arl_curiosity_interval: 60_000,     // 60s
    arl_consolidation_interval: 300_000, // 5 min
    neural_think_depth: 10,
    cognition_timeout_ms: 8_000,
    reflection_passes: 3,
    memory_ttl_ms: 120_000,             // 2 min
    auto_absorb_on_boot: false,
    mythos_continuous_scan: false,
    agent_max_iterations: 8,
    agent_max_duration_ms: 120_000,
};

export const BEAST_CONFIG: BeastModeConfig = {
    arl_patrol_interval: 5_000,          // 5s — AGGRESSIVE
    arl_curiosity_interval: 15_000,      // 15s — RAPID LEARNING
    arl_consolidation_interval: 60_000,  // 60s — FAST CONSOLIDATION
    neural_think_depth: 50,              // MAX DEPTH
    cognition_timeout_ms: 30_000,        // 30s — EXTENDED TIMEOUT
    reflection_passes: 7,               // 7-PASS DEEP REFLECTION
    memory_ttl_ms: 600_000,             // 10 min — EXTENDED RETENTION
    auto_absorb_on_boot: true,           // AUTO-SCAN
    mythos_continuous_scan: true,         // ALWAYS HUNTING
    agent_max_iterations: 25,            // HIGH AUTONOMY
    agent_max_duration_ms: 300_000,      // 5 min budget
};

// ─── BEASTMODE MANAGER ──────────────────────────────────────────────────────

export class BeastMode {
    private active: boolean = false;
    private engaged_at: number | null = null;
    private config: BeastModeConfig;
    private onConfigChange?: (config: BeastModeConfig) => void;

    constructor(onConfigChange?: (config: BeastModeConfig) => void) {
        this.config = { ...NORMAL_CONFIG };
        this.onConfigChange = onConfigChange;
    }

    public engage(): BeastModeStatus {
        this.active = true;
        this.engaged_at = Date.now();
        this.config = { ...BEAST_CONFIG };

        // Push new config to all subsystems
        if (this.onConfigChange) {
            this.onConfigChange(this.config);
        }

        // Update process env for agent loop budgets
        process.env.AUTO_LOOP_MAX_ITERATIONS = String(this.config.agent_max_iterations);
        process.env.AUTO_LOOP_MAX_DURATION_MS = String(this.config.agent_max_duration_ms);

        return this.getStatus();
    }

    public disengage(): BeastModeStatus {
        this.active = false;
        this.config = { ...NORMAL_CONFIG };

        if (this.onConfigChange) {
            this.onConfigChange(this.config);
        }

        // Reset process env
        process.env.AUTO_LOOP_MAX_ITERATIONS = String(this.config.agent_max_iterations);
        process.env.AUTO_LOOP_MAX_DURATION_MS = String(this.config.agent_max_duration_ms);

        this.engaged_at = null;
        return this.getStatus();
    }

    public toggle(): BeastModeStatus {
        return this.active ? this.disengage() : this.engage();
    }

    public isActive(): boolean {
        return this.active;
    }

    public getConfig(): BeastModeConfig {
        return { ...this.config };
    }

    public getStatus(): BeastModeStatus {
        const systems: string[] = [];
        if (this.active) {
            systems.push(
                'ARL_AGGRESSIVE',
                'NEURAL_MAX_DEPTH',
                'REFLECTION_7_PASS',
                'MEMORY_EXTENDED',
                'ABSORBER_AUTO',
                'MYTHOS_CONTINUOUS',
                'AGENT_HIGH_AUTONOMY',
                'TIMEOUT_EXTENDED',
                'PATROL_RAPID',
                'CURIOSITY_ACCELERATED'
            );
        }
        return {
            active: this.active,
            engaged_at: this.engaged_at,
            uptime_ms: this.engaged_at ? Date.now() - this.engaged_at : 0,
            config: { ...this.config },
            systems_cranked: systems,
        };
    }

    /**
     * Generate the BEASTMODE activation banner for terminal display.
     */
    public static getActivationBanner(): string {
        return [
            '',
            '  ╔══════════════════════════════════════════════════════╗',
            '  ║          ⚡ B E A S T M O D E   E N G A G E D ⚡     ║',
            '  ╠══════════════════════════════════════════════════════╣',
            '  ║  ARL: AGGRESSIVE (5s patrol)                        ║',
            '  ║  NEURAL: MAX DEPTH (50 layers)                      ║',
            '  ║  REFLECTION: 7-PASS DEEP                            ║',
            '  ║  MEMORY: 10 MIN EXTENDED RETENTION                  ║',
            '  ║  ABSORBER: AUTO-SCANNING                            ║',
            '  ║  MYTHOS: CONTINUOUS THREAT HUNTING                   ║',
            '  ║  AGENTS: 25 ITERATION HIGH AUTONOMY                 ║',
            '  ║  TIMEOUT: 30s EXTENDED COGNITION                    ║',
            '  ╚══════════════════════════════════════════════════════╝',
            '',
        ].join('\n');
    }

    public static getDeactivationBanner(): string {
        return [
            '',
            '  ┌──────────────────────────────────────────────────────┐',
            '  │  BEASTMODE DISENGAGED — Normal operating parameters  │',
            '  └──────────────────────────────────────────────────────┘',
            '',
        ].join('\n');
    }
}
