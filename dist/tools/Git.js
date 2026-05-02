import { Tool } from './Tool.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getWorkspaceRoot } from './PathSecurity.js';
import { SharedContext } from '../core/agent/SharedContext.js';
const execAsync = promisify(exec);
async function runGit(command, maxChars = 12000) {
    const root = getWorkspaceRoot();
    const { stdout, stderr } = await execAsync(command, {
        cwd: root,
        timeout: 30000,
        maxBuffer: 2 * 1024 * 1024
    });
    const combined = `${stdout}${stderr ? `\nSTDERR:\n${stderr}` : ''}`.trim();
    return combined.length > maxChars ? `${combined.slice(0, maxChars)}\n...[truncated]` : combined;
}
export class GitStatusTool extends Tool {
    name = 'git_status';
    description = 'Shows git status in short form.';
    schema = { type: 'object', properties: {}, additionalProperties: false };
    async execute() {
        try {
            const out = await runGit('git status --short --branch');
            SharedContext.appendAudit({ event: 'git_status' });
            return out || 'No git status output.';
        }
        catch (error) {
            return `[GIT STATUS ERROR]: ${error.message}`;
        }
    }
}
export class GitDiffTool extends Tool {
    name = 'git_diff';
    description = 'Shows bounded git diff output.';
    schema = {
        type: 'object',
        properties: {
            staged: { type: 'boolean', description: 'Use --staged diff.' },
            maxChars: { type: 'number', description: 'Maximum characters in output.' }
        },
        additionalProperties: false
    };
    async execute(args) {
        try {
            const cmd = args?.staged ? 'git diff --staged' : 'git diff';
            return (await runGit(cmd, Number(args?.maxChars || 12000))) || 'No diff output.';
        }
        catch (error) {
            return `[GIT DIFF ERROR]: ${error.message}`;
        }
    }
}
export class GitLogTool extends Tool {
    name = 'git_log';
    description = 'Shows recent commit history.';
    schema = {
        type: 'object',
        properties: {
            limit: { type: 'number', description: 'Number of commits to include.' }
        },
        additionalProperties: false
    };
    async execute(args) {
        try {
            const limit = Math.max(1, Math.min(Number(args?.limit || 10), 50));
            const out = await runGit(`git log -n ${limit} --oneline --decorate`);
            return out || 'No git log output.';
        }
        catch (error) {
            return `[GIT LOG ERROR]: ${error.message}`;
        }
    }
}
export class GitBranchTool extends Tool {
    name = 'git_branch';
    description = 'Shows local and current git branches.';
    schema = { type: 'object', properties: {}, additionalProperties: false };
    async execute() {
        try {
            return (await runGit('git branch --list --verbose')) || 'No branch output.';
        }
        catch (error) {
            return `[GIT BRANCH ERROR]: ${error.message}`;
        }
    }
}
