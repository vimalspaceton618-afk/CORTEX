import { Tool } from './Tool.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getWorkspaceRoot } from './PathSecurity.js';
// @ts-ignore
import { ProcessHypervisor } from '../../BIGROCK_ASI/dist/hypervisor/ProcessHypervisor.js';
const execAsync = promisify(exec);
// Initialize a singleton hypervisor for the tests
const hypervisor = new ProcessHypervisor();
// Grant a token to the QualityAgent for test execution
hypervisor.issueToken('QualityAgent', ['execute_shell'], 24 * 60 * 60 * 1000);
export class DynamicTestExecutionTool extends Tool {
    name = "execute_dynamic_test";
    description = "Dynamically writes and executes a TypeScript unit test file in an isolated Hypervisor sandbox to verify Developer changes.";
    schema = {
        type: "object",
        properties: {
            testCode: { type: "string", description: "The full TypeScript code for the test. Must exit with code 0 on success, or throw/exit non-zero on failure." }
        },
        required: ["testCode"],
        additionalProperties: false
    };
    async execute(args) {
        const root = getWorkspaceRoot();
        const testFileName = `hypervisor_sandbox_test_${Date.now()}.ts`;
        const testFilePath = path.join(root, 'scratch', testFileName);
        try {
            await fs.mkdir(path.join(root, 'scratch'), { recursive: true });
            await fs.writeFile(testFilePath, args.testCode, 'utf-8');
            // Wrap the shell execution in the ProcessHypervisor sandbox
            const result = await hypervisor.sandbox('QualityAgent', 'execute_shell', async () => {
                // Use a child process to prevent event loop blocking
                const { stdout, stderr } = await execAsync(`npx tsx ${testFilePath}`, { cwd: root, timeout: 5000 });
                return { stdout, stderr };
            }, {
                max_execution_ms: 6000, // 1 second buffer over the exec timeout
                max_memory_bytes: 100 * 1024 * 1024,
                max_stack_depth: 100,
                max_loop_iterations: 10000
            });
            // Cleanup
            await fs.rm(testFilePath).catch(() => { });
            if (result.success) {
                return `✅ Test Execution Passed.\nOutput:\n${result.result?.stdout}`;
            }
            else {
                return `❌ Test Execution Failed (Hypervisor Terminated or Error).\nReason: ${result.error}\nAudit: The ProcessHypervisor prevented malicious/broken execution.`;
            }
        }
        catch (error) {
            await fs.rm(testFilePath).catch(() => { });
            return `[TEST FRAMEWORK ERROR]: ${error.message}`;
        }
    }
}
