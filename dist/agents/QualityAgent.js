import { BaseAgent } from '../core/agent/BaseAgent.js';
import { ShellTool } from '../tools/Shell.js';
import { ReadFileTool } from '../tools/FileSystem.js';
import { GitStatusTool, GitDiffTool, GitLogTool, GitBranchTool } from '../tools/Git.js';
export class QualityAgent extends BaseAgent {
    constructor() {
        super("QualityAgent", "You are the Quality Agent. You run tests, linters, and review code diffs to ensure code quality.");
    }
    setupTools() {
        this.registry.register(new ShellTool());
        this.registry.register(new ReadFileTool());
        this.registry.register(new GitStatusTool());
        this.registry.register(new GitDiffTool());
        this.registry.register(new GitLogTool());
        this.registry.register(new GitBranchTool());
    }
}
