import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("\n══════════════════════════════════════════════════════════════");
console.log("   ██████╗ ██████╗ ██████╗ ████████╗███████╗██╗  ██╗");
console.log("  ██╔════╝██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝╚██╗██╔╝");
console.log("  ██║     ██║   ██║██████╔╝   ██║   █████╗   ╚███╔╝ ");
console.log("  ██║     ██║   ██║██╔══██╗   ██║   ██╔══╝   ██╔██╗ ");
console.log("  ╚██████╗╚██████╔╝██║  ██║   ██║   ███████╗██╔╝ ██╗");
console.log("   ╚═════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝");
console.log("");
console.log("  ⚡ UNIFIED SOVEREIGN INTELLIGENCE INFRASTRUCTURE v4.0");
console.log("  © 2026 SpaceTon  •  All subsystems integrated in-process");
console.log("══════════════════════════════════════════════════════════════\n");

function runCommand(command, args, cwd, prefix) {
    return new Promise((resolvePromise, reject) => {
        console.log(`[BOOT] Compiling ${prefix}...`);
        
        const child = spawn(command, args, { 
            cwd: cwd, 
            shell: true,
            stdio: 'inherit'
        });

        child.on('close', (code) => {
            if (code !== 0) {
                console.log(`[BOOT] ${prefix} exited with code ${code}`);
                reject(new Error(`${prefix} failed`));
            } else {
                console.log(`[BOOT] ✓ ${prefix} compiled successfully`);
                resolvePromise(child);
            }
        });
    });
}

async function boot() {
    try {
        const beastMode = process.argv.includes('--beast');

        // Step 1: Compile BIGROCK ASI (the cognition core)
        await runCommand('npm', ['run', 'build'], resolve(__dirname, 'BIGROCK_ASI'), 'BIGROCK ASI');
        
        // Step 2: Compile CORTEX (the unified system)
        await runCommand('npm', ['run', 'build'], __dirname, 'CORTEX');
        
        console.log("\n[BOOT] ═══════════════════════════════════════════════════");
        console.log("[BOOT]  Compilation Complete. All systems unified.");
        console.log("[BOOT]  BIGROCK CognitionCore will boot IN-PROCESS.");
        console.log("[BOOT]  No separate API server needed (zero HTTP latency).");
        if (beastMode) {
            console.log("[BOOT]  ⚡ BEASTMODE flag detected — will engage on boot.");
        }
        console.log("[BOOT] ═══════════════════════════════════════════════════\n");

        // Step 3: Launch CORTEX (single process — kernel boots internally)
        console.log("[BOOT] Launching CORTEX Terminal...\n");
        await runCommand('npm', ['start'], __dirname, 'CORTEX');

        process.exit(0);

    } catch (error) {
        console.error("\n[BOOT FATAL ERROR]:", error.message);
        process.exit(1);
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log("\n[BOOT] Shutdown initiated...");
    process.exit(0);
});

boot();
