import { Tool } from './Tool.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolveWorkingDirectory } from './PathSecurity.js';
import { SharedContext } from '../core/agent/SharedContext.js';
const execAsync = promisify(exec);
const DEFAULT_TIMEOUT_MS = Number(process.env.SHELL_TIMEOUT_MS || 60000);
const DEFAULT_MAX_OUTPUT_BYTES = Number(process.env.SHELL_MAX_OUTPUT_BYTES || 16000);
function parseList(value) {
    if (!value)
        return [];
    return value.split(',').map((x) => x.trim()).filter(Boolean);
}
function truncateOutput(text, limit) {
    if (text.length <= limit)
        return text;
    return `${text.slice(0, limit)}\n...[output truncated to ${limit} chars]`;
}
export class ShellTool extends Tool {
    name = "execute_command";
    description = "Executes a terminal/shell command on the user's host machine.";
    schema = {
        type: "object",
        properties: {
            command: {
                type: "string",
                description: "The command string to execute in the terminal"
            },
            cwd: {
                type: "string",
                description: "Optional working directory relative to workspace root"
            },
            timeoutMs: {
                type: "number",
                description: "Optional timeout in milliseconds"
            }
        },
        required: ["command"],
        additionalProperties: false
    };
    async execute(args, requestConfirmation) {
        const allowlist = parseList(process.env.COMMAND_ALLOWLIST);
        const denylist = parseList(process.env.COMMAND_DENYLIST);
        const command = args.command || '';
        const lower = command.toLowerCase();
        if (denylist.some((token) => lower.includes(token.toLowerCase()))) {
            return `[COMMAND BLOCKED]: Matches denylist policy.`;
        }
        if (allowlist.length > 0 && !allowlist.some((token) => lower.includes(token.toLowerCase()))) {
            return `[COMMAND BLOCKED]: Not in allowlist policy.`;
        }
        const timeoutMs = Math.max(1000, Math.min(Number(args.timeoutMs || DEFAULT_TIMEOUT_MS), 5 * 60 * 1000));
        let cwd;
        try {
            cwd = resolveWorkingDirectory(args.cwd);
        }
        catch (error) {
            return `[WORKDIR ERROR]: ${error.message}`;
        }
        // ──── BIGROCK SECURITY REFLECTION ────
        // (Instantiated here for audit; in production this would come from the kernel context)
        // @ts-ignore
        const { SecurityProcessor } = await import('../../BIGROCK_ASI/dist/core/SecurityProcessor.js');
        const auditor = new SecurityProcessor();
        const report = auditor.auditCommand(command);
        let approvalMsg = `[CORTEX ORCHESTRATOR] Wants to run:\n  > ${command}\nIn directory: ${cwd}\nTimeout: ${timeoutMs}ms`;
        if (report.risk !== 'low') {
            const icon = report.risk === 'critical' ? '☢️' : '⚠️';
            approvalMsg = `\n${icon} [SECURITY REFLECTION: ${report.risk.toUpperCase()}]\n` +
                `  Reason: ${report.reason}\n\n` +
                approvalMsg;
        }
        // ENFORCED UI APPROVAL BARRIER
        const approved = await requestConfirmation(`${approvalMsg}\n\nAllow execution? (Y/n)`);
        if (!approved) {
            return "[USER OVERRIDE]: Command execution was denied based on security reflection. Do not retry this command without changing your approach.";
        }
        try {
            const { stdout, stderr } = await execAsync(command, { cwd, timeout: timeoutMs, maxBuffer: DEFAULT_MAX_OUTPUT_BYTES * 2 });
            const out = truncateOutput(stdout.trim(), DEFAULT_MAX_OUTPUT_BYTES);
            const err = truncateOutput(stderr.trim(), DEFAULT_MAX_OUTPUT_BYTES);
            SharedContext.appendRecentCommand(command);
            SharedContext.appendAudit({ event: "shell_execute", command, cwd, timeoutMs });
            if (!out && !err)
                return "Command succeeded with no output.";
            return out + (err ? "\nSTDERR:\n" + err : "");
        }
        catch (error) {
            const stdOut = truncateOutput(error.stdout || '', DEFAULT_MAX_OUTPUT_BYTES);
            const stdErr = truncateOutput(error.stderr || '', DEFAULT_MAX_OUTPUT_BYTES);
            return `[EXECUTION FAILED]: ${error.message}\nSTDOUT: ${stdOut}\nSTDERR: ${stdErr}`;
        }
    }
}
