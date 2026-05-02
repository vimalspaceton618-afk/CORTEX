import { BaseAgent } from '../core/agent/BaseAgent.js';
import { ReadFileTool, WriteFileTool, ListDirTool } from '../tools/FileSystem.js';
import { ShellTool } from '../tools/Shell.js';
import { ProcessManagementTool } from '../tools/System.js';
import { GitStatusTool, GitDiffTool, GitLogTool } from '../tools/Git.js';
import { CodeSearchTool } from '../tools/CodeSearch.js';
export class NetworkAgent extends BaseAgent {
    constructor() {
        super("NetworkAgent", "You are the Network Agent. You orchestrate external API/service workflows, webhooks, queue-like task flows, and cross-system automations. Prioritize safe execution, retries, idempotency, and explicit status reporting.");
    }
    setupTools() {
        this.registry.register(new ReadFileTool());
        this.registry.register(new WriteFileTool());
        this.registry.register(new ListDirTool());
        this.registry.register(new ShellTool());
        this.registry.register(new ProcessManagementTool());
        this.registry.register(new GitStatusTool());
        this.registry.register(new GitDiffTool());
        this.registry.register(new GitLogTool());
        this.registry.register(new CodeSearchTool());
    }
}
