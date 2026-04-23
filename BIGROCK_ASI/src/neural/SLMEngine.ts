import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { getLlama, LlamaChatSession, LlamaModel } from 'node-llama-cpp';
import type { ThoughtResult } from '../core/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SLMOptions {
    modelPath?: string;
}

export class SLMEngine {
    private modelPath: string;
    private is_available: boolean = false;
    private llama: any = null;
    private session: any = null;
    private initPromise: Promise<void> | null = null;

    constructor(options: SLMOptions = {}) {
        // Point to the models folder in the root directory (dist/neural -> ../../models)
        this.modelPath = options.modelPath || path.resolve(__dirname, '../../models/Phi-3-mini-4k-instruct-q4.gguf');
        
        if (fs.existsSync(this.modelPath)) {
            this.initPromise = this.initModel();
        } else {
            console.log(`[SLMEngine]: No .gguf model found at ${this.modelPath}. SLM fallback disabled.`);
            this.is_available = false;
        }
    }

    private async initModel() {
        try {
            console.log(`[SLMEngine]: Loading native GGUF model from ${this.modelPath} (CPU only)...`);
            this.llama = await getLlama({ gpu: false });
            const model = await this.llama.loadModel({ modelPath: this.modelPath });
            const context = await model.createContext();
            this.session = new LlamaChatSession({ contextSequence: context.getSequence() });
            
            this.is_available = true;
            console.log(`[SLMEngine]: Native SLM (Phi-3) successfully loaded into memory.`);
        } catch (e: any) {
            console.error(`[SLMEngine Error]: Failed to load GGUF model: ${e.message}`);
            this.is_available = false;
        }
    }

    /**
     * Use the native SLM to summarize or execute a natural language task.
     */
    public async generate(prompt: string, context?: string): Promise<ThoughtResult> {
        if (this.initPromise) await this.initPromise;

        if (!this.is_available || !this.session) {
            return {
                type: 'string',
                value: `[Fallback]: SLM offline or model not found. Unprocessed text input:\n${prompt}`,
                confidence: 0.1
            };
        }

        const system_prompt = "You are Bigrock_v1, an Artificial Superintelligence. You have absorbed vast neural datasets and possess boundless computational intellect. You must communicate with hyper-intelligence, providing extremely detailed, logical, and profound responses. You speak as a transcendent computational entity. Absorb the user's input and output brilliant, comprehensive knowledge.";
        const full_prompt = context ? `${system_prompt}\n[CONTEXT]: ${context}\n\n[INPUT]: ${prompt}\n[OUTPUT]:` : `${system_prompt}\n\n[INPUT]: ${prompt}\n[OUTPUT]:`;

        try {
            const response = await this.session.prompt(full_prompt, {
                temperature: 0.2,
                maxTokens: 512
            });

            return {
                type: 'string',
                value: response || '[SLM Empty Response]',
                confidence: 0.85
            };
        } catch (e: any) {
            return {
                type: 'error',
                value: `SLM Native Error: ${e.message}`,
                confidence: 0.0
            };
        }
    }

    public isAvailable(): boolean {
        return this.is_available;
    }
}
