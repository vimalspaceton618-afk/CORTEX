import { Tool } from './Tool.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getWorkspaceRoot } from './PathSecurity.js';
const execAsync = promisify(exec);
export class StaticAnalysisTool extends Tool {
    name = "run_static_analysis";
    description = "Runs the TypeScript compiler (tsc --noEmit) to detect syntax and type errors across the workspace. Returns structured error reports.";
    schema = {
        type: "object",
        properties: {},
        additionalProperties: false
    };
    async execute() {
        const root = getWorkspaceRoot();
        try {
            await execAsync('npx tsc --noEmit', { cwd: root, timeout: 30000 });
            return "✅ Static Analysis Passed: 0 TypeScript compilation errors found.";
        }
        catch (error) {
            if (error.stdout) {
                // Parse tsc output
                const lines = error.stdout.split('\n');
                const errors = lines.filter((l) => l.includes('error TS')).slice(0, 15);
                const summary = errors.map((e) => `  - ${e.trim()}`).join('\n');
                return `❌ Static Analysis Failed.\n\nType Errors Detected:\n${summary}\n\n(Truncated to 15 errors. See terminal for full list if needed.)`;
            }
            return `[STATIC ANALYSIS ERROR]: Failed to execute tsc. Ensure TypeScript is installed in the workspace. Details: ${error.message}`;
        }
    }
}
