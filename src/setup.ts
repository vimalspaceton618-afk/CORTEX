#!/usr/bin/env node
/**
 * CORTEX Setup Wizard — First-run configuration
 * Usage: cortex --setup
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';

const CORTEX_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> => new Promise(r => rl.question(q, r));

function detectSystem() {
    const cpus = os.cpus();
    const totalRAM = (os.totalmem() / (1024 ** 3)).toFixed(1);
    const freeRAM = (os.freemem() / (1024 ** 3)).toFixed(1);
    const platform = `${os.platform()} ${os.arch()}`;
    const hasGPU = process.env.CUDA_PATH || process.env.NVIDIA_VISIBLE_DEVICES ? 'Detected (CUDA)' : 'Not detected';
    return { cpus: cpus.length, model: cpus[0]?.model || 'Unknown', totalRAM, freeRAM, platform, hasGPU };
}

export async function runSetup() {
    console.log('\n══════════════════════════════════════════════════════');
    console.log('  CORTEX Setup Wizard');
    console.log('══════════════════════════════════════════════════════\n');

    // Step 1: System Detection
    const sys = detectSystem();
    console.log('  System Detection:');
    console.log(`    Platform : ${sys.platform}`);
    console.log(`    CPU      : ${sys.model} (${sys.cpus} cores)`);
    console.log(`    RAM      : ${sys.freeRAM} GB free / ${sys.totalRAM} GB total`);
    console.log(`    GPU      : ${sys.hasGPU}`);
    console.log('');

    // Step 2: API Key
    const envPath = path.join(CORTEX_ROOT, '.env');
    let existingKey = '';
    try {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/OPENAI_API_KEY=(.+)/);
        if (match && match[1] && !match[1].includes('your-api-key')) existingKey = match[1].trim();
    } catch {}

    if (existingKey) {
        console.log(`  API Key    : ✓ Configured (${existingKey.slice(0, 8)}...)`);
        const change = await ask('  Change API key? (y/N): ');
        if (change.toLowerCase() === 'y') existingKey = '';
    }

    if (!existingKey) {
        console.log('\n  CORTEX supports two modes:');
        console.log('    [1] Cloud Mode  — Uses OpenAI/compatible API for agent tasks');
        console.log('    [2] Local Mode  — 100% air-gapped, uses GGUF models only\n');

        const mode = await ask('  Select mode (1/2): ');
        if (mode === '1') {
            const key = await ask('  Enter OPENAI_API_KEY: ');
            if (key.trim()) {
                const baseUrl = await ask('  Custom base URL (Enter for default OpenAI): ');
                let envContent = `OPENAI_API_KEY=${key.trim()}\n`;
                if (baseUrl.trim()) envContent += `OPENAI_BASE_URL=${baseUrl.trim()}\n`;
                fs.writeFileSync(envPath, envContent);
                console.log('  ✓ Cloud mode configured.\n');
            }
        } else {
            fs.writeFileSync(envPath, '# Local-only mode\nOPENAI_API_KEY=\n');
            console.log('  ✓ Local-only mode. Use /brain eat to load GGUF models.\n');
        }
    }

    // Step 3: GGUF Model Check
    const modelsDir = path.join(CORTEX_ROOT, 'BIGROCK_ASI', 'models');
    let modelCount = 0;
    try {
        const files = fs.readdirSync(modelsDir);
        modelCount = files.filter(f => f.endsWith('.gguf')).length;
    } catch {}

    if (modelCount > 0) {
        console.log(`  Local Models: ${modelCount} GGUF model(s) found. ✓`);
    } else {
        console.log('  Local Models: No GGUF models found in BIGROCK_ASI/models/');
        console.log('    To use local AI, place .gguf files there and run /brain eat');
    }

    // Step 4: Workspace
    const workspace = await ask(`\n  Default workspace path (Enter for ${process.cwd()}): `);
    if (workspace.trim()) {
        process.env.CORTEX_WORKSPACE_ROOT = workspace.trim();
        console.log(`  ✓ Workspace set to: ${workspace.trim()}`);
    }

    // Step 5: Validation
    console.log('\n  Running health check...');
    try {
        const distCli = path.join(CORTEX_ROOT, 'dist', 'cli.js');
        if (fs.existsSync(distCli)) {
            console.log('  ✓ Build artifacts found.');
        } else {
            console.log('  ⚠ dist/cli.js not found. Run: npm run build');
        }
    } catch {}

    console.log('\n══════════════════════════════════════════════════════');
    console.log('  ✅ Setup Complete!');
    console.log('══════════════════════════════════════════════════════');
    console.log('  Run "cortex" to launch the interactive terminal.\n');

    rl.close();
}

// Direct execution
if (process.argv[1]?.includes('setup')) {
    runSetup().catch(console.error);
}
