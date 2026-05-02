import { CortexBridge } from './CortexBridge.js';
/**
 * BigrockAgent wrapper for CORTEX
 *
 * Exposes Bigrock as a standard Agent compatible with the CORTEX AgentManager.
 * It bypasses the standard API/Cloud Brain completely.
 */
export class BigrockAgent {
    bridge;
    id;
    constructor(core) {
        this.bridge = new CortexBridge(core);
        this.id = 'bigrock_asi_primary';
    }
    getAgentId() {
        return this.id;
    }
    async executeTask(taskPrompt, systemContext) {
        const messages = [];
        if (systemContext) {
            messages.push({ role: 'system', content: systemContext });
        }
        messages.push({ role: 'user', content: taskPrompt });
        const response = await this.bridge.chat(messages);
        // CORTEX expects just the string answer back from an Agent's executeTask
        return response.choices[0].message.content;
    }
    async *streamTask(taskPrompt, systemContext) {
        const messages = [];
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
