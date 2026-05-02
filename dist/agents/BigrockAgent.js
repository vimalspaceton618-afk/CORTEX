import { BaseAgent } from '../core/agent/BaseAgent.js';
import { CortexKernel } from '../core/CortexKernel.js';
export class BigrockAgent extends BaseAgent {
    constructor() {
        super("BigrockAgent", "Local Sovereign AI engine. Use this for deterministic logic, formal mathematical proofs, and high-security reasoning tasks. It processes tasks locally without cloud dependency.");
    }
    setupTools() {
        // BigrockAgent processes directly via local cognition core, no standard tools needed.
    }
    async *run(input, requestConfirmation) {
        if (!CortexKernel.isBooted()) {
            yield "[BigrockAgent] ⛔ CortexKernel not booted. Local cognition is offline.\n";
            return;
        }
        yield "[BigrockAgent] Routing thought to Local Cognition Core...\n";
        try {
            const thought = await CortexKernel.get().think(input);
            const formatted = CortexKernel.get().formatThought(thought);
            yield formatted + '\n';
        }
        catch (e) {
            yield `[BigrockAgent] ⛔ System Error: ${e.message}\n`;
        }
    }
}
