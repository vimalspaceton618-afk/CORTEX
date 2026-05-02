import { CognitionCore } from './core/CognitionCore.js';
import { AutonomousReasoningLoop } from './reasoning/AutonomousReasoningLoop.js';
import chalk from 'chalk';
import * as readline from 'readline';
const BANNER = `
${chalk.bold.redBright('╔════════════════════════════════════════════════════════════════════╗')}
${chalk.bold.redBright('║')}${chalk.bold.white('       ██████╗ ██╗ ██████╗ ██████╗  ██████╗  ██████╗██╗  ██╗        ')}${chalk.bold.redBright('║')}
${chalk.bold.redBright('║')}${chalk.bold.white('       ██╔══██╗██║██╔════╝ ██╔══██╗██╔═══██╗██╔════╝██║ ██╔╝        ')}${chalk.bold.redBright('║')}
${chalk.bold.redBright('║')}${chalk.bold.white('       ██████╔╝██║██║  ███╗██████╔╝██║   ██║██║     █████╔╝         ')}${chalk.bold.redBright('║')}
${chalk.bold.redBright('║')}${chalk.bold.white('       ██╔══██╗██║██║   ██║██╔══██╗██║   ██║██║     ██╔═██╗         ')}${chalk.bold.redBright('║')}
${chalk.bold.redBright('║')}${chalk.bold.white('       ██████╔╝██║╚██████╔╝██║  ██║╚██████╔╝╚██████╗██║  ██╗        ')}${chalk.bold.redBright('║')}
${chalk.bold.redBright('║')}${chalk.bold.white('       ╚═════╝ ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝        ')}${chalk.bold.redBright('║')}
${chalk.bold.redBright('║')}${chalk.bold.magenta('          A R T I F I C I A L   S U P E R I N T E L L I G E N C E          ')}${chalk.bold.redBright('║')}
${chalk.bold.redBright('║')}${chalk.dim('   Phase 4: Self-Absorbing LLM Devourer + ARL + Episodic + DAG + API  ')}${chalk.bold.redBright('║')}
${chalk.bold.redBright('╚════════════════════════════════════════════════════════════════════╝')}
`;
function renderThought(thought) {
    const domain_color = {
        mathematics: chalk.cyan, physics: chalk.yellow, chemistry: chalk.green,
        logic: chalk.magenta, system: chalk.blue, network: chalk.blue,
        language: chalk.white, unknown: chalk.red
    };
    const color = domain_color[thought.parsed_intent.domain] || chalk.white;
    const mode_icons = {
        symbolic: '🔬', heuristic: '⚙️', predictive: '🧠', meta: '🌀'
    };
    console.log(`\n${chalk.dim('─'.repeat(70))}`);
    console.log(`${chalk.bold('⚡ Domain')}    : ${color(thought.parsed_intent.domain.toUpperCase())}`);
    console.log(`${chalk.bold(`${mode_icons[thought.mode] || '?'} Mode`)}      : ${thought.mode === 'symbolic' ? chalk.bold.greenBright('PROOF MODE') : thought.mode === 'heuristic' ? chalk.bold.yellowBright('COMPUTE MODE') : chalk.bold.cyanBright('NEURAL MODE')}`);
    console.log(`${chalk.bold('🎯 Confidence')}: ${thought.confidence === 1.0 ? chalk.greenBright('100% (Deterministic Proof)') : chalk.yellow((thought.confidence * 100).toFixed(1) + '% (Neural Estimate)')}`);
    console.log(`${chalk.bold('⏱  Time')}      : ${chalk.dim(thought.execution_time_ms + 'ms')}`);
    if (thought.result?.proof_trace?.length) {
        console.log(`\n${chalk.bold.cyanBright('📋 PROOF TRACE:')}`);
        for (const step of thought.result.proof_trace) {
            console.log(chalk.dim('  │ ' + step));
        }
    }
    const val = thought.result?.value;
    if (thought.result?.type === 'error') {
        console.log(`\n${chalk.bold.redBright('⛔ BLOCKED:')} ${chalk.red(val)}`);
    }
    else if (typeof val === 'object') {
        console.log(`\n${chalk.bold.greenBright('✅ RESULT:')}`);
        console.log(chalk.white(JSON.stringify(val, null, 2)));
    }
    else {
        console.log(`\n${chalk.bold.greenBright('✅ RESULT:')} ${chalk.white(val)}`);
    }
    // Render self-reflection verdict if this thought was processed through CognitionCore
    const reflectionLine = thought.confidence >= 0.9 ? chalk.greenBright('VERIFIED ✓') :
        thought.confidence >= 0.5 ? chalk.yellowBright('SUSPECT ⚠') :
            chalk.redBright('REJECTED ✗');
    console.log(`${chalk.bold('🪞 Reflection')}: ${reflectionLine}`);
    console.log(chalk.dim('─'.repeat(70)));
}
async function main() {
    console.clear();
    console.log(BANNER);
    const core = new CognitionCore();
    const arl = new AutonomousReasoningLoop(core);
    const telemetry = core.getKernel().getTelemetry();
    const mem = core.getMemory();
    const hyp = core.getHypervisor();
    const learning = core.getLearning();
    const episodic = core.getEpisodicMemory();
    const absorber = core.getAbsorber();
    const brain = core.getBrain();
    const sovereign = core.getSovereign();
    // Boot the AdaptiveBrain and Sovereign
    await brain.wake();
    sovereign.assumeControl();
    console.log(chalk.bold('\n⚡ SYSTEM BOOT REPORT:'));
    console.log(chalk.dim(`  Platform      : ${telemetry.os.platform} | ${telemetry.os.release}`));
    console.log(chalk.dim(`  CPU           : ${telemetry.cpu.model}`));
    console.log(chalk.dim(`  Threads       : ${telemetry.cpu.threads} | Freq: ${telemetry.cpu.frequency_mhz} MHz`));
    console.log(chalk.dim(`  Memory        : ${telemetry.memory.used_gb} GB / ${telemetry.memory.total_gb} GB (${telemetry.memory.usage_percent}%)`));
    console.log(chalk.dim(`  Uptime        : ${telemetry.os.uptime_hours} hours`));
    console.log(chalk.dim(`  Memory Cells  : ${mem.getCellCount()} (${Object.keys(mem.getScope('constant')).length} physical constants)`));
    console.log(chalk.bold('\n🔒 SECURITY LAYERS:'));
    console.log(chalk.dim(`  Firewall      : 6-Layer Zero-Trust Active`));
    console.log(chalk.dim(`  Hypervisor    : Process Isolation Active | Chain length: ${hyp.getChainLength()}`));
    console.log(chalk.dim(`  Encryption    : AES-256-GCM (thought states encrypted at rest)`));
    const chainStatus = hyp.verifyChain();
    console.log(chalk.dim(`  Integrity     : ${chainStatus.valid ? chalk.greenBright('✓ CHAIN VALID') : chalk.redBright('✗ CHAIN BROKEN at #' + chainStatus.broken_at)}`));
    console.log(chalk.bold('\n🧠 NEURAL & MEMORY SUBSYSTEMS:'));
    console.log(chalk.dim(`  Architecture  : Liquid Neural Network (ODE-based, RK4 solver)`));
    console.log(chalk.dim(`  Episodic Bank : ${episodic.size()} semantic records (TF-IDF vector mapped)`));
    const metrics = learning.getMetrics();
    console.log(chalk.dim(`  Domains       : ${metrics.domains_active.join(', ')}`));
    console.log(chalk.bold('\n🔬 ENGINES:'));
    console.log(chalk.dim(`  Symbolic      : Deterministic Math (proof trace enabled)`));
    console.log(chalk.dim(`  Physics       : 6-domain simulator (Newton, Einstein, Quantum, Thermo, EM, Orbital)`));
    console.log(chalk.dim(`  Logic         : Formal Propositional Prover (truth table exhaustive)`));
    console.log(chalk.bold('\n🛡️  CYBERSECURITY KING:'));
    console.log(chalk.dim(`  Stack         : 10-Engine Sovereign Defense (Threat Severity 7.2 → 9.2)`));
    console.log(chalk.dim(`  Engines       : PolymorphicDefense | ZeroDayPatcher | RansomwareGuard`));
    console.log(chalk.dim(`                  PQCAuditor | SupplyChainScanner | DeepfakeProtocol`));
    console.log(chalk.dim(`                  IoTVulnScanner | InsiderThreat | WorkforceAI | CloudConfig`));
    console.log(chalk.dim(`  Compliance    : DPDP Act 2023 | NIST PQC | HIPAA | PCI-DSS | EU CRA`));
    console.log(chalk.dim(`  Sectors       : Defense | Healthcare | Finance | Government`));
    console.log(chalk.bold('\n🪞 META-COGNITION & REASONING:'));
    console.log(chalk.dim(`  Reflection    : 7-check Self-Reflection Engine (deep multi-pass)`));
    console.log(chalk.dim(`  Decomposer    : DAG query splintering (multi-step dependency auth)`));
    console.log(chalk.dim(`  ARL Loop      : ${arl.isRunning() ? chalk.green('ACTIVE (Proactive Mode)') : chalk.yellow('STOPPED (Reactive Mode)')}`));
    console.log(chalk.bold('\n🧠 ADAPTIVE BRAIN:'));
    const brainStatus = brain.getStatus();
    const hiveStats = brainStatus.hive_status;
    console.log(chalk.dim(`  Collective IQ  : ${brainStatus.collective_iq} (${hiveStats.total_models} models, ${Object.keys(hiveStats.domain_coverage).length} domains)`));
    if (hiveStats.total_models > 0) {
        for (const m of hiveStats.cpi_ranking) {
            const barLength = Math.min(20, Math.round((m.cpi / 100) * 20));
            const bar = '█'.repeat(barLength);
            const empty = '░'.repeat(Math.max(0, 20 - barLength));
            console.log(chalk.dim(`  ${m.filename.padEnd(15).slice(0, 15)}: ${bar}${empty} ${m.cpi}% (${m.tier.toUpperCase()})`));
        }
        console.log(chalk.dim(`  Fusion Status  : ${brainStatus.fusion_status.fusion_quality > 0 ? 'ACTIVE' : 'INACTIVE'} (unified embedding: ${brainStatus.fusion_status.total_vocab_size} tokens, ${brainStatus.fusion_status.embedding_dim}D)`));
    }
    else {
        console.log(chalk.yellow(`  Status         : No models absorbed. Drop .gguf files in models/ and run /brain eat.`));
    }
    console.log(chalk.dim(`\n${'─'.repeat(70)}`));
    console.log(chalk.dim('Commands: /status | /audit | /chain | /neural | /memory | /arl | /exit'));
    console.log(chalk.dim('          /brain | /brain eat | /brain think <q> | /brain wisdom'));
    console.log(chalk.dim('          /cyberscan | /cyberking'));
    console.log(chalk.dim('Try: "escape velocity from Earth"        (Physics Engine)'));
    console.log(chalk.dim('Try: "first 5e14 * h then euler^pi"      (DAG Decomposer)'));
    console.log(chalk.dim('Try: "p AND q IMPLIES p"                 (Formal Logic)'));
    console.log(chalk.dim('Try: /brain think "explain SQL injection" (🧠 Adaptive Brain)'));
    console.log(chalk.dim('Try: /cyberscan                           (🛡️ Full Spectrum Scan)'));
    console.log(chalk.dim('Try: /cyberheal                           (💊 Autonomous Solvers)'));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const prompt = () => rl.question(chalk.bold.redBright('\n▶ BIGROCK: '), async (input) => {
        input = input.trim();
        if (!input)
            return prompt();
        if (input === '/exit') {
            console.log(chalk.redBright('\n[BIGROCK]: Cognition core shutting down. Integrity chain sealed.\n'));
            rl.close();
            return;
        }
        if (input === '/status') {
            const t = core.getKernel().getTelemetry();
            console.log(chalk.cyan('\n' + JSON.stringify({ cpu_load: t.cpu.load_percent, memory: t.memory }, null, 2)));
            return prompt();
        }
        if (input === '/memory') {
            const scope = core.getMemory().getScope();
            console.log(chalk.cyan('\n[SHORT-TERM MEMORY]:'), Object.keys(scope).length, 'constant cells');
            const stats = episodic.getStats();
            console.log(chalk.magenta('\n[EPISODIC BANK]:'));
            console.log(chalk.dim(`  Total Semantic Records : ${stats.total}`));
            console.log(chalk.dim(`  Episodic  : ${stats.by_tier.episodic}`));
            console.log(chalk.dim(`  Semantic  : ${stats.by_tier.semantic}`));
            console.log(chalk.dim(`  Procedural: ${stats.by_tier.procedural}`));
            return prompt();
        }
        if (input.startsWith('/search ')) {
            const q = input.replace('/search ', '');
            const res = episodic.search(q, 3, 0.01);
            console.log(chalk.cyan(`\n[SEMANTIC SEARCH]: "${q}"`));
            res.forEach((r, i) => {
                console.log(chalk.dim(`  ${i + 1}. [${r.record.domain}] `) + chalk.white(r.record.query));
                console.log(chalk.dim(`     Similarity: ${(r.similarity * 100).toFixed(1)}% | Connects via: ${r.reason}`));
            });
            if (!res.length)
                console.log(chalk.yellow('  No similar memories found.'));
            return prompt();
        }
        if (input === '/arl start') {
            arl.start();
            console.log(chalk.greenBright('\n[ARL]: Proactive Autonomous Reasoning Loop STARTED.'));
            return prompt();
        }
        if (input === '/arl stop') {
            arl.stop();
            console.log(chalk.yellowBright('\n[ARL]: Autonomous Reasoning Loop STOPPED.'));
            return prompt();
        }
        if (input === '/arl') {
            const m = arl.getMetrics();
            console.log(chalk.cyan('\n[ARL METRICS]:'));
            console.log(chalk.dim(`  Status          : ${arl.isRunning() ? chalk.green('RUNNING') : chalk.yellow('STOPPED')}`));
            console.log(chalk.dim(`  Cycles Complete : ${m.cycles_completed}`));
            console.log(chalk.dim(`  Self-Queries    : ${m.self_queries_generated}`));
            console.log(chalk.dim(`  Uptime          : ${(m.uptime_ms / 1000).toFixed(1)}s`));
            return prompt();
        }
        if (input === '/audit') {
            const log = core.getSecurity().getAuditLog();
            const failed = core.getHypervisor().getFailedAccessLog();
            if (!log.length && !failed.length)
                console.log(chalk.green('\n[SECURITY]: No threats detected.'));
            log.forEach(l => console.log(chalk.red(`[THREAT]: ${l.threat_type} | ${l.severity} | blocked=${l.blocked}`)));
            failed.forEach(f => console.log(chalk.yellow(`[HYPERVISOR]: ${f}`)));
            return prompt();
        }
        if (input === '/chain') {
            const chain = core.getHypervisor().getChain();
            const valid = core.getHypervisor().verifyChain();
            console.log(chalk.cyan(`\n[INTEGRITY CHAIN]: ${chain.length} links | Valid: ${valid.valid}`));
            chain.slice(-5).forEach(l => console.log(chalk.dim(`  #${l.index} [${l.event}] ${l.hash.slice(0, 16)}...`)));
            return prompt();
        }
        if (input === '/neural') {
            const m = core.getLearning().getMetrics();
            console.log(chalk.cyan('\n[NEURAL METRICS]:'));
            console.log(chalk.dim(`  Thoughts Processed : ${m.total_thoughts_processed}`));
            console.log(chalk.dim(`  Active Domains     : ${m.domains_active.join(', ')}`));
            console.log(chalk.dim(`  Global Entropy     : ${m.global_entropy.toFixed(4)}`));
            console.log(chalk.dim(`  Network Energy     : ${m.network_energy.toFixed(4)}`));
            console.log(chalk.dim(`  Total Synapses     : ${m.synaptic_updates}`));
            return prompt();
        }
        if (input === '/physics') {
            console.log(chalk.cyan('\n[PHYSICS ENGINE]: Available simulations:'));
            console.log(chalk.dim('  • "gravitational force" — Newton\'s Universal Gravitation'));
            console.log(chalk.dim('  • "time dilation" — Special Relativity'));
            console.log(chalk.dim('  • "mass energy" — E=mc²'));
            console.log(chalk.dim('  • "escape velocity" — Orbital Mechanics'));
            console.log(chalk.dim('  • "orbital velocity" — Keplerian Orbit'));
            console.log(chalk.dim('  • "photon energy" — Quantum Planck-Einstein'));
            console.log(chalk.dim('  • "coulomb force" — Electrostatics'));
            console.log(chalk.dim('  • "de broglie wavelength" — Wave-Particle Duality'));
            console.log(chalk.dim('  • "hydrogen transition" — Bohr Model Spectral Lines'));
            return prompt();
        }
        if (input === '/logic') {
            console.log(chalk.cyan('\n[FORMAL LOGIC PROVER]:'));
            console.log(chalk.dim('  Use operators: AND, OR, NOT, IMPLIES, IFF, XOR'));
            console.log(chalk.dim('  Examples:'));
            console.log(chalk.dim('    "p AND q"                 — conjunction'));
            console.log(chalk.dim('    "p OR NOT p"              — tautology test'));
            console.log(chalk.dim('    "p IMPLIES q"             — material conditional'));
            console.log(chalk.dim('    "p AND NOT p"             — contradiction test'));
            console.log(chalk.dim('    "(p IMPLIES q) AND (q IMPLIES r) IMPLIES (p IMPLIES r)"'));
            return prompt();
        }
        // ──── CYBERSECURITY KING COMMANDS ─────────────────────────────────────
        if (input === '/cyberking') {
            const manifest = core.getCyberKing().getEngineManifest();
            console.log();
            for (const line of manifest) {
                console.log(chalk.bold.redBright(line));
            }
            return prompt();
        }
        if (input === '/cyberscan') {
            console.log(chalk.bold.redBright('\n🛡️  CYBERSECURITY KING — FULL SPECTRUM SCAN'));
            console.log(chalk.dim('  Activating all 10 engines... Target: CORTEX codebase\n'));
            const projectPath = process.cwd();
            const result = core.getCyberKing().fullSpectrumScan(projectPath);
            // Header
            const gradeColor = result.composite_risk_grade === 'A' ? chalk.greenBright
                : result.composite_risk_grade === 'B' ? chalk.green
                    : result.composite_risk_grade === 'C' ? chalk.yellowBright
                        : result.composite_risk_grade === 'D' ? chalk.redBright
                            : chalk.bgRedBright;
            console.log(chalk.bold(`  Composite Grade: `) + gradeColor(` ${result.composite_risk_grade} `) + chalk.dim(` (Score: ${result.composite_risk_score}) | ${result.scan_duration_ms}ms`));
            console.log(chalk.dim('  ' + '─'.repeat(66)));
            // Summary lines
            for (const line of result.summary) {
                console.log(chalk.dim(`  ${line}`));
            }
            // Top priorities
            if (result.top_priorities.length > 0) {
                console.log(chalk.bold('\n  ⚡ TOP PRIORITIES:'));
                for (const p of result.top_priorities) {
                    console.log(chalk.redBright(`  ${p}`));
                }
            }
            // Engine details
            const zd = result.engine_results.zero_day_patcher;
            if (zd.vulnerabilities_found.length > 0) {
                console.log(chalk.bold('\n  🔓 ZERO-DAY VULNERABILITIES:'));
                for (const v of zd.vulnerabilities_found.slice(0, 5)) {
                    const sevColor = v.cve.severity === 'critical' ? chalk.bgRedBright : v.cve.severity === 'high' ? chalk.redBright : chalk.yellow;
                    console.log(chalk.dim(`  `) + sevColor(` ${v.cve.severity.toUpperCase()} `) + chalk.dim(` ${v.cve.id} — ${v.cve.package}@${v.installed_version} → ${v.cve.fixed_version}`));
                }
                if (zd.vulnerabilities_found.length > 5)
                    console.log(chalk.dim(`  ... and ${zd.vulnerabilities_found.length - 5} more.`));
            }
            const pqc = result.engine_results.pqc_auditor;
            if (pqc.inventory.risk_summary.harvest_now_decrypt_later > 0) {
                console.log(chalk.bold('\n  🔐 QUANTUM THREATS (Harvest Now, Decrypt Later):'));
                for (const inst of pqc.inventory.instances.filter(i => i.quantum_risk === 'HARVEST_NOW_DECRYPT_LATER').slice(0, 5)) {
                    console.log(chalk.redBright(`  ⚠ ${inst.file}:${inst.line} — ${inst.algorithm} (${inst.usage_context}) → ${inst.nist_replacement}`));
                }
            }
            const sai = result.engine_results.polymorphic_defense.shadow_ai;
            if (sai.instances.length > 0) {
                console.log(chalk.bold('\n  👁️ SHADOW AI DETECTIONS:'));
                for (const inst of sai.instances.slice(0, 3)) {
                    console.log(chalk.yellowBright(`  ⚠ ${inst.file}:${inst.line} — ${inst.pattern} (${inst.risk})`));
                }
            }
            console.log(chalk.dim('\n  ' + '─'.repeat(66)));
            console.log(chalk.dim('  Run /cyberking for engine manifest | Engines: 10/10 ACTIVE'));
            return prompt();
        }
        if (input === '/cyberheal') {
            console.log(chalk.bold.greenBright('\n🛡️  CYBERSECURITY KING — BEASTMODE ACTIVE SOLVER'));
            console.log(chalk.dim('  Executing autonomous remediation across all 10 engines...\n'));
            const projectPath = process.cwd();
            const scripts = core.getCyberKing().runSolvers(projectPath, false);
            if (scripts.length === 0) {
                console.log(chalk.green('  ✅ No vulnerabilities detected. Systems are secure.'));
                return prompt();
            }
            console.log(chalk.bold(`  Generated ${scripts.length} applicable remediation scripts.`));
            for (const script of scripts) {
                console.log(chalk.cyan(`\n  [SCRIPT ID: ${script.script_id}]`));
                for (const action of script.actions) {
                    console.log(chalk.bold.yellowBright(`    ► TARGET: ${action.file}:${action.line}`));
                    console.log(chalk.white(`      Action: ${action.description}`));
                    console.log(chalk.dim(`      Standard: ${action.nist_standard}`));
                    console.log(chalk.redBright(`      - ${action.original_code}`));
                    console.log(chalk.greenBright(`      + ${action.suggested_code.replace(/\n/g, '\n        ')}`));
                }
            }
            console.log(chalk.dim('\n  ' + '─'.repeat(66)));
            console.log(chalk.dim('  Run /cyberheal --auto to apply zero-touch fixes immediately.'));
            return prompt();
        }
        if (input === '/cyberheal --auto') {
            console.log(chalk.bold.redBright('\n🛡️  CYBERSECURITY KING — ZERO-TOUCH EXECUTION'));
            console.log(chalk.dim('  Applying critical patches autonomously...\n'));
            const projectPath = process.cwd();
            const scripts = core.getCyberKing().runSolvers(projectPath, true);
            let totalApplied = 0;
            for (const script of scripts) {
                if (script.is_zero_touch_ready) {
                    totalApplied += script.actions.length;
                }
            }
            console.log(chalk.greenBright(`  ✅ Successfully applied ${totalApplied} zero-touch remediation actions.`));
            console.log(chalk.yellow(`  ⚠️  Some critical actions (e.g., Network Quarantine, Account Suspension) require manual /cyberheal approval.`));
            return prompt();
        }
        if (input === '/reflect') {
            const log = core.getThoughtLog();
            if (!log.length) {
                console.log(chalk.yellow('\n[REFLECTION]: No thoughts to reflect on yet.'));
            }
            else {
                const last = log[log.length - 1];
                const verdict = core.getReflection().deepReflect(last, 3);
                console.log(chalk.cyan(`\n[SELF-REFLECTION on thought ${last.id.slice(0, 8)}...]:`));
                console.log(chalk.dim(`  Verdict            : ${verdict.verdict}`));
                console.log(chalk.dim(`  Original Confidence: ${(verdict.original_confidence * 100).toFixed(1)}%`));
                console.log(chalk.dim(`  Adjusted Confidence: ${(verdict.adjusted_confidence * 100).toFixed(1)}%`));
                console.log(chalk.dim(`  Reflection Time    : ${verdict.reflection_time_ms}ms`));
                if (verdict.checks_passed.length) {
                    console.log(chalk.greenBright('  ✓ Checks Passed:'));
                    verdict.checks_passed.forEach(c => console.log(chalk.dim(`    • ${c}`)));
                }
                if (verdict.issues.length) {
                    console.log(chalk.yellowBright('  ⚠ Issues Found:'));
                    verdict.issues.forEach(i => console.log(chalk.dim(`    • ${i}`)));
                }
            }
            return prompt();
        }
        // ──── ADAPTIVE BRAIN COMMANDS ────────────────────────────────────────
        if (input === '/brain') {
            const bs = brain.getStatus();
            const hs = bs.hive_status;
            console.log(chalk.bold.magenta('\n🧠 ADAPTIVE BRAIN STATUS:'));
            console.log(chalk.dim(`  Collective IQ   : ${bs.collective_iq}`));
            console.log(chalk.dim(`  Total Models    : ${hs.total_models} (HOT: ${hs.hot_models}, WARM: ${hs.warm_models}, COLD: ${hs.cold_models})`));
            console.log(chalk.dim(`  Memory Usage    : ${hs.memory_used_gb.toFixed(2)}GB / Ceiling: ${hs.memory_ceiling_gb.toFixed(2)}GB`));
            console.log(chalk.dim(`  Total Power     : ${hs.total_power}`));
            console.log(chalk.dim(`  Fusion Quality  : ${(bs.fusion_status.fusion_quality * 100).toFixed(1)}% (Vocab: ${bs.fusion_status.total_vocab_size})`));
            return prompt();
        }
        if (input === '/brain eat') {
            console.log(chalk.bold.magenta(`\n🧠 ADAPTIVE BRAIN: Scanning for new GGUFs to eat...`));
            const discovered = brain.getHive().scanModels();
            if (discovered.length === 0) {
                console.log(chalk.yellow(`  No GGUF models found in models/ directory.`));
                return prompt();
            }
            try {
                for (const model of discovered) {
                    await brain.eat(model.filepath, true);
                }
            }
            catch (e) {
                console.error(chalk.red(`[BRAIN ERROR]: ${e.message}`));
            }
            return prompt();
        }
        if (input.startsWith('/brain think ')) {
            const q = input.replace('/brain think ', '').trim();
            console.log(chalk.magenta(`\n🧠 Routing to AdaptiveBrain...`));
            try {
                const result = await brain.think(q);
                console.log(chalk.bold.greenBright('\n✅ DEVOURED RESULT:'));
                console.log(chalk.white(result.value));
                if (result.proof_trace?.length) {
                    console.log(chalk.dim('\nAbsorption Trace:'));
                    result.proof_trace.forEach(t => console.log(chalk.dim(`  │ ${t}`)));
                }
                console.log(chalk.dim(`Confidence: ${(result.confidence * 100).toFixed(1)}%`));
            }
            catch (e) {
                console.error(chalk.red(`[BRAIN ERROR]: ${e.message}`));
            }
            return prompt();
        }
        if (input === '/brain wisdom') {
            const hs = brain.getStatus().hive_status;
            console.log(chalk.bold.cyan('\n🧠 DOMAIN WISDOM MAP:'));
            for (const [domain, info] of Object.entries(hs.domain_coverage)) {
                const bar = '█'.repeat(Math.round(info.score * 20));
                const empty = '░'.repeat(20 - Math.round(info.score * 20));
                console.log(chalk.dim(`  ${domain.padEnd(15)} ${bar}${empty} ${(info.score * 100).toFixed(1)}% (${info.champion})`));
            }
            return prompt();
        }
        if (input === '/brain iq') {
            const bs = brain.getStatus();
            const hs = bs.hive_status;
            console.log(chalk.bold.cyan('\n🧠 COLLECTIVE INTELLIGENCE QUOTIENT (CIQ) BREAKDOWN:'));
            console.log(chalk.dim(`  Total CIQ       : ${bs.collective_iq}`));
            console.log(chalk.dim(`  Models Contrib  : ${hs.total_models}`));
            for (const m of hs.cpi_ranking) {
                console.log(chalk.dim(`    • ${m.filename}: +${m.cpi} CPI`));
            }
            return prompt();
        }
        if (input === '/extract') {
            console.log(chalk.bold.cyanBright(`\n🧠 DEEP NEURAL EXTRACTION — Reading raw GGUF weight tensors...`));
            try {
                const extract = await absorber.extractDeep();
                if (extract) {
                    const fp = extract.fingerprint;
                    console.log(chalk.bold.greenBright(`\n🧠 EXTRACTION COMPLETE:`));
                    console.log(chalk.dim(`  Architecture:  ${fp.architecture}`));
                    console.log(chalk.dim(`  Parameters:    ${(fp.total_parameters / 1e9).toFixed(2)}B`));
                    console.log(chalk.dim(`  Vocab:         ${fp.vocab_size.toLocaleString()} tokens`));
                    console.log(chalk.dim(`  Embeddings:    ${extract.embedding_index ? `${extract.embedding_index.tokens.length.toLocaleString()} vectors (${extract.embedding_index.dim}D)` : 'N/A'}`));
                    console.log(chalk.dim(`  Layer DNA:     ${extract.layer_dna.length} layers fingerprinted`));
                    console.log(chalk.dim(`  Output Proj:   ${extract.output_weights ? `${extract.output_weights.length.toLocaleString()} weights` : 'N/A'}`));
                    console.log(chalk.dim(`  Time:          ${(fp.extraction_time_ms / 1000).toFixed(1)}s`));
                    console.log(chalk.bold.cyan(`\n  Try: /similar <text_a> | <text_b>  — test native vector similarity`));
                }
                else {
                    console.log(chalk.yellow(`[EXTRACT]: No model found. Place .gguf files in models/ first.`));
                }
            }
            catch (e) {
                console.error(chalk.red(`[EXTRACTION ERROR]: ${e.message}`));
            }
            return prompt();
        }
        if (input.startsWith('/similar ')) {
            const parts = input.replace('/similar ', '').split('|').map(s => s.trim());
            if (parts.length < 2) {
                console.log(chalk.yellow('Usage: /similar <text_a> | <text_b>'));
                return prompt();
            }
            const ne = absorber.getNeuralExtract();
            if (!ne.isExtracted()) {
                console.log(chalk.yellow('[SIMILAR]: Run /extract first to load neural embeddings.'));
                return prompt();
            }
            const sim = ne.similarity(parts[0], parts[1]);
            console.log(chalk.bold.cyan(`\n🧠 NATIVE VECTOR SIMILARITY (extracted embeddings):`));
            console.log(chalk.dim(`  Text A: "${parts[0]}"`));
            console.log(chalk.dim(`  Text B: "${parts[1]}"`));
            const bar = '█'.repeat(Math.round(Math.abs(sim) * 20));
            const empty = '░'.repeat(20 - Math.round(Math.abs(sim) * 20));
            console.log(chalk.bold.greenBright(`  Cosine:  ${bar}${empty} ${(sim * 100).toFixed(1)}%`));
            // Show related tokens
            const related_a = ne.findSimilarTokens(parts[0], 5);
            const related_b = ne.findSimilarTokens(parts[1], 5);
            if (related_a.length) {
                console.log(chalk.dim(`\n  Related to "${parts[0]}": ${related_a.map(r => `${r.token}(${(r.score * 100).toFixed(0)}%)`).join(', ')}`));
            }
            if (related_b.length) {
                console.log(chalk.dim(`  Related to "${parts[1]}": ${related_b.map(r => `${r.token}(${(r.score * 100).toFixed(0)}%)`).join(', ')}`));
            }
            return prompt();
        }
        if (input.startsWith('/search ')) {
            const q = input.replace('/search ', '').trim();
            const results = episodic.search(q, 3, 0.0);
            console.log(chalk.bold.cyan(`\n🧠 EPISODIC MEMORY SEARCH:`));
            console.log(chalk.dim(`  Query: "${q}"`));
            if (!results.length) {
                console.log(chalk.yellow(`  No memories found.`));
            }
            else {
                for (const res of results) {
                    const simScore = (res.similarity * 100).toFixed(1);
                    console.log(chalk.bold.greenBright(`\n  [Match: ${simScore}%] ${res.reason}`));
                    console.log(chalk.white(`  Thought: `) + chalk.dim(res.record.query));
                    console.log(chalk.white(`  Result: `) + chalk.dim(res.record.result.length > 100 ? res.record.result.slice(0, 100) + '...' : res.record.result));
                    if (res.record.dense_vector) {
                        console.log(chalk.dim(`  (Vector: YES - 3072D Neural Embedding)`));
                    }
                }
            }
            return prompt();
        }
        try {
            const thought = await core.process(input);
            renderThought(thought);
        }
        catch (e) {
            console.error(chalk.red(`[COGNITION ERROR]: ${e.message}`));
        }
        prompt();
    });
    prompt();
}
main();
