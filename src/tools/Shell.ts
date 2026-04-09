import { Tool } from './Tool.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ShellTool extends Tool {
    name = "execute_command";
    description = "Executes a terminal/shell command on the user's host machine.";
    schema = {
        type: "object",
        properties: {
            command: {
                type: "string",
                description: "The command string to execute in the terminal"
            }
        },
        required: ["command"],
        additionalProperties: false
    };

    async execute(args: { command: string }, requestConfirmation: (msg: string) => Promise<boolean>): Promise<string> {
        // ENFORCED UI APPROVAL BARRIER
        const approved = await requestConfirmation(`[CORTEX ORCHESTRATOR] Wants to run:\n  > ${args.command}\nAllow execution? (Y/n)`);
        
        if (!approved) {
            return "[USER OVERRIDE]: Command execution was denied. Do not retry this command without changing your approach.";
        }

        try {
            const { stdout, stderr } = await execAsync(args.command);
            const out = stdout.trim();
            const err = stderr.trim();
            if(!out && !err) return "Command succeeded with no output.";
            return out + (err ? "\nSTDERR:\n" + err : "");
        } catch (error: any) {
            return `[EXECUTION FAILED]: ${error.message}\nSTDOUT: ${error.stdout || ''}\nSTDERR: ${error.stderr || ''}`;
        }
    }
}
