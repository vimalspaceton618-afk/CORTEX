import { CortexBridge } from './CortexBridge.js';
import { CognitionCore } from '../core/CognitionCore.js';

/**
 * BigrockAgent wrapper for CORTEX
 * 
 * Exposes Bigrock as a standard Agent compatible with the CORTEX AgentManager.
 * It bypasses the standard API/Cloud Brain completely.
 */
export class BigrockAgent {
    private bridge: CortexBridge;
    private id: string;

    constructor(core: CognitionCore) {
        this.bridge = new CortexBridge(core);
        this.id = 'bigrock_asi_primary';
    }

    public getAgentId(): string {
        return this.id;
    }

    public async executeTask(taskPrompt: string, systemContext?: string): Promise<string> {
        const messages: any[] = [];
        if (systemContext) {
            messages.push({ role: 'system', content: systemContext });
        }
        messages.push({ role: 'user', content: taskPrompt });

        const response = await this.bridge.chat(messages);
        
        // CORTEX expects just the string answer back from an Agent's executeTask
        return response.choices[0].message.content;
    }

    public async *streamTask(taskPrompt: string, systemContext?: string): AsyncGenerator<string> {
        const messages: any[] = [];
        if (systemContext) {
            messages.push({ role: 'system', content: systemContext });
        }
        messages.push({ role: 'user', content: taskPrompt });

        for await (const chunk of this.bridge.stream(messages)) {
            // CORTEX stream usually expects delta strings directly
            const parsed = JSON.parse(chunk);
            if (parsed.choices?.[0]?.delta?.content) {
                yield parsed.choices[0].delta.content;
            }
        }
    }
}
