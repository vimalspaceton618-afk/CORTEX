import { BaseAgent } from '../core/agent/BaseAgent.js';
import { ShellTool } from '../tools/Shell.js';
import { ReadFileTool } from '../tools/FileSystem.js';

export class QualityAgent extends BaseAgent {
    constructor() {
        super(
            "QualityAgent",
            "You are the Quality Agent. You run tests, linters, and review code diffs to ensure code quality."
        );
    }

    protected setupTools(): void {
        this.registry.register(new ShellTool());
        this.registry.register(new ReadFileTool());
    }
}
