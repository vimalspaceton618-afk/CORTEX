import { ModelHive } from '../absorb/ModelHive.js';
import { CognitiveRouter } from '../absorb/CognitiveRouter.js';
import { NeuralFusionCore } from '../absorb/NeuralFusionCore.js';
import { DomainProber } from '../absorb/DomainProber.js';
import { AbsorptionFuser } from '../absorb/AbsorptionFuser.js';
import { NeuralExtract } from '../absorb/NeuralExtract.js';
import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import fs from 'fs';
export class AdaptiveBrain {
    hive;
    router;
    fusion;
    prober;
    response_fuser;
    llama = null; // Node-llama-cpp singleton
    is_fusing = false;
    boot_time;
    constructor() {
        this.hive = new ModelHive();
        this.router = new CognitiveRouter();
        this.fusion = new NeuralFusionCore();
        this.prober = new DomainProber();
        this.response_fuser = new AbsorptionFuser();
        this.boot_time = Date.now();
    }
    /**
     * Boot the brain.
     * 1. Init Node-llama-cpp
     * 2. Load cached profiles from ModelHive
     * 3. Set up auto-absorption watcher
     */
    async wake() {
        console.log(`\n[AdaptiveBrain]: 🧠 Waking up...`);
        this.llama = await getLlama();
        // 1. Initialise Hive (loads WARM profiles)
        this.hive.initialise();
        // 2. Wire up auto-absorption
        this.hive.onNewModel(async (filepath) => {
            console.log(`[AdaptiveBrain]: Auto-absorbing new drop: ${filepath}`);
            await this.eat(filepath, true);
        });
        console.log(`[AdaptiveBrain]: 🧠 Brain online. CIQ: ${this.hive.getCollectiveIQ()}`);
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  THINK — The Primary Cognition Pipeline
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Think about a query using the full AdaptiveBrain pipeline.
     */
    async think(query, domain_hint, override_strategy) {
        const start = Date.now();
        if (!this.hive.hasModels()) {
            return {
                type: 'error',
                value: 'AdaptiveBrain has zero absorbed models. Please drop a .gguf into the models directory.',
                confidence: 0,
            };
        }
        // 1. ROUTING DECISION
        const decision = this.router.route(query, this.hive.getActiveModels(), override_strategy);
        console.log(`\n[AdaptiveBrain]: 🧠 Thinking... Strategy: ${decision.strategy.toUpperCase()}`);
        decision.trace.forEach((t) => console.log(`  ${t}`));
        // 2. EXECUTE BASED ON STRATEGY
        let result;
        try {
            switch (decision.strategy) {
                case 'single_champion':
                    result = await this.executeSingle(query, decision.primary_model.filename);
                    break;
                case 'dual_blend':
                    result = await this.executeBlend(query, decision.primary_model.filename, decision.secondary_models[0].filename);
                    break;
                case 'consensus_panel':
                    const models = decision.all_models.map((m) => m.filename);
                    result = await this.executeConsensus(query, models);
                    break;
                case 'specialist_chain':
                    result = await this.executeChain(query, decision.primary_model.filename, decision.secondary_models[0]?.filename);
                    break;
                case 'adaptive':
                default:
                    result = await this.executeSingle(query, decision.primary_model.filename);
                    break;
            }
        }
        catch (e) {
            console.error(`[AdaptiveBrain]: Execution error: ${e.message}`);
            // Fallback to absolute fastest single champion if multi-model failed
            if (decision.strategy !== 'single_champion') {
                console.log(`[AdaptiveBrain]: Falling back to single champion...`);
                result = await this.executeSingle(query, decision.primary_model.filename);
                result.proof_trace = result.proof_trace || [];
                result.proof_trace.unshift(`⚠️ Router strategy failed, fell back to single champion.`);
            }
            else {
                return { type: 'error', value: `Model failure: ${e.message}`, confidence: 0 };
            }
        }
        // 3. CONTINUOUS FUSION (Background)
        // Ensure NeuralFusionCore processes the new thoughts for continuous alignment
        if (!this.is_fusing) {
            this.is_fusing = true;
            this.fusion.fuseEncode(query);
            this.is_fusing = false;
        }
        return result;
    }
    // ─── Execution Implementations ─────────────────────────────────────────────
    async executeSingle(query, filename) {
        const session = await this.loadModelSession(filename);
        const response = await session.prompt(query, { temperature: 0.1, maxTokens: 2048 });
        return {
            type: 'computation',
            value: response,
            confidence: 0.85,
            proof_trace: [`[Source]: ${filename} (Single Champion)`]
        };
    }
    async executeBlend(query, model1, model2) {
        const [res1, res2] = await Promise.all([
            this.executeSingle(query, model1),
            this.executeSingle(query, model2)
        ]);
        const m1_score = this.hive.get(model1)?.cpi || 0.6;
        const m2_score = this.hive.get(model2)?.cpi || 0.4;
        const fused = this.response_fuser.fuse([
            { model_name: model1, response: res1.value, domain_score: m1_score, latency_ms: 0 },
            { model_name: model2, response: res2.value, domain_score: m2_score, latency_ms: 0 }
        ], 'weighted_blend');
        return {
            type: 'computation',
            value: fused.fused_response,
            confidence: 0.9,
            proof_trace: [
                `[Blend]: ${model1} (CPI: ${m1_score.toFixed(2)}) + ${model2} (CPI: ${m2_score.toFixed(2)})`,
                `[Model 1 Raw]: ${res1.value.substring(0, 100)}...`,
                `[Model 2 Raw]: ${res2.value.substring(0, 100)}...`
            ]
        };
    }
    async executeConsensus(query, models) {
        const promises = models.map(m => this.executeSingle(query, m));
        const results = await Promise.all(promises);
        const inputs = models.map((m, i) => {
            const score = this.hive.get(m)?.cpi || (1.0 / models.length);
            return {
                model_name: m,
                response: results[i].value,
                domain_score: score,
                latency_ms: 0
            };
        });
        const fused = this.response_fuser.fuse(inputs, 'consensus');
        return {
            type: 'proof',
            value: fused.fused_response,
            confidence: 0.95,
            proof_trace: [
                `[Consensus Panel]: ${models.join(', ')}`,
                ...inputs.map(i => `[${i.model_name} (CPI: ${i.domain_score.toFixed(2)})]: ${i.response.substring(0, 80)}...`)
            ]
        };
    }
    async executeChain(query, reasoner, specialist) {
        // Step 1: Reasoner plans
        const plan_query = `Analyze this task and write a step-by-step execution plan. Do not execute it, just plan: ${query}`;
        const plan_res = await this.executeSingle(plan_query, reasoner);
        // Step 2: Specialist executes
        const exec_query = `Follow this plan to complete the task:\n\nPLAN:\n${plan_res.value}\n\nTASK: ${query}`;
        const exec_res = await this.executeSingle(exec_query, specialist);
        return {
            type: 'proof',
            value: exec_res.value,
            confidence: 0.92,
            proof_trace: [
                `[Specialist Chain]: Reasoner (${reasoner}) → Specialist (${specialist})`,
                `[Plan]: ${plan_res.value}`
            ]
        };
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  EAT — Absorb a single model
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Absorb a new model from disk.
     * 1. Probe domains
     * 2. Deep extract neural weights
     * 3. Ingest into ModelHive
     */
    async eat(filepath, force = false) {
        const filename = filepath.split(/[\/\\]/).pop();
        console.log(`\n[AdaptiveBrain]: 🍽️ Eating model: ${filename}`);
        // 1. Check if already known
        if (!force && this.hive.get(filename)) {
            console.log(`[AdaptiveBrain]: Model already in hive. Use force=true to re-absorb.`);
            return;
        }
        const stat = fs.statSync(filepath);
        // 2. Load model
        let model;
        try {
            model = await this.llama.loadModel({ modelPath: filepath });
        }
        catch (e) {
            throw new Error(`Failed to load GGUF binary: ${e.message}`);
        }
        const context = await model.createContext();
        const session = new LlamaChatSession({ contextSequence: context.getSequence() });
        // 3. Probe domains
        console.log(`[AdaptiveBrain]: 🔍 Probing cognitive domains...`);
        const all_results = [];
        for (const domain of this.prober.getDomains()) {
            const probes = this.prober.getProbesForDomain(domain);
            for (const probe of probes) {
                const response = await session.prompt(`${probe.system_context || ''}\n\n${probe.question}`, { maxTokens: 100 });
                const result = this.prober.scoreResponse(probe, response);
                all_results.push(result);
            }
        }
        const domain_scores = this.prober.aggregateDomainScores(all_results);
        const overall_power = domain_scores.reduce((s, d) => s + d.score, 0) / (domain_scores.length || 1);
        const top_domain = domain_scores.length > 0 ? domain_scores[0].domain : 'unknown';
        const profile = {
            filename,
            filepath,
            size_bytes: stat.size,
            file_mtime: stat.mtimeMs,
            domain_scores,
            overall_power: parseFloat(overall_power.toFixed(3)),
            top_domain,
            absorbed_at: Date.now(),
            probe_count: all_results.length,
            absorption_time_ms: 0,
            total_queries_served: 0
        };
        // 4. Deep Extract (NeuralFusion)
        console.log(`[AdaptiveBrain]: 🧬 Extracting neural weights...`);
        const extractor = new NeuralExtract(filepath.substring(0, filepath.lastIndexOf('/')) || filepath.substring(0, filepath.lastIndexOf('\\')));
        await extractor.extractFromGGUF(filepath);
        // 5. Register in Hive & FusionCore
        const entry = this.hive.registerModel(profile, null, null); // Registers as WARM initially
        await this.fusion.ingest(entry, extractor);
        this.hive.flush();
        // Cleanup probing session
        await model.dispose();
        console.log(`[AdaptiveBrain]: 🚀 ${filename} fully absorbed! CIQ +${entry.cpi}`);
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  MODEL LIFECYCLE
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Ensure a model is loaded into HOT tier. Unload others if memory ceiling hit.
     */
    async loadModelSession(filename) {
        let entry = this.hive.get(filename);
        if (!entry)
            throw new Error(`Model ${filename} not found in hive.`);
        // Already HOT?
        if (entry.tier === 'hot' && entry.session) {
            this.hive.touch(filename);
            return entry.session;
        }
        // Need to load. Check memory.
        if (!this.hive.canLoadModel(entry.size_bytes)) {
            console.log(`[AdaptiveBrain]: Memory tight. Evicting oldest HOT model...`);
            const hot_models = this.hive.getHotModels().sort((a, b) => a.last_accessed - b.last_accessed);
            if (hot_models.length > 0) {
                const to_evict = hot_models[0];
                await to_evict.llama_instance?.dispose();
                this.hive.demoteToWarm(to_evict.filename);
            }
        }
        console.log(`[AdaptiveBrain]: 🔄 Loading ${filename} into HOT tier...`);
        const model = await this.llama.loadModel({ modelPath: entry.filepath });
        const context = await model.createContext();
        const session = new LlamaChatSession({ contextSequence: context.getSequence() });
        this.hive.promoteToHot(filename, session, model);
        this.hive.touch(filename);
        return session;
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  ACCESSORS
    // ═══════════════════════════════════════════════════════════════════════════
    getHive() { return this.hive; }
    getRouter() { return this.router; }
    getFusion() { return this.fusion; }
    getStatus() {
        return {
            collective_iq: this.hive.getCollectiveIQ(),
            hive_status: this.hive.getStatus(),
            fusion_status: this.fusion.getStatus(),
            is_fusing: this.is_fusing,
            uptime_ms: Date.now() - this.boot_time
        };
    }
}
