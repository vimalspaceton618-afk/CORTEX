/**
 * BIGROCK_v1 — Liquid Neural Network (LNN) Core
 * ─────────────────────────────────────────────────────────────────────────
 * THIS IS NOT A STANDARD NEURAL NETWORK.
 * 
 * Standard AI (Claude, GPT, Llama):
 *   - Fixed weights after training. The model is FROZEN.
 *   - Uses backpropagation: forward pass → loss → backward pass → weight update.
 *   - After deployment, it NEVER learns. It just replays patterns.
 *
 * Bigrock Liquid Neural Network:
 *   - Weights are CONTINUOUS DIFFERENTIAL EQUATIONS that change with TIME.
 *   - Inspired by C. elegans neurobiology and MIT CSAIL Liquid Time-Constant (LTC) networks.
 *   - Neurons are not static activation functions — they are ODE solvers.
 *   - The network's state evolves continuously, like fluid dynamics.
 *   - It can learn during inference WITHOUT backpropagation.
 *
 * Mathematical Foundation:
 *   dx/dt = -x/τ + f(x, I, θ) · σ(x)
 *   where:
 *     x   = neuron hidden state vector
 *     τ   = time constant (controls how fast the neuron responds)
 *     I   = input stimulus
 *     θ   = learnable synaptic parameters
 *     σ   = nonlinear gating function (sigmoid / tanh)
 *     f() = synaptic interaction function
 *
 * This ODE is solved at each timestep using Runge-Kutta 4th order (RK4).
 */

// ─── Neuron Types ──────────────────────────────────────────────────────────────

export interface LiquidNeuron {
    id: number;
    state: number;             // x(t): current hidden state
    tau: number;               // τ: time constant (leak rate)
    bias: number;              // baseline activation
    activation: 'sigmoid' | 'tanh' | 'relu' | 'gelu';
}

export interface Synapse {
    from: number;              // source neuron ID
    to: number;                // target neuron ID
    weight: number;            // w: synaptic strength
    plasticity: number;        // η: learning rate (Hebbian plasticity coefficient)
    last_pre_activation: number;
    last_post_activation: number;
}

export interface LNNConfig {
    input_size: number;
    hidden_size: number;
    output_size: number;
    dt: number;                // time step for ODE solver (smaller = more precise)
    tau_range: [number, number]; // min/max for time constants
    plasticity_rate: number;   // global Hebbian learning rate
}

export interface LNNState {
    step: number;
    total_energy: number;      // sum of |x_i|^2 — measures how "active" the network is
    entropy: number;           // information entropy of the state vector
}

// ─── Activation Functions ──────────────────────────────────────────────────────

function sigmoid(x: number): number { return 1.0 / (1.0 + Math.exp(-x)); }
function tanh_act(x: number): number { return Math.tanh(x); }
function relu(x: number): number { return Math.max(0, x); }
function gelu(x: number): number { return 0.5 * x * (1.0 + Math.tanh(Math.sqrt(2.0 / Math.PI) * (x + 0.044715 * x * x * x))); }

function activate(x: number, fn: LiquidNeuron['activation']): number {
    switch (fn) {
        case 'sigmoid': return sigmoid(x);
        case 'tanh':    return tanh_act(x);
        case 'relu':    return relu(x);
        case 'gelu':    return gelu(x);
    }
}

// ─── Liquid Neural Network ─────────────────────────────────────────────────────

export class LiquidNeuralNetwork {
    private neurons: LiquidNeuron[] = [];
    private synapses: Synapse[] = [];
    private config: LNNConfig;
    private step_count = 0;

    constructor(config: LNNConfig) {
        this.config = config;
        this.initializeTopology();
    }

    /**
     * Initialize the network with random small weights, varied time constants,
     * and sparse connectivity to allow emergent behavior.
     */
    private initializeTopology(): void {
        const total = this.config.input_size + this.config.hidden_size + this.config.output_size;

        // Create neurons
        for (let i = 0; i < total; i++) {
            const tau = this.config.tau_range[0] + Math.random() * (this.config.tau_range[1] - this.config.tau_range[0]);
            const activations: LiquidNeuron['activation'][] = ['sigmoid', 'tanh', 'relu', 'gelu'];
            this.neurons.push({
                id: i,
                state: (Math.random() - 0.5) * 0.01,  // tiny initial state
                tau,
                bias: (Math.random() - 0.5) * 0.1,
                activation: activations[Math.floor(Math.random() * activations.length)]
            });
        }

        // Create sparse synaptic connections
        // Input → Hidden
        for (let i = 0; i < this.config.input_size; i++) {
            for (let h = 0; h < this.config.hidden_size; h++) {
                if (Math.random() < 0.7) { // 70% connectivity (sparse)
                    const hid = this.config.input_size + h;
                    this.synapses.push({
                        from: i, to: hid,
                        weight: (Math.random() - 0.5) * 0.3,
                        plasticity: this.config.plasticity_rate,
                        last_pre_activation: 0,
                        last_post_activation: 0
                    });
                }
            }
        }

        // Hidden → Hidden (recurrent, very sparse)
        for (let h1 = 0; h1 < this.config.hidden_size; h1++) {
            for (let h2 = 0; h2 < this.config.hidden_size; h2++) {
                if (h1 !== h2 && Math.random() < 0.25) { // 25% sparse recurrence
                    this.synapses.push({
                        from: this.config.input_size + h1,
                        to: this.config.input_size + h2,
                        weight: (Math.random() - 0.5) * 0.15,
                        plasticity: this.config.plasticity_rate * 0.5,
                        last_pre_activation: 0,
                        last_post_activation: 0
                    });
                }
            }
        }

        // Hidden → Output
        for (let h = 0; h < this.config.hidden_size; h++) {
            for (let o = 0; o < this.config.output_size; o++) {
                if (Math.random() < 0.8) { // 80% connectivity
                    this.synapses.push({
                        from: this.config.input_size + h,
                        to: this.config.input_size + this.config.hidden_size + o,
                        weight: (Math.random() - 0.5) * 0.3,
                        plasticity: this.config.plasticity_rate,
                        last_pre_activation: 0,
                        last_post_activation: 0
                    });
                }
            }
        }
    }

    /**
     * ODE Right-hand side: dx_i/dt = -x_i/τ_i + Σ_j(w_ij · σ(x_j)) + bias_i + input_i
     * This is the core mathematical engine of the LNN.
     */
    private computeDerivatives(states: number[], inputs: number[]): number[] {
        const derivs = new Array(this.neurons.length).fill(0);

        for (let i = 0; i < this.neurons.length; i++) {
            const n = this.neurons[i];
            // Leak term: -x/τ (exponential decay towards zero)
            derivs[i] = -states[i] / n.tau;
            // Bias
            derivs[i] += n.bias;
        }

        // Input injection (first N neurons are input layer)
        for (let i = 0; i < Math.min(inputs.length, this.config.input_size); i++) {
            derivs[i] += inputs[i] / this.neurons[i].tau;
        }

        // Synaptic contributions: w_ij * activation(x_j)
        for (const syn of this.synapses) {
            const preActivation = activate(states[syn.from], this.neurons[syn.from].activation);
            derivs[syn.to] += syn.weight * preActivation;
        }

        return derivs;
    }

    /**
     * Runge-Kutta 4th Order ODE Solver (RK4)
     * ─────────────────────────────────────────
     * This is the CORE PHYSICS of Bigrock.
     * Instead of backpropagation (gradient descent), we solve a
     * differential equation that governs how neuron states evolve
     * over continuous time.
     *
     *   k1 = f(tn, yn)
     *   k2 = f(tn + dt/2, yn + dt*k1/2)
     *   k3 = f(tn + dt/2, yn + dt*k2/2)
     *   k4 = f(tn + dt, yn + dt*k3)
     *   yn+1 = yn + (dt/6)(k1 + 2k2 + 2k3 + k4)
     */
    private rk4Step(states: number[], inputs: number[], dt: number): number[] {
        const n = states.length;

        const k1 = this.computeDerivatives(states, inputs);

        const s2 = states.map((s, i) => s + dt * k1[i] / 2);
        const k2 = this.computeDerivatives(s2, inputs);

        const s3 = states.map((s, i) => s + dt * k2[i] / 2);
        const k3 = this.computeDerivatives(s3, inputs);

        const s4 = states.map((s, i) => s + dt * k3[i]);
        const k4 = this.computeDerivatives(s4, inputs);

        return states.map((s, i) =>
            s + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
        );
    }

    /**
     * Hebbian Plasticity Update (BP-free learning)
     * ─────────────────────────────────────────────
     * "Neurons that fire together, wire together."
     *
     * Δw_ij = η · pre_activation_j · post_activation_i
     *
     * This is completely different from backpropagation:
     *   - No loss function
     *   - No gradient computation
     *   - No backward pass at all
     *   - Learning happens locally at each synapse based on correlated activity
     */
    private hebbianUpdate(): void {
        for (const syn of this.synapses) {
            const pre = activate(this.neurons[syn.from].state, this.neurons[syn.from].activation);
            const post = activate(this.neurons[syn.to].state, this.neurons[syn.to].activation);

            // Oja's rule variant (prevents unbounded weight growth)
            const delta = syn.plasticity * (pre * post - post * post * syn.weight);
            syn.weight += delta;

            // Clamp weights to prevent saturation
            syn.weight = Math.max(-2.0, Math.min(2.0, syn.weight));

            syn.last_pre_activation = pre;
            syn.last_post_activation = post;
        }
    }

    /**
     * Forward pass — evolve the network state for one timestep.
     * Returns the output layer activations.
     */
    public forward(inputs: number[], learn: boolean = true): number[] {
        // Extract current states
        let states = this.neurons.map(n => n.state);

        // Solve ODE using RK4
        states = this.rk4Step(states, inputs, this.config.dt);

        // Write back
        for (let i = 0; i < this.neurons.length; i++) {
            this.neurons[i].state = states[i];
        }

        // Hebbian plasticity (BP-free online learning)
        if (learn) {
            this.hebbianUpdate();
        }

        this.step_count++;

        // Extract output activations
        const outputStart = this.config.input_size + this.config.hidden_size;
        return this.neurons
            .slice(outputStart, outputStart + this.config.output_size)
            .map(n => activate(n.state, n.activation));
    }

    /**
     * Run the network for multiple timesteps to let the ODE settle.
     * More steps = deeper reasoning (analogous to "thinking time").
     */
    public think(inputs: number[], steps: number = 10, learn: boolean = true): number[] {
        let outputs: number[] = [];
        for (let s = 0; s < steps; s++) {
            outputs = this.forward(inputs, learn);
        }
        return outputs;
    }

    /** Get a snapshot of the network's global state */
    public getState(): LNNState {
        const states = this.neurons.map(n => n.state);
        const totalEnergy = states.reduce((sum, s) => sum + s * s, 0);

        // Shannon entropy of activation distribution
        const activations = states.map(s => Math.abs(sigmoid(s)));
        const total = activations.reduce((a, b) => a + b, 0) || 1;
        const probs = activations.map(a => a / total);
        const entropy = -probs.reduce((sum, p) => p > 0 ? sum + p * Math.log2(p) : sum, 0);

        return {
            step: this.step_count,
            total_energy: totalEnergy,
            entropy
        };
    }

    /** Number of neurons */
    public getNeuronCount(): number { return this.neurons.length; }
    /** Number of synaptic connections */
    public getSynapseCount(): number { return this.synapses.length; }
    /** Export full weight matrix for serialization */
    public exportWeights(): { from: number; to: number; weight: number }[] {
        return this.synapses.map(s => ({ from: s.from, to: s.to, weight: s.weight }));
    }
}
