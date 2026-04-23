import { LiquidNeuralNetwork, type LNNConfig, type LNNState } from './LiquidNeuralNetwork.js';

/**
 * BIGROCK_v1 — Continuous Learning Core (CLC)
 * ─────────────────────────────────────────────────────────────────────────
 * The meta-learning supervisor for the Liquid Neural Network.
 *
 * This module does what NO standard LLM can do:
 *   1. ONLINE LEARNING: Continuously adapts during inference (not just training)
 *   2. DOMAIN SPECIALIZATION: Maintains separate neural circuits for different
 *      cognitive domains (math, physics, language, system)
 *   3. REWARD-FREE LEARNING: Uses homeostatic plasticity — the network
 *      self-regulates its activity to maintain healthy entropy levels
 *   4. PATTERN CONSOLIDATION: Short-lived patterns that are repeatedly
 *      activated get "consolidated" into long-term memory-like weights
 *
 * Standard LLMs are frozen after training.
 * Bigrock EVOLVES with every interaction.
 */

export interface DomainCircuit {
    name: string;
    network: LiquidNeuralNetwork;
    activation_count: number;
    last_state: LNNState;
    created_at: number;
}

export interface LearningMetrics {
    total_thoughts_processed: number;
    domains_active: string[];
    global_entropy: number;
    network_energy: number;
    synaptic_updates: number;
}

export class ContinuousLearningCore {
    private circuits: Map<string, DomainCircuit> = new Map();
    private thought_count = 0;
    private default_config: LNNConfig = {
        input_size: 16,
        hidden_size: 64,
        output_size: 8,
        dt: 0.01,
        tau_range: [0.5, 5.0],
        plasticity_rate: 0.001
    };

    constructor() {
        // Boot default domain circuits
        this.createCircuit('mathematics');
        this.createCircuit('physics');
        this.createCircuit('logic');
        this.createCircuit('language');
        this.createCircuit('system');
        this.createCircuit('meta_cognition');  // Thinks about thinking
    }

    /** Create a fresh neural circuit for a cognitive domain */
    public createCircuit(domain: string, config?: Partial<LNNConfig>): DomainCircuit {
        const mergedConfig: LNNConfig = { ...this.default_config, ...config };
        const network = new LiquidNeuralNetwork(mergedConfig);
        const circuit: DomainCircuit = {
            name: domain,
            network,
            activation_count: 0,
            last_state: network.getState(),
            created_at: Date.now()
        };
        this.circuits.set(domain, circuit);
        return circuit;
    }

    /**
     * Encode an input string into a numerical feature vector.
     * This is a simple statistical encoding. In the future Rust port,
     * this will be replaced by a proper tokenizer + embedding layer.
     */
    private encodeInput(input: string, size: number): number[] {
        const features = new Array(size).fill(0);

        // Feature 0-3: Basic statistical properties
        features[0] = Math.min(input.length / 500, 1.0);                       // Normalized length
        features[1] = (input.match(/[0-9]/g) || []).length / input.length;      // Numeric density
        features[2] = (input.match(/[\+\-\*\/\^\=]/g) || []).length / 20;       // Operator density
        features[3] = (input.match(/[A-Z]/g) || []).length / input.length;      // Capitalization ratio

        // Feature 4-7: Physics/Math domain signals
        features[4] = /\b(force|mass|velocity|energy|momentum)\b/i.test(input) ? 0.9 : 0.1;
        features[5] = /\b(derivative|integral|solve|matrix|equation)\b/i.test(input) ? 0.9 : 0.1;
        features[6] = /\b(if|then|prove|theorem|axiom)\b/i.test(input) ? 0.9 : 0.1;
        features[7] = /\b(quantum|relativity|photon|electron|atom)\b/i.test(input) ? 0.9 : 0.1;

        // Feature 8-11: System/Network signals
        features[8] = /\b(file|process|cpu|memory|disk)\b/i.test(input) ? 0.9 : 0.1;
        features[9] = /\b(network|ip|tcp|http|dns)\b/i.test(input) ? 0.9 : 0.1;

        // Feature 10-15: Character trigram hash features (distributional)
        for (let i = 0; i < Math.min(input.length - 2, 6); i++) {
            const trigram = input.substring(i, i + 3);
            const hash = trigram.charCodeAt(0) * 97 + trigram.charCodeAt(1) * 31 + trigram.charCodeAt(2);
            features[10 + i] = (hash % 1000) / 1000;
        }

        return features;
    }

    /**
     * Process a thought through the appropriate domain circuit.
     * The LNN evolves its state and learns from the input pattern.
     */
    public processThought(domain: string, input: string, think_depth: number = 10): {
        domain: string;
        output_activations: number[];
        state: LNNState;
        circuit_age: number;
    } {
        let circuit = this.circuits.get(domain);
        if (!circuit) {
            // Auto-create circuits for new domains (self-expansion)
            circuit = this.createCircuit(domain);
        }

        const encoded = this.encodeInput(input, this.default_config.input_size);
        const outputs = circuit.network.think(encoded, think_depth, true);

        circuit.activation_count++;
        circuit.last_state = circuit.network.getState();
        this.thought_count++;

        // Homeostatic regulation: if entropy is too low (network collapsed),
        // inject small perturbations to re-energize
        if (circuit.last_state.entropy < 1.0) {
            const noise = encoded.map(v => v + (Math.random() - 0.5) * 0.05);
            circuit.network.think(noise, 3, true);
            circuit.last_state = circuit.network.getState();
        }

        return {
            domain,
            output_activations: outputs,
            state: circuit.last_state,
            circuit_age: circuit.activation_count
        };
    }

    /**
     * Meta-cognition pass — the meta_cognition circuit processes
     * the outputs of OTHER circuits to form higher-order reasoning.
     */
    public metaThink(primary_outputs: number[]): number[] {
        const meta_circuit = this.circuits.get('meta_cognition');
        if (!meta_circuit) return primary_outputs;

        const padded = [...primary_outputs];
        while (padded.length < this.default_config.input_size) padded.push(0);

        return meta_circuit.network.think(padded.slice(0, this.default_config.input_size), 20, true);
    }

    /** Get global learning metrics */
    public getMetrics(): LearningMetrics {
        let global_entropy = 0;
        let global_energy = 0;
        let total_synapses = 0;
        const domains: string[] = [];

        for (const [name, circuit] of this.circuits) {
            domains.push(`${name}(${circuit.activation_count})`);
            global_entropy += circuit.last_state.entropy;
            global_energy += circuit.last_state.total_energy;
            total_synapses += circuit.network.getSynapseCount();
        }

        return {
            total_thoughts_processed: this.thought_count,
            domains_active: domains,
            global_entropy: global_entropy / this.circuits.size,
            network_energy: global_energy,
            synaptic_updates: total_synapses
        };
    }

    /** Get count of domain circuits */
    public getCircuitCount(): number { return this.circuits.size; }
    /** Check if a domain has been activated */
    public hasDomain(domain: string): boolean { return this.circuits.has(domain); }
}
