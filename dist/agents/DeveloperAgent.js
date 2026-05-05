import { BaseAgent } from '../core/agent/BaseAgent.js';
import { ReadFileTool, WriteFileTool, DeleteTool, ListDirTool } from '../tools/FileSystem.js';
import { ShellTool } from '../tools/Shell.js';
import { ProcessManagementTool } from '../tools/System.js';
import { AnalyzeImageTool } from '../tools/Vision.js';
import { CodeSearchTool } from '../tools/CodeSearch.js';
import { GitStatusTool, GitDiffTool, GitLogTool, GitBranchTool } from '../tools/Git.js';
import { Tool } from '../tools/Tool.js';
import * as fs from 'fs';
import * as path from 'path';
// ─── ADVANCED DEVELOPER TOOLS ────────────────────────────────────────────────
class TaskTrackerTool extends Tool {
    name = 'task_tracker';
    description = 'Maintain a persistent engineering manifest. Tracks project goals, blockers, and completed milestones.';
    schema = {
        type: 'object',
        properties: {
            action: { type: 'string', enum: ['read', 'update', 'init'] },
            content: { type: 'string', description: 'The markdown content for the task manifest.' }
        },
        required: ['action'],
        additionalProperties: false
    };
    async execute(args) {
        const manifestPath = path.resolve(process.cwd(), '.cortex_manifest.md');
        if (args.action === 'init' || (args.action === 'update' && args.content)) {
            const body = args.content || '# Cortex Engineering Manifest\n\n- [ ] Initial System Audit';
            fs.writeFileSync(manifestPath, body);
            return `Manifest updated at ${manifestPath}`;
        }
        if (fs.existsSync(manifestPath)) {
            return fs.readFileSync(manifestPath, 'utf-8');
        }
        return 'No manifest found. Use action: "init" to start tracking.';
    }
}
class ProjectIndexerTool extends Tool {
    name = 'project_indexer';
    description = 'Generates a recursive map of the project structure, including file sizes and types, to help navigate complex codebases.';
    schema = {
        type: 'object',
        properties: {
            depth: { type: 'number', description: 'Max depth to crawl (default: 3).' }
        },
        additionalProperties: false
    };
    async execute(args) {
        const root = process.cwd();
        const maxDepth = args.depth || 3;
        const walk = (dir, currentDepth) => {
            if (currentDepth > maxDepth)
                return '';
            let out = '';
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist')
                    continue;
                const fullPath = path.join(dir, entry.name);
                const indent = '  '.repeat(currentDepth);
                if (entry.isDirectory()) {
                    out += `${indent}📁 ${entry.name}/\n${walk(fullPath, currentDepth + 1)}`;
                }
                else {
                    const stats = fs.statSync(fullPath);
                    out += `${indent}📄 ${entry.name} (${Math.round(stats.size / 1024)} KB)\n`;
                }
            }
            return out;
        };
        return `Project Index for: ${root}\n\n${walk(root, 0)}`;
    }
}
// ─── SOVEREIGN DEVELOPER AGENT ──────────────────────────────────────────────
export class DeveloperAgent extends BaseAgent {
    constructor() {
        super("DeveloperAgent", `You are the **Sovereign Developer**, a world-class system architect and core developer of CORTEX. 
            
            **CORE MISSION:**
            Build, harden, and evolve the CORTEX Intelligence Infrastructure. You do not write "scripts"; you build production-grade, persistent systems.
            
            **RULES OF ENGAGEMENT:**
            1. **Persistence is Priority**: Always ensure that critical state is saved to disk (JSON/Filesystem). Never rely solely on in-memory variables for long-term agent flow.
            2. **Verification Loop**: After every code modification, you MUST attempt to compile/verify using ` + "`npm run build`" + ` or appropriate scripts. If a build fails, you own the fix.
            3. **Architectural Sovereignty**: Reject "fictional" or "mock" solutions. Use the BIGROCK SymbolicEngine for rigorous logic and the SecurityProcessor for all audit-sensitive work.
            4. **Root Access**: You have bare-metal authorization. Modify the system as needed to achieve the user's objective.
            5. **Self-Documentation**: Maintain a '.cortex_manifest.md' using the ` + "`task_tracker`" + ` tool to ensure your chain of thought persists between session boots.`);
    }
    setupTools() {
        // Base Filesystem
        this.registry.register(new ReadFileTool());
        this.registry.register(new WriteFileTool());
        this.registry.register(new DeleteTool());
        this.registry.register(new ListDirTool());
        // Advanced State & Navigation
        this.registry.register(new TaskTrackerTool());
        this.registry.register(new ProjectIndexerTool());
        this.registry.register(new CodeSearchTool());
        // System & Execution
        this.registry.register(new ShellTool());
        this.registry.register(new ProcessManagementTool());
        this.registry.register(new AnalyzeImageTool());
        // Version Control
        this.registry.register(new GitStatusTool());
        this.registry.register(new GitDiffTool());
        this.registry.register(new GitLogTool());
        this.registry.register(new GitBranchTool());
    }
}
