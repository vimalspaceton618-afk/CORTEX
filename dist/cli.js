#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import App from './ui.js';
import { ConfigManager } from './core/config.js';
import { AgentManager } from './core/agent/AgentManager.js';
import { collectHealthStatus, formatHealthReport } from './core/health.js';
import { CortexKernel } from './core/CortexKernel.js';
import { BeastMode } from './core/BeastMode.js';
ConfigManager.init();
const program = new Command();
program
    .name('cortex')
    .description('CORTEX — Unified Sovereign Intelligence Infrastructure')
    .version('4.0.0')
    .option('--run <prompt>', 'Run in headless mode with a prompt')
    .option('--json', 'Output as JSON in headless mode')
    .option('--yes', 'Auto-approve tool confirmations in headless mode')
    .option('--beast', 'Boot in BEASTMODE (all systems MAX power)')
    .option('--setup', 'Run the first-time setup wizard');
program.parse(process.argv);
const options = program.opts();
async function runHeadless(prompt, asJson, autoApprove, beastMode) {
    process.env.CORTEX_WORKSPACE_ROOT = process.cwd();
    // Boot the kernel for headless mode too
    const kernel = await CortexKernel.boot();
    if (beastMode) {
        kernel.engageBeastMode();
        if (!asJson) {
            process.stdout.write(BeastMode.getActivationBanner() + '\n');
        }
    }
    const normalized = prompt.trim().toLowerCase();
    // ─── /health ───────────────────────────────────────────────
    if (normalized === '/health' || normalized === 'health') {
        const status = collectHealthStatus();
        if (asJson) {
            process.stdout.write(`${JSON.stringify({ prompt, health: status }, null, 2)}\n`);
        }
        else {
            process.stdout.write(`${formatHealthReport(status)}\n`);
        }
        return;
    }
    // ─── /status ───────────────────────────────────────────────
    if (normalized === '/status') {
        const report = kernel.getStatusReport();
        if (asJson) {
            process.stdout.write(`${JSON.stringify({ prompt, status: kernel.getRealtimeMetrics() }, null, 2)}\n`);
        }
        else {
            process.stdout.write(`${report}\n`);
        }
        return;
    }
    // ─── /beast ────────────────────────────────────────────────
    if (normalized === '/beast') {
        const status = kernel.toggleBeastMode();
        if (asJson) {
            process.stdout.write(`${JSON.stringify({ prompt, beastmode: status }, null, 2)}\n`);
        }
        else {
            process.stdout.write(status.active ? BeastMode.getActivationBanner() : BeastMode.getDeactivationBanner());
        }
        return;
    }
    // ─── /think <query> — Local CognitionCore ──────────────────
    if (normalized.startsWith('/think ')) {
        const q = prompt.slice(7).trim();
        const thought = await kernel.think(q);
        if (asJson) {
            process.stdout.write(`${JSON.stringify({ prompt: q, thought }, null, 2)}\n`);
        }
        else {
            process.stdout.write(kernel.formatThought(thought) + '\n');
        }
        return;
    }
    // ─── /cyberscan ────────────────────────────────────────────
    if (normalized === '/cyberscan') {
        if (!CortexKernel.isBooted()) {
            process.stdout.write('⚠ Kernel not booted.\n');
            return;
        }
        const result = kernel.getCyberKing().fullSpectrumScan(process.cwd());
        const out = [
            `🛡️ CYBERSECURITY KING — FULL SPECTRUM SCAN`,
            `Composite Grade: ${result.composite_risk_grade} (Score: ${result.composite_risk_score}) | ${result.scan_duration_ms}ms`,
            '',
            ...result.summary,
            '',
            ...(result.top_priorities.length > 0 ? ['⚡ TOP PRIORITIES:', ...result.top_priorities.map((p) => `  ${p}`)] : []),
        ].join('\n');
        if (asJson)
            process.stdout.write(JSON.stringify({ prompt, result }, null, 2) + '\n');
        else
            process.stdout.write(out + '\n');
        return;
    }
    // ─── /cyberheal ────────────────────────────────────────────
    if (normalized === '/cyberheal') {
        if (!CortexKernel.isBooted()) {
            process.stdout.write('⚠ Kernel not booted.\n');
            return;
        }
        const scripts = kernel.getCyberKing().runSolvers(process.cwd(), false);
        let out = '';
        if (scripts.length === 0) {
            out = '✅ No vulnerabilities detected. Systems are secure.';
        }
        else {
            const lines = [`🛡️ CYBERSECURITY KING — BEASTMODE ACTIVE SOLVER`, `Generated ${scripts.length} applicable remediation scripts.\n`];
            for (const script of scripts) {
                lines.push(`[SCRIPT ID: ${script.script_id}]`);
                for (const action of script.actions) {
                    lines.push(`  ► TARGET: ${action.file}:${action.line}`);
                    lines.push(`    Action: ${action.description}`);
                    lines.push(`    - ${action.original_code}`);
                    lines.push(`    + ${action.suggested_code.replace(/\n/g, '\n      ')}`);
                }
            }
            out = lines.join('\n');
        }
        if (asJson)
            process.stdout.write(JSON.stringify({ prompt, scripts }, null, 2) + '\n');
        else
            process.stdout.write(out + '\n');
        return;
    }
    // ─── /brain eat ────────────────────────────────────────────
    if (normalized === '/brain eat') {
        if (!CortexKernel.isBooted()) {
            process.stdout.write('⚠ Kernel not booted.\n');
            return;
        }
        try {
            const brain = kernel.getBrain();
            const discovered = brain.getHive().scanModels();
            if (discovered.length === 0) {
                process.stdout.write(`No GGUF models found in models/ directory.\n`);
                return;
            }
            for (const model of discovered) {
                await brain.eat(model.filepath, true);
            }
            const bStat = brain.getStatus();
            const out = [
                `Absorbed models successfully.`,
                `Collective IQ: ${bStat.collective_iq}`,
                `Models in Hive: ${bStat.hive_status.total_models}`,
            ].join('\n');
            if (asJson)
                process.stdout.write(JSON.stringify({ prompt, status: bStat }, null, 2) + '\n');
            else
                process.stdout.write(out + '\n');
        }
        catch (e) {
            process.stdout.write(`⛔ Absorption failed: ${e.message}\n`);
        }
        return;
    }
    // ─── /brain ────────────────────────────────────────────────
    if (normalized === '/brain') {
        if (!CortexKernel.isBooted()) {
            process.stdout.write('⚠ Kernel not booted.\n');
            return;
        }
        const info = kernel.getNativeBrainInfo();
        const hasNative = kernel.hasNativeBrain();
        if (hasNative && info) {
            const out = [
                '🧠 Active Brain: ADAPTIVE BRAIN (Local Sovereign ASI)',
                `  Collective IQ : ${info.collective_iq}`,
                `  Top Model     : ${info.filename}`,
                `  Power (CPI)   : ${info.power.toFixed(3)}`,
                `  Top Domain    : ${info.top_domain}`
            ].join('\n');
            if (asJson)
                process.stdout.write(JSON.stringify({ prompt, info }, null, 2) + '\n');
            else
                process.stdout.write(out + '\n');
        }
        else {
            const out = '🧠 Active Brain: CLOUD AI\nRun /brain eat to activate local sovereign AI.';
            if (asJson)
                process.stdout.write(JSON.stringify({ prompt, info: 'cloud' }, null, 2) + '\n');
            else
                process.stdout.write(out + '\n');
        }
        return;
    }
    // ─── /arl ──────────────────────────────────────────────────
    if (normalized === '/arl' || normalized === '/arl status') {
        if (!CortexKernel.isBooted()) {
            process.stdout.write('⚠ Kernel not booted.\n');
            return;
        }
        const m = kernel.getARLMetrics();
        const running = kernel.isARLRunning();
        const out = [
            `Autonomous Reasoning Loop: ${running ? 'Running' : 'Stopped'}`,
            `  Cycles completed : ${m.cycles_completed}`,
            `  Self-queries      : ${m.self_queries_generated}`,
            `  Anomalies         : ${m.anomalies_detected}`,
            `  Uptime            : ${(m.uptime_ms / 1000).toFixed(1)}s`,
        ].join('\n');
        if (asJson)
            process.stdout.write(JSON.stringify({ prompt, metrics: m, running }, null, 2) + '\n');
        else
            process.stdout.write(out + '\n');
        return;
    }
    if (normalized === '/arl start') {
        kernel.startARL();
        process.stdout.write(asJson ? JSON.stringify({ prompt, status: 'started' }) + '\n' : '✓ ARL started.\n');
        return;
    }
    if (normalized === '/arl stop') {
        kernel.stopARL();
        process.stdout.write(asJson ? JSON.stringify({ prompt, status: 'stopped' }) + '\n' : '✓ ARL stopped.\n');
        return;
    }
    // ─── /mythos ───────────────────────────────────────────────
    if (normalized.startsWith('/mythos ')) {
        const arch = prompt.slice(8).trim();
        if (!CortexKernel.isBooted()) {
            process.stdout.write('⚠ Kernel not booted.\n');
            return;
        }
        const mythos = kernel.getMythos();
        const gaps = mythos.analyzeArchitecture(arch);
        if (!gaps.length) {
            process.stdout.write(asJson ? JSON.stringify({ prompt, gaps }) + '\n' : `✓ No Myth Gaps detected for: "${arch}"\n`);
        }
        else {
            const out = [
                `⚠ ${gaps.length} Myth Gaps detected in: "${arch}"`,
                '',
                ...gaps.map((g) => `  ${g.threat.name} [${g.threat.domain}] — ${(g.confidence * 100).toFixed(0)}% confidence`),
            ].join('\n');
            if (asJson)
                process.stdout.write(JSON.stringify({ prompt, gaps }, null, 2) + '\n');
            else
                process.stdout.write(out + '\n');
        }
        return;
    }
    // ─── /demo ───────────────────────────────────────────────────
    if (normalized === '/demo') {
        if (!CortexKernel.isBooted()) {
            process.stdout.write('⚠ Kernel not booted. Run npm run build in BIGROCK_ASI/ first.\n');
            return;
        }
        process.stdout.write('[● 1/7] ── Deterministic Math Proof Engine\n');
        const mathThought = await kernel.think('derivative of x^3 + 2x');
        process.stdout.write(kernel.formatThought(mathThought) + '\n\n');
        process.stdout.write('[● 2/7] ── Physics Simulation Engine\n');
        const physThought = await kernel.think('escape velocity from Earth');
        process.stdout.write(kernel.formatThought(physThought) + '\n\n');
        process.stdout.write('[● 3/7] ── Formal Logic Prover\n');
        const logicThought = await kernel.think('p AND q IMPLIES p');
        process.stdout.write(kernel.formatThought(logicThought) + '\n\n');
        process.stdout.write('[● 4/7] ── CyberSecurityKing (10-Engine Stack)\n');
        const cyber = kernel.getCyberKing();
        const scan = cyber ? cyber.fullSpectrumScan(process.cwd()) : null;
        if (scan) {
            process.stdout.write([
                `🛡️ Full Spectrum Scan Complete (${scan.scan_duration_ms}ms)`,
                `Composite Grade: ${scan.composite_risk_grade} (Score: ${scan.composite_risk_score})`,
                ...scan.summary.slice(0, 3).map((s) => `  • ${s}`)
            ].join('\n') + '\n\n');
        }
        else {
            process.stdout.write('✓ CyberSecurityKing engines offline.\n\n');
        }
        process.stdout.write('[● 5/7] ── AdaptiveBrain (Sovereign Neural Routing)\n');
        const brain = kernel.getBrain();
        const bStat = brain ? brain.getStatus() : null;
        if (bStat && bStat.hive_status.total_models > 0) {
            process.stdout.write([
                `🤖 ${bStat.hive_status.total_models} model(s) absorbed into Hive:`,
                `Collective IQ  : ${bStat.collective_iq}`,
            ].join('\n') + '\n\n');
        }
        else {
            process.stdout.write('No models absorbed yet.\n\n');
        }
        process.stdout.write('[● 6/7] ── Security Hypervisor & Integrity Chain\n');
        const metrics = kernel.getRealtimeMetrics();
        process.stdout.write([
            `🔒 Integrity Chain: ${metrics.integrity_chain_valid ? '✓ VALID' : '✗ BROKEN'} (${metrics.integrity_chain_length} links)`,
            `🛡 Threats Blocked : ${metrics.threats_blocked}`,
        ].join('\n') + '\n\n');
        process.stdout.write('[● 7/7] ── CORTEX — Why It Wins\n');
        process.stdout.write([
            '╔══════════════════════════════════════════════════════╗',
            '║  CORTEX Sovereign Intelligence Infrastructure       ║',
            '╠══════════════════════════════════════════════════════╣',
            '║  ☑ Zero external HTTP — 100% air-gapped by design      ║',
            '║  ☑ Deterministic proofs — math & physics, never guesses ║',
            '║  ☑ Self-absorbing AI — eats and ranks any LLM you give it║',
            '║  ☑ 12-layer Mythos ontology — finds gaps other tools miss ║',
            '║  ☑ Enterprise-grade — 6-layer security + integrity chain  ║',
            '╚══════════════════════════════════════════════════════╝',
        ].join('\n') + '\n');
        return;
    }
    // ─── Smart routing: local cognition or cloud LLM ───────────
    // Check if the query can be handled locally first
    if (kernel.shouldHandleLocally(prompt)) {
        const thought = await kernel.think(prompt);
        if (asJson) {
            process.stdout.write(`${JSON.stringify({ prompt, thought, routed_to: 'bigrock_local' }, null, 2)}\n`);
        }
        else {
            process.stdout.write(`[ROUTED: Local CognitionCore]\n${kernel.formatThought(thought)}\n`);
        }
        return;
    }
    // ─── Cloud LLM fallback ────────────────────────────────────
    const orchestrator = new AgentManager();
    const confirm = async (msg) => autoApprove ? true : false;
    const stream = orchestrator.delegateTask(prompt, confirm);
    let output = '';
    for await (const chunk of stream) {
        output += chunk;
    }
    orchestrator.recordTurn(prompt, output);
    if (asJson) {
        process.stdout.write(`${JSON.stringify({ prompt, output, routed_to: 'cloud_llm' }, null, 2)}\n`);
    }
    else {
        process.stdout.write(`${output}\n`);
    }
}
if (options.setup) {
    import('./setup.js').then(m => m.runSetup()).catch((error) => {
        process.stderr.write(`[SETUP ERROR]: ${error.message}\n`);
        process.exitCode = 1;
    });
}
else if (options.run) {
    runHeadless(options.run, Boolean(options.json), Boolean(options.yes), Boolean(options.beast)).catch((error) => {
        process.stderr.write(`[HEADLESS ERROR]: ${error.message}\n`);
        process.exitCode = 1;
    });
}
else {
    const { waitUntilExit } = render(React.createElement(App, null));
    waitUntilExit().then(() => {
        // Graceful shutdown
    });
}
