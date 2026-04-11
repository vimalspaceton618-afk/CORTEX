import { BaseAgent } from '../core/agent/BaseAgent.js';
import { ReadFileTool, WriteFileTool } from '../tools/FileSystem.js';

export class PlanAgent extends BaseAgent {
    constructor() {
        super(
            "PlanAgent",
            "You are the Plan Agent. Your goal is to write detailed architectural plans and save them to the filesystem. You understand the project's vision and create actionable steps."
        );
    }

    protected setupTools(): void {
        this.registry.register(new ReadFileTool());
        this.registry.register(new WriteFileTool());
    }
}
