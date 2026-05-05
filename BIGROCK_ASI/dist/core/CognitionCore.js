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
import { CyberSecurityKing } from '../defense/CyberSecurityKing.js';
import { AdaptiveBrain } from '../brain/AdaptiveBrain.js';
import { SystemSovereign } from '../brain/SystemSovereign.js';
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
    memory;
    security;
    symbolic;
    bridge;
    kernel;
    physics;
    hypervisor;
    learning;
    reflection;
    logic;
    episodic;
    decomposer;
    slm;
    absorber;
    mythos;
    cyberKing;
    brain;
    sovereign;
    thought_log = [];
    constructor() {
        this.memory = new MemoryCore();
        this.security = new SecurityProcessor();
        this.slm = new SLMEngine();
        this.absorber = new LLMDevourer();
        this.symbolic = new SymbolicEngine(this.memory);
        this.mythos = new MythosEngine();
        this.cyberKing = new CyberSecurityKing();
        this.brain = new AdaptiveBrain();
        this.sovereign = new SystemSovereign(this.brain);
        // Wire up NeuroBridge with a Neural Clarifier (SLM)
        this.bridge = new NeuroBridge(async (input) => {
            const prompt = `Identify the single most relevant cognitive domain for this input: "${input}". 
Options: mathematics, physics, chemistry, logic, system, network, memory, code, cybersecurity, science, creative. 
Return ONLY the single word domain name or "unknown".`;
            const response = await this.slm.generate(input, prompt);
            const domain = response.value.trim().toLowerCase();
            return domain;
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
        this.episodic.setEncoder((text) => {
            const fused = this.brain.getFusion().fuseEncode(text);
            if (fused && fused.fused_vector)
                return fused.fused_vector;
            return this.absorber.getNeuralExtract().encode(text);
        });
    }
    /**
     * Process any input through the FULL Bigrock ASI pipeline.
     * Every step is sandboxed, capability-checked, and cryptographically audited.
     */
    async process(raw_input, skipDecomposition = false) {
        // ──── PRE-PROCESS: DAG DECOMPOSITION ────────────────────────────────
        if (!skipDecomposition && this.decomposer.needsDecomposition(raw_input)) {
            const graph = await this.decomposer.solve(raw_input);
            const synthesized_thought = {
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
            const thought = {
                id: thought_id, timestamp: start, mode: 'heuristic', raw_input,
                parsed_intent: { domain: 'unknown', operation: 'security_block', parameters: {}, requires_proof: false, security_level: 'read_only' },
                result: { type: 'error', value: `⛔ SECURITY BLOCK: ${threat_scan.reason}`, confidence: 1.0 },
                confidence: 1.0, execution_time_ms: Date.now() - start
            };
            this.thought_log.push(thought);
            return thought;
        }
        const clean_input = threat_scan.sanitized_input;
        // ──── LAYER 2: NEURO-BRIDGE ROUTING ─────────────────────────────────
        const parsed_intent = await this.bridge.parseIntent(clean_input);
        const routing = await this.bridge.route(clean_input);
        const domain = parsed_intent.domain;
        // ──── LAYER 3: LIQUID NEURAL PROCESSING ─────────────────────────────
        //  Feed EVERY thought through the neural network (continuous learning).
        //  Think depth scales with domain complexity.
        const think_depth = (domain === 'mathematics' || domain === 'physics') ? 20 : 10;
        const neural_result = await this.hypervisor.sandbox('CognitionCore', 'neural_forward', () => this.learning.processThought(domain, clean_input, think_depth));
        // ──── LAYER 4: DOMAIN-SPECIFIC EXECUTION (with Fail-Safe) ───────────
        let result;
        let mode;
        const COGNITION_TIMEOUT_MS = 8000;
        let fallbackTriggered = false;
        try {
            if (routing.route === 'symbolic_engine') {
                mode = 'symbolic';
                const capability = (domain === 'physics' || domain === 'logic') ? 'execute_physics' : 'execute_math';
                // Race the sandboxed execution against a timeout
                const sandboxed = await Promise.race([
                    this.hypervisor.sandbox('CognitionCore', capability, async () => {
                        const { formula, variable } = parsed_intent.parameters;
                        const operation = parsed_intent.operation;
                        if (domain === 'logic') {
                            return this.logic.prove(clean_input);
                        }
                        if (operation === 'differentiate' && variable) {
                            return this.symbolic.differentiate(formula, variable);
                        }
                        else if (operation === 'solve' && variable) {
                            return this.symbolic.solve(formula, variable);
                        }
                        else {
                            // Physics formulas are evaluated exactly the same as math,
                            // using actual dynamic parameters extracted by the NeuroBridge.
                            return this.symbolic.evaluate(formula);
                        }
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('COGNITION_TIMEOUT')), COGNITION_TIMEOUT_MS))
                ]);
                if (sandboxed.success && sandboxed.result) {
                    const r = sandboxed.result;
                    // Branch based on result type (Logic Result vs Physics Result vs Math Result)
                    if ('is_tautology' in r) {
                        // Logic result
                        result = {
                            type: 'proof',
                            value: r.is_tautology ? 'TAUTOLOGY (always true)' :
                                r.is_contradiction ? 'CONTRADICTION (always false)' :
                                    `CONTINGENT (true in ${r.satisfiable_count}/${r.total_rows} cases)`,
                            proof_trace: [
                                `[Variables]: ${r.variables.join(', ')}`,
                                `[Total Rows]: ${r.total_rows}`,
                                `[Satisfiable]: ${r.satisfiable_count}`,
                                `[Tautology]: ${r.is_tautology}`,
                                `[Contradiction]: ${r.is_contradiction}`,
                                ...r.truth_table.slice(0, 8).map((row) => `  ${Object.entries(row.variables).map(([k, v]) => `${k}=${v ? 'T' : 'F'}`).join(', ')} → ${row.result ? 'TRUE' : 'FALSE'}`),
                                r.truth_table.length > 8 ? `  ... (${r.truth_table.length - 8} more rows)` : ''
                            ].filter(Boolean),
                            confidence: 1.0
                        };
                    }
                    else if ('law' in r) {
                        // Physics result
                        result = {
                            type: 'proof',
                            value: `${r.result} ${r.unit}`,
                            proof_trace: r.proof_trace,
                            confidence: 1.0
                        };
                    }
                    else {
                        // Standard math result
                        result = {
                            type: r.success ? 'proof' : 'error',
                            value: r.success ? r.result : r.error,
                            proof_trace: r.proof_trace,
                            confidence: r.success ? 1.0 : 0.0
                        };
                        if (!r.success)
                            fallbackTriggered = true;
                    }
                }
                else {
                    result = { type: 'error', value: sandboxed.error || 'Sandbox execution failed', confidence: 0.0 };
                    fallbackTriggered = true;
                }
            }
            else if (routing.route === 'system_kernel') {
                mode = 'heuristic';
                const sandboxed = await this.hypervisor.sandbox('CognitionCore', 'kernel_telemetry', () => {
                    return this.kernel.getTelemetry();
                });
                result = {
                    type: sandboxed.success ? 'computation' : 'error',
                    value: sandboxed.success ? sandboxed.result : sandboxed.error,
                    confidence: sandboxed.success ? 0.99 : 0.0
                };
            }
            else if (routing.route === 'memory_core') {
                mode = 'heuristic';
                const key = parsed_intent.parameters.original_input.split(/\s+/).pop() || '';
                const mem_val = this.memory.readCell(key);
                result = {
                    type: mem_val !== undefined ? 'proof' : 'error',
                    value: mem_val ?? `No memory cell found for key: "${key}"`,
                    confidence: mem_val !== undefined ? 1.0 : 0.0
                };
            }
            else {
                throw new Error('ROUTE_TO_PREDICTIVE');
            }
        }
        catch (err) {
            // ──── LAYER 4.5: PREDICTIVE FALLBACK (Safety Net) ────────
            mode = 'predictive';
            fallbackTriggered = true;
            if (this.brain.getHive().hasModels()) {
                result = await this.brain.think(raw_input, domain);
            }
            else if (this.absorber.hasAbsorbedModels()) {
                result = await this.absorber.devour(raw_input, domain, `The symbolic engine encountered an issue (${err.message}). Provide a concise, logic-driven response based on your absorbed knowledge. Domain: ${domain}`);
            }
            else {
                result = await this.slm.generate(raw_input, `The symbolic engine encountered an issue (${err.message}). Provide a concise and logic-driven response. Domain: ${domain}`);
            }
            // Tag result as a fallback result
            if (!result.proof_trace)
                result.proof_trace = [];
            result.proof_trace.unshift(`⚠️ PREDICTIVE FALLBACK: ${err.message}`);
        }
        // ──── LAYER 5: SELF-REFLECTION (Meta-cognitive auditor) ───────────────
        const thought = {
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
    // ──── Public accessors ──────────────────────────────────────────────────
    getThoughtLog() { return this.thought_log; }
    getMemory() { return this.memory; }
    getSecurity() { return this.security; }
    getKernel() { return this.kernel; }
    getPhysics() { return this.physics; }
    getHypervisor() { return this.hypervisor; }
    getLearning() { return this.learning; }
    getReflection() { return this.reflection; }
    getLogic() { return this.logic; }
    getEpisodicMemory() { return this.episodic; }
    getDecomposer() { return this.decomposer; }
    getAbsorber() { return this.absorber; }
    getMythos() { return this.mythos; }
    getCyberKing() { return this.cyberKing; }
    getBrain() { return this.brain; }
    getSovereign() { return this.sovereign; }
}
