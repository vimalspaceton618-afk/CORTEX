import { BaseAgent } from '../core/agent/BaseAgent.js';
import { ReadFileTool } from '../tools/FileSystem.js';
import { AnalyzeImageTool } from '../tools/Vision.js';

export class ExploreAgent extends BaseAgent {
    constructor() {
        super(
            "ExploreAgent",
            "You are the Explore Agent. Your goal is to navigate the codebase, read files, and gather context. You cannot write files or execute commands."
        );
    }

    protected setupTools(): void {
        const fsTool = new ReadFileTool();
        // Here we could wrap or limit the FileSystemTool to read-only
        this.registry.register(fsTool);
        this.registry.register(new AnalyzeImageTool());
    }
}
