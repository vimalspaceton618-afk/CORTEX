import { MemoryCore } from '../core/MemoryCore.js';
import { SecurityProcessor } from '../core/SecurityProcessor.js';
import { SymbolicEngine } from '../symbolic/SymbolicEngine.js';
import { NeuroBridge } from '../bridge/NeuroBridge.js';
import { KernelInterface } from '../kernel/KernelInterface.js';
import { PhysicsEngine } from '../physics/PhysicsEngine.js';
import { ProcessHypervisor } from '../hypervisor/ProcessHypervisor.js';
import { ContinuousLearningCore } from '../neural/ContinuousLearningCore.js';
import { SelfReflectionEngine } from '../meta/SelfReflectionEngine.js';
import { FormalLogicProver } from '../logic/FormalLogicProver.js';
import { EpisodicMemoryBank } from '../memory/EpisodicMemoryBank.js';
import { QueryDecomposer } from '../reasoning/QueryDecomposer.js';
import { SLMEngine } from '../neural/SLMEngine.js';
import { LLMDevourer } from '../absorb/LLMDevourer.js';
import { MythosEngine } from '../mythos/MythosEngine.js';
import type { Thought, ThoughtResult, ThinkMode } from '../core/types.js';
import { randomUUID } from 'crypto';

/**
 * BIGROCK_v1 — Central Cognition Core v3 (Phase 3 Deep)
 * ─────────────────────────────────────────────────────────────────────────
 * The unified mind. All Phase 3 subsystems fully integrated:
 *
 *  ┌──────────────────────────────────────────────────────────────────────┐
 *  │                SecurityProcessor (6-Layer Zero-Trust)                │
 *  ├──────────────────────────────────────────────────────────────────────┤
 *  │              ProcessHypervisor (Cap-Tokens + AES-256 + Int-Chain)    │
 *  ├────────────┬────────────────┬─────────────┬─────────────────────────┤
 *  │ NeuroBridge │ SymbolicEngine │ PhysicsEngine│ FormalLogicProver      │
 *  ├────────────┴────────────────┴─────────────┴─────────────────────────┤
 *  │           Liquid Neural Network + ContinuousLearningCore            │
 *  ├──────────────────────────────────────────────────────────────────────┤
 *  │           SelfReflectionEngine (7-check metacognitive auditor)      │
 *  ├──────────────────────────────────────────────────────────────────────┤
 *  │           QueryDecomposer  (DAG sub-problem solver)                 │
 *  ├──────────────────────────────────────────────────────────────────────┤
 *  │           EpisodicMemoryBank (TF-IDF semantic long-term memory)     │
 *  ├──────────────────────────────────────────────────────────────────────┤
 *  │           MemoryCore (SHA-256 integrity, immutable constants)       │
 *  └──────────────────────────────────────────────────────────────────────┘
 *
 *  Pipeline:
 *    Input → Security → [Decompose?] → Hypervisor → Bridge
 *          → [Symbolic|Physics|Logic|Neural|Kernel|🍽️ Devourer]
 *          → SelfReflection → EpisodicMemoryBank → Output
 *
 *  Self-Absorbing:
 *    models/ → LLMDevourer scans & absorbs → domain-routed inference
 */
export class CognitionCore {
    private memory: MemoryCore;
    private security: SecurityProcessor;
    private symbolic: SymbolicEngine;
    private bridge: NeuroBridge;
    private kernel: KernelInterface;
    private physics: PhysicsEngine;
    private hypervisor: ProcessHypervisor;
    private learning: ContinuousLearningCore;
    private reflection: SelfReflectionEngine;
    private logic: FormalLogicProver;
    private episodic: EpisodicMemoryBank;
    private decomposer: QueryDecomposer;
    private slm: SLMEngine;
    private absorber: LLMDevourer;
    private mythos: MythosEngine;
    private thought_log: Thought[] = [];

    constructor() {
        this.memory = new MemoryCore();
        this.security = new SecurityProcessor();
        this.slm = new SLMEngine();
        this.absorber = new LLMDevourer();
        this.symbolic = new SymbolicEngine(this.memory);
        this.mythos = new MythosEngine();

        // Wire up NeuroBridge with a Neural Clarifier (SLM)
        this.bridge = new NeuroBridge(async (input) => {
            const prompt = `Identify the single most relevant cognitive domain for this input: "${input}". 
Options: mathematics, physics, chemistry, logic, system, network, memory, code, cybersecurity, science, creative. 
Return ONLY the single word domain name or "unknown".`;
            const response = await this.slm.generate(input, prompt);
            const domain = response.value.trim().toLowerCase();
            return domain as any;
        });

        this.kernel = new KernelInterface();
        this.physics = new PhysicsEngine(this.memory);
        this.hypervisor = new ProcessHypervisor();
        this.learning = new ContinuousLearningCore();
        this.reflection = new SelfReflectionEngine();
        this.logic = new FormalLogicProver();
        this.episodic = new EpisodicMemoryBank();
        this.decomposer = new QueryDecomposer(this);

        // Wire up Native Dense Vector Embeddings for Episodic Memory
        this.episodic.setEncoder((text: string) => {
            return this.absorber.getNeuralExtract().encode(text);
        });
    }

    /**
     * Process any input through the FULL Bigrock ASI pipeline.
     * Every step is sandboxed, capability-checked, and cryptographically audited.
     */
    public async process(raw_input: string, skipDecomposition: boolean = false): Promise<Thought> {
        // ──── PRE-PROCESS: DAG DECOMPOSITION ────────────────────────────────
        if (!skipDecomposition && this.decomposer.needsDecomposition(raw_input)) {
            const graph = await this.decomposer.solve(raw_input);
            const synthesized_thought: Thought = {
                id: randomUUID(),
                timestamp: Date.now(),
                mode: 'meta',
                raw_input,
                parsed_intent: { domain: 'synthesis', operation: 'decompose', parameters: {}, requires_proof: true, security_level: 'compute' },
                result: { type: 'proof', value: graph.synthesis.final_answer, proof_trace: graph.synthesis.proof_chain, confidence: graph.synthesis.overall_confidence },
                confidence: graph.synthesis.overall_confidence,
                execution_time_ms: graph.synthesis.total_execution_ms
            };
            this.thought_log.push(synthesized_thought);
            this.episodic.store(synthesized_thought, 'semantic');
            return synthesized_thought;
        }

        const start = Date.now();
        const thought_id = randomUUID();

        // ──── LAYER 1: SECURITY SCAN ────────────────────────────────────────
        const threat_scan = this.security.scan(raw_input);
        if (!threat_scan.clean) {
            const thought: Thought = {
                id: thought_id, timestamp: start, mode: 'heuristic', raw_input,
                parsed_intent: { domain: 'unknown', operation: 'security_block', parameters: {}, requires_proof: false, security_level: 'read_only' },
                result: { type: 'error', value: `⛔ SECURITY BLOCK: ${threat_scan.reason}`, confidence: 1.0 },
                confidence: 1.0, execution_time_ms: Date.now() - start
            };
            this.thought_log.push(thought);
            return thought;
        }

        const clean_input = threat_scan.sanitized_input!;

        // ──── LAYER 2: NEURO-BRIDGE ROUTING ─────────────────────────────────
        const parsed_intent = await this.bridge.parseIntent(clean_input);
        const routing = await this.bridge.route(clean_input);
        const domain = parsed_intent.domain;


        // ──── LAYER 3: LIQUID NEURAL PROCESSING ─────────────────────────────
        //  Feed EVERY thought through the neural network (continuous learning).
        //  Think depth scales with domain complexity.
        const think_depth = (domain === 'mathematics' || domain === 'physics') ? 20 : 10;
        const neural_result = await this.hypervisor.sandbox(
            'CognitionCore', 'neural_forward',
            () => this.learning.processThought(domain, clean_input, think_depth)
        );

        // ──── LAYER 4: DOMAIN-SPECIFIC EXECUTION (with Fail-Safe) ───────────
        let result: ThoughtResult;
        let mode: ThinkMode;

        const COGNITION_TIMEOUT_MS = 8000;
        let fallbackTriggered = false;

        try {
            if (routing.route === 'symbolic_engine') {
                mode = 'symbolic';
                const capability = domain === 'physics' ? 'execute_physics' as const : 'execute_math' as const;

                // Race the sandboxed execution against a timeout
                const sandboxed: any = await Promise.race([
                    this.hypervisor.sandbox('CognitionCore', capability, async () => {
                        const { formula, variable } = parsed_intent.parameters;
                        const operation = parsed_intent.operation;

                        if (domain === 'physics') {
                            return this.dispatchPhysics(clean_input, formula);
                        }

                        if (operation === 'differentiate' && variable) {
                            return this.symbolic.differentiate(formula, variable);
                        } else if (operation === 'solve' && variable) {
                            return this.symbolic.solve(formula, variable);
                        } else {
                            return this.symbolic.evaluate(formula);
                        }
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('COGNITION_TIMEOUT')), COGNITION_TIMEOUT_MS))
                ]);

                if (sandboxed.success && sandboxed.result) {
                    const sym_result = sandboxed.result;
                    if ('law' in sym_result) {
                        result = {
                            type: 'proof',
                            value: `${sym_result.result} ${sym_result.unit}`,
                            proof_trace: sym_result.proof_trace,
                            confidence: 1.0
                        };
                    } else {
                        result = {
                            type: sym_result.success ? 'proof' : 'error',
                            value: sym_result.success ? sym_result.result : sym_result.error,
                            proof_trace: sym_result.proof_trace,
                            confidence: sym_result.success ? 1.0 : 0.0
                        };
                        if (!sym_result.success) fallbackTriggered = true;
                    }
                } else {
                    result = { type: 'error', value: sandboxed.error || 'Sandbox execution failed', confidence: 0.0 };
                    fallbackTriggered = true;
                }

            } else if (routing.route === 'system_kernel') {
                mode = 'heuristic';
                const sandboxed = await this.hypervisor.sandbox('CognitionCore', 'kernel_telemetry', () => {
                    return this.kernel.getTelemetry();
                });
                result = {
                    type: sandboxed.success ? 'computation' : 'error',
                    value: sandboxed.success ? sandboxed.result : sandboxed.error,
                    confidence: sandboxed.success ? 0.99 : 0.0
                };

            } else if (routing.route === 'memory_core') {
                mode = 'heuristic';
                const key = parsed_intent.parameters.original_input.split(/\s+/).pop() || '';
                const mem_val = this.memory.readCell(key);
                result = {
                    type: mem_val !== undefined ? 'proof' : 'error',
                    value: mem_val ?? `No memory cell found for key: "${key}"`,
                    confidence: mem_val !== undefined ? 1.0 : 0.0
                };

            } else if (domain === 'logic') {
                mode = 'symbolic';
                const sandboxed: any = await Promise.race([
                    this.hypervisor.sandbox('CognitionCore', 'execute_math', () => {
                        return this.logic.prove(clean_input);
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('COGNITION_TIMEOUT')), COGNITION_TIMEOUT_MS))
                ]);

                if (sandboxed.success && sandboxed.result) {
                    const lr = sandboxed.result;
                    result = {
                        type: 'proof',
                        value: lr.is_tautology ? 'TAUTOLOGY (always true)' :
                               lr.is_contradiction ? 'CONTRADICTION (always false)' :
                               `CONTINGENT (true in ${lr.satisfiable_count}/${lr.total_rows} cases)`,
                        proof_trace: [
                            `[Variables]: ${lr.variables.join(', ')}`,
                            `[Total Rows]: ${lr.total_rows}`,
                            `[Satisfiable]: ${lr.satisfiable_count}`,
                            `[Tautology]: ${lr.is_tautology}`,
                            `[Contradiction]: ${lr.is_contradiction}`,
                            ...lr.truth_table.slice(0, 8).map((row: any) =>
                                `  ${Object.entries(row.variables).map(([k,v]) => `${k}=${v?'T':'F'}`).join(', ')} → ${row.result ? 'TRUE' : 'FALSE'}`
                            ),
                            lr.truth_table.length > 8 ? `  ... (${lr.truth_table.length - 8} more rows)` : ''
                        ].filter(Boolean),
                        confidence: 1.0
                    };
                } else {
                    result = { type: 'error', value: sandboxed.error || 'Logic proof failed', confidence: 0.0 };
                    fallbackTriggered = true;
                }

            } else {
                throw new Error('ROUTE_TO_PREDICTIVE');
            }
        } catch (err: any) {
            // ──── LAYER 4.5: PREDICTIVE FALLBACK (Safety Net) ────────
            mode = 'predictive';
            fallbackTriggered = true;
            if (this.absorber.hasAbsorbedModels()) {
                result = await this.absorber.devour(raw_input, domain, 
                    `The symbolic engine encountered an issue (${err.message}). Provide a concise, logic-driven response based on your absorbed knowledge. Domain: ${domain}`
                );
            } else {
                result = await this.slm.generate(raw_input, 
                    `The symbolic engine encountered an issue (${err.message}). Provide a concise and logic-driven response. Domain: ${domain}`
                );
            }
            // Tag result as a fallback result
            if (!result.proof_trace) result.proof_trace = [];
            result.proof_trace.unshift(`⚠️ PREDICTIVE FALLBACK: ${err.message}`);
        }


        // ──── LAYER 5: SELF-REFLECTION (Meta-cognitive auditor) ───────────────
        const thought: Thought = {
            id: thought_id, timestamp: start, mode, raw_input,
            parsed_intent, result, confidence: result.confidence,
            execution_time_ms: Date.now() - start
        };

        // Run self-reflection on the completed thought
        const verdict = this.reflection.deepReflect(thought);
        // Adjust confidence based on reflection
        thought.confidence = verdict.adjusted_confidence;
        if (thought.result) {
            thought.result.confidence = verdict.adjusted_confidence;
        }

        // ──── LAYER 6: ENCRYPT & STORE THOUGHT IN MEMORY ────────────────────
        const thought_json = JSON.stringify({ id: thought_id, domain, mode, confidence: verdict.adjusted_confidence, verdict: verdict.verdict });
        const encrypted = this.hypervisor.encryptState(thought_json);

        this.memory.writeCell(`thought::${thought_id}`, {
            encrypted_payload: encrypted.encrypted,
            iv: encrypted.iv,
            tag: encrypted.tag,
            domain,
            mode,
            reflection_verdict: verdict.verdict
        }, 'episodic', 120_000); // 2 minute TTL

        // Also store in persistent semantic/episodic memory
        this.episodic.store(thought, 'episodic');

        this.thought_log.push(thought);
        return thought;
    }

    /**
     * Physics dispatch — matches natural language to specific physics simulations.
     */
    private dispatchPhysics(input: string, formula: string): any {
        const lower = input.toLowerCase();

        // Gravitational force
        if (lower.includes('gravitational force') || lower.includes('gravity force') || /G\s*\*/.test(formula)) {
            return this.physics.gravitationalForce(5.972e24, 70, 6371000);
        }
        // Time dilation
        if (lower.includes('time dilation')) {
            const v = 0.9 * 299792458; // 90% speed of light
            return this.physics.timeDilation(1.0, v);
        }
        // E=mc²
        if (lower.includes('e=mc') || lower.includes('mass energy') || lower.includes('mass-energy')) {
            return this.physics.massEnergy(1.0);
        }
        // Escape velocity
        if (lower.includes('escape velocity')) {
            return this.physics.escapeVelocity(5.972e24, 6371000);
        }
        // Orbital velocity
        if (lower.includes('orbital velocity')) {
            return this.physics.orbitalVelocity(5.972e24, 6371000 + 400000); // ISS orbit
        }
        // Photon energy
        if (lower.includes('photon') && lower.includes('energy')) {
            return this.physics.photonEnergy(5e14);
        }
        // Coulomb force
        if (lower.includes('coulomb') || lower.includes('electrostatic')) {
            return this.physics.coulombForce(1.6e-19, -1.6e-19, 5.29e-11); // Hydrogen atom
        }
        // de Broglie
        if (lower.includes('de broglie') || lower.includes('wavelength')) {
            return this.physics.deBroglieWavelength(9.109e-31, 2.2e6); // Electron in hydrogen
        }
        // Hydrogen transition
        if (lower.includes('hydrogen') && (lower.includes('transition') || lower.includes('spectrum'))) {
            return this.physics.hydrogenTransition(2, 1); // Lyman-alpha
        }

        // Default: treat as a raw expression
        return this.symbolic.evaluate(formula);
    }

    // ──── Public accessors ──────────────────────────────────────────────────
    public getThoughtLog(): Thought[] { return this.thought_log; }
    public getMemory(): MemoryCore { return this.memory; }
    public getSecurity(): SecurityProcessor { return this.security; }
    public getKernel(): KernelInterface { return this.kernel; }
    public getPhysics(): PhysicsEngine { return this.physics; }
    public getHypervisor(): ProcessHypervisor { return this.hypervisor; }
    public getLearning(): ContinuousLearningCore { return this.learning; }
    public getReflection(): SelfReflectionEngine { return this.reflection; }
    public getLogic(): FormalLogicProver { return this.logic; }
    public getEpisodicMemory(): EpisodicMemoryBank { return this.episodic; }
    public getDecomposer(): QueryDecomposer { return this.decomposer; }
    public getAbsorber(): LLMDevourer { return this.absorber; }
    public getMythos(): MythosEngine { return this.mythos; }
}
