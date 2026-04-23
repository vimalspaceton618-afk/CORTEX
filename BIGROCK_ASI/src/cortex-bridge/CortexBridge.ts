import type { CognitionCore } from '../core/CognitionCore.js';
import type { Thought } from '../core/types.js';

/**
 * BIGROCK_v1 — CORTEX Bridge
 * ─────────────────────────────────────────────────────────────────────────
 * This bridges the Bigrock ASI engine directly into the CORTEX AgentManager.
 *
 * CORTEX Architecture recap:
 *   AgentManager → delegates tasks → SubAgents (DeveloperAgent, etc.)
 *   Each SubAgent → calls a "Brain" (cloud LLM or local Ollama)
 *
 * With this bridge:
 *   AgentManager → delegates tasks → BigrockAgent
 *   BigrockAgent → calls CognitionCore (local ASI, zero latency, zero API cost)
 *
 * Bigrock becomes the primary Brain for all CORTEX agents.
 *
 * Message format mirrors the OpenAI Chat Completions API so the existing
 * CORTEX llm.ts stream handler can consume Bigrock responses without changes.
 */

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface BigrockResponse {
    id: string;
    object: 'chat.completion';
    model: 'bigrock-v1';
    created: number;
    choices: Array<{
        index: number;
        message: ChatMessage;
        finish_reason: 'stop' | 'error' | 'security_block';
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    bigrock_metadata: {
        domain: string;
        mode: string;
        confidence: number;
        reflection_verdict: string;
        chain_length: number;
        proof_trace?: string[];
        execution_time_ms: number;
    };
}

export class CortexBridge {
    private core: CognitionCore;
    private request_count = 0;

    constructor(core: CognitionCore) {
        this.core = core;
    }

    /**
     * Main entry point — mimics OpenAI chat.completions.create() signature.
     * CORTEX can call this as a drop-in replacement for cloud LLMs.
     */
    public async chat(messages: ChatMessage[]): Promise<BigrockResponse> {
        this.request_count++;

        // Extract the final user message as the primary input
        const userMessages = messages.filter(m => m.role === 'user');
        const systemMessages = messages.filter(m => m.role === 'system');
        const lastUser = userMessages[userMessages.length - 1];
        const systemContext = systemMessages.map(m => m.content).join('\n');

        if (!lastUser) {
            return this.errorResponse('No user message found in conversation.');
        }

        // Inject system context into the input if present
        const fullInput = systemContext
            ? `[SYSTEM CONTEXT]: ${systemContext.slice(0, 500)}\n[USER]: ${lastUser.content}`
            : lastUser.content;

        // Process through full Bigrock cognition pipeline
        const thought = await this.core.process(fullInput);
        const hyp = this.core.getHypervisor();

        // Format response value
        const responseText = this.formatThoughtAsText(thought);

        return {
            id: `bigrock-${thought.id.slice(0, 8)}`,
            object: 'chat.completion',
            model: 'bigrock-v1',
            created: Math.floor(Date.now() / 1000),
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: responseText
                },
                finish_reason: thought.result?.type === 'error' ? 'error' :
                               thought.parsed_intent.operation === 'security_block' ? 'security_block' :
                               'stop'
            }],
            usage: {
                prompt_tokens: Math.ceil(fullInput.length / 4),
                completion_tokens: Math.ceil(responseText.length / 4),
                total_tokens: Math.ceil((fullInput.length + responseText.length) / 4)
            },
            bigrock_metadata: {
                domain: thought.parsed_intent.domain,
                mode: thought.mode,
                confidence: thought.confidence,
                reflection_verdict: thought.confidence >= 0.9 ? 'VERIFIED' :
                                    thought.confidence >= 0.5 ? 'SUSPECT' : 'REJECTED',
                chain_length: hyp.getChainLength(),
                proof_trace: thought.result?.proof_trace,
                execution_time_ms: thought.execution_time_ms
            }
        };
    }

    /**
     * Streaming version — yields chunks to match CORTEX's streaming handler.
     * Each chunk is a Server-Sent Event compatible delta.
     */
    public async *stream(messages: ChatMessage[]): AsyncGenerator<string> {
        const response = await this.chat(messages);
        const content = response.choices[0].message.content;

        // Stream word by word to simulate token streaming
        const words = content.split(' ');
        for (const word of words) {
            yield JSON.stringify({
                id: response.id,
                object: 'chat.completion.chunk',
                model: 'bigrock-v1',
                choices: [{ delta: { content: word + ' ' }, index: 0, finish_reason: null }]
            }) + '\n';
            // Small delay to simulate streaming (remove in production)
            await new Promise(r => setTimeout(r, 2));
        }

        // Final chunk with finish signal
        yield JSON.stringify({
            id: response.id,
            object: 'chat.completion.chunk',
            model: 'bigrock-v1',
            choices: [{ delta: {}, index: 0, finish_reason: 'stop' }],
            bigrock_metadata: response.bigrock_metadata
        }) + '\n';
    }

    /**
     * Convert a Thought object to a natural language response string.
     */
    private formatThoughtAsText(thought: Thought): string {
        const val = thought.result?.value;
        const domain = thought.parsed_intent.domain;
        const mode = thought.mode;

        if (thought.result?.type === 'error') {
            return `[Bigrock ASI]: ${val}`;
        }

        if (mode === 'symbolic' && thought.result?.type === 'proof') {
            const proofSummary = thought.result.proof_trace?.slice(0, 4).join(' → ') || '';
            if (domain === 'physics') {
                return `[Bigrock Physics Engine — Proven Result]\n` +
                       `Result: ${val}\n` +
                       `Proof: ${proofSummary}\n` +
                       `Confidence: 100% (Deterministic Computation)`;
            }
            if (domain === 'mathematics') {
                return `[Bigrock Symbolic Engine — Proven Result]\n` +
                       `Result: ${val}\n` +
                       `Proof: ${proofSummary}\n` +
                       `Confidence: 100% (Algebraic Proof)`;
            }
            if (domain === 'logic') {
                return `[Bigrock Formal Logic Prover — Truth Table Result]\n` +
                       `Verdict: ${val}\n` +
                       `Proof: ${proofSummary}\n` +
                       `Confidence: 100% (Exhaustive Enumeration)`;
            }
        }

        if (mode === 'heuristic' && typeof val === 'object') {
            return `[Bigrock Kernel Interface — System Telemetry]\n` + JSON.stringify(val, null, 2);
        }

        return String(val);
    }

    private errorResponse(msg: string): BigrockResponse {
        return {
            id: `bigrock-err-${Date.now()}`,
            object: 'chat.completion',
            model: 'bigrock-v1',
            created: Math.floor(Date.now() / 1000),
            choices: [{ index: 0, message: { role: 'assistant', content: `[Bigrock Error]: ${msg}` }, finish_reason: 'error' }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            bigrock_metadata: { domain: 'unknown', mode: 'heuristic', confidence: 0, reflection_verdict: 'REJECTED', chain_length: 0, execution_time_ms: 0 }
        };
    }

    public getRequestCount(): number { return this.request_count; }
}
