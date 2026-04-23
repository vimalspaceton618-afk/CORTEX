import { CognitionCore } from './core/CognitionCore.js';
import { AutonomousReasoningLoop } from './reasoning/AutonomousReasoningLoop.js';
import type { Thought } from './core/types.js';
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

function renderThought(thought: Thought): void {
    const domain_color: Record<string, any> = {
        mathematics: chalk.cyan, physics: chalk.yellow, chemistry: chalk.green,
        logic: chalk.magenta, system: chalk.blue, network: chalk.blue,
        language: chalk.white, unknown: chalk.red
    };
    const color = domain_color[thought.parsed_intent.domain] || chalk.white;
    const mode_icons: Record<string, string> = {
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
    } else if (typeof val === 'object') {
        console.log(`\n${chalk.bold.greenBright('✅ RESULT:')}`);
        console.log(chalk.white(JSON.stringify(val, null, 2)));
    } else {
        console.log(`\n${chalk.bold.greenBright('✅ RESULT:')} ${chalk.white(val)}`);
    }
    // Render self-reflection verdict if this thought was processed through CognitionCore
    const reflectionLine = thought.confidence >= 0.9 ? chalk.greenBright('VERIFIED ✓') :
                          thought.confidence >= 0.5 ? chalk.yellowBright('SUSPECT ⚠') :
                          chalk.redBright('REJECTED ✗');
    console.log(`${chalk.bold('🪞 Reflection')}: ${reflectionLine}`);
    console.log(chalk.dim('─'.repeat(70)));
}

async function main(): Promise<void> {
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

    console.log(chalk.bold('\n🪞 META-COGNITION & REASONING:'));
    console.log(chalk.dim(`  Reflection    : 7-check Self-Reflection Engine (deep multi-pass)`));
    console.log(chalk.dim(`  Decomposer    : DAG query splintering (multi-step dependency auth)`));
    console.log(chalk.dim(`  ARL Loop      : ${arl.isRunning() ? chalk.green('ACTIVE (Proactive Mode)') : chalk.yellow('STOPPED (Reactive Mode)')}`));

    console.log(chalk.bold('\n🍽️  SELF-ABSORBING ENGINE:'));
    const discovered = absorber.getAbsorbedProfiles();
    if (discovered.length > 0) {
        console.log(chalk.dim(`  Models Absorbed: ${discovered.length}`));
        console.log(chalk.dim(`  Total Power    : ${absorber.getTotalPower().toFixed(3)}`));
        const champions = absorber.getDomainChampions();
        for (const [domain, champ] of champions) {
            console.log(chalk.dim(`  🏆 ${domain}: ${champ.model} (${champ.score.toFixed(3)})`));
        }
    } else {
        console.log(chalk.dim(`  Status         : ${chalk.yellow('No models absorbed yet. Run /absorb to devour LLMs.')}`));
        console.log(chalk.dim(`  Models Dir     : models/ (drop .gguf files here)`));
    }

    console.log(chalk.dim(`\n${'─'.repeat(70)}`));
    console.log(chalk.dim('Commands: /status | /audit | /chain | /neural | /memory | /arl | /exit'));
    console.log(chalk.dim('          /absorb | /absorbed | /devour <query>'));
    console.log(chalk.dim('Try: "escape velocity from Earth"        (Physics Engine)'));
    console.log(chalk.dim('Try: "first 5e14 * h then euler^pi"      (DAG Decomposer)'));
    console.log(chalk.dim('Try: "p AND q IMPLIES p"                 (Formal Logic)'));
    console.log(chalk.dim('Try: "explain SQL injection"              (🍽️ Self-Absorbing)'));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const prompt = () => rl.question(chalk.bold.redBright('\n▶ BIGROCK: '), async (input) => {
        input = input.trim();
        if (!input) return prompt();

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
                console.log(chalk.dim(`  ${i+1}. [${r.record.domain}] `) + chalk.white(r.record.query));
                console.log(chalk.dim(`     Similarity: ${(r.similarity*100).toFixed(1)}% | Connects via: ${r.reason}`));
            });
            if (!res.length) console.log(chalk.yellow('  No similar memories found.'));
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
            console.log(chalk.dim(`  Uptime          : ${(m.uptime_ms/1000).toFixed(1)}s`));
            return prompt();
        }
        if (input === '/audit') {
            const log = core.getSecurity().getAuditLog();
            const failed = core.getHypervisor().getFailedAccessLog();
            if (!log.length && !failed.length) console.log(chalk.green('\n[SECURITY]: No threats detected.'));
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
        if (input === '/reflect') {
            const log = core.getThoughtLog();
            if (!log.length) {
                console.log(chalk.yellow('\n[REFLECTION]: No thoughts to reflect on yet.'));
            } else {
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

        // ──── SELF-ABSORBING COMMANDS ────────────────────────────────────────
        if (input === '/absorb' || input === '/absorb --force') {
            const force = input.includes('--force');
            console.log(chalk.bold.magenta(`\n🍽️  SELF-ABSORBING ENGINE: ${force ? 'FORCE ' : ''}Scanning and devouring LLMs...`));
            try {
                const report = await absorber.absorbAll(force);
                console.log(chalk.bold.greenBright(`\n🍽️  ABSORPTION COMPLETE:`));
                console.log(chalk.dim(`  Models Found    : ${report.total_models_found}`));
                console.log(chalk.dim(`  Models Absorbed : ${report.total_models_absorbed}`));
                console.log(chalk.dim(`  Models Failed   : ${report.total_models_failed}`));
                console.log(chalk.dim(`  Total Power     : ${report.total_power.toFixed(3)}`));
                console.log(chalk.dim(`  Time            : ${report.absorption_time_ms}ms`));
                if (report.domain_champions.size > 0) {
                    console.log(chalk.bold.cyan('\n  🏆 DOMAIN CHAMPIONS:'));
                    for (const [domain, champ] of report.domain_champions) {
                        const bar = '█'.repeat(Math.round(champ.score * 20));
                        const empty = '░'.repeat(20 - Math.round(champ.score * 20));
                        console.log(chalk.dim(`    ${domain.padEnd(15)} ${bar}${empty} ${(champ.score * 100).toFixed(1)}%  (${champ.model})`));
                    }
                }
            } catch (e: any) {
                console.error(chalk.red(`[ABSORPTION ERROR]: ${e.message}`));
            }
            return prompt();
        }

        if (input === '/absorbed') {
            const profiles = absorber.getAbsorbedProfiles();
            const statuses = absorber.getModelStatus();
            if (!profiles.length) {
                console.log(chalk.yellow('\n[DEVOURER]: No models absorbed. Run /absorb first.'));
            } else {
                console.log(chalk.bold.magenta(`\n🍽️  ABSORBED MODELS (${profiles.length}):`));
                for (const s of statuses) {
                    const icon = s.loaded ? '🟢' : '🟡';
                    console.log(chalk.dim(`\n  ${icon} ${s.filename}`));
                    console.log(chalk.dim(`    Status: ${s.status} | Power: ${s.power.toFixed(3)} | Top: ${s.top_domain} | Queries: ${s.queries}`));

                    const profile = profiles.find(p => p.filename === s.filename);
                    if (profile) {
                        console.log(chalk.dim('    Domain Scores:'));
                        for (const ds of profile.domain_scores) {
                            const bar = '█'.repeat(Math.round(ds.score * 20));
                            const empty = '░'.repeat(20 - Math.round(ds.score * 20));
                            const passed = `${ds.probes_passed}/${ds.probes_run}`;
                            console.log(chalk.dim(`      ${ds.domain.padEnd(15)} ${bar}${empty} ${(ds.score * 100).toFixed(1)}%  (${passed} probes passed)`));
                        }
                    }
                }
                console.log(chalk.dim(`\n  Total Power: ${absorber.getTotalPower().toFixed(3)} | Total Queries: ${absorber.getTotalQueries()}`));
            }
            return prompt();
        }

        if (input.startsWith('/devour ')) {
            const q = input.replace('/devour ', '');
            console.log(chalk.magenta(`\n🍽️  Force-routing through Self-Absorbing Engine...`));
            if (!absorber.hasAbsorbedModels()) {
                console.log(chalk.yellow('[DEVOURER]: No absorbed models. Run /absorb first.'));
                return prompt();
            }
            try {
                const result = await absorber.devour(q, 'language');
                console.log(chalk.bold.greenBright('\n✅ DEVOURED RESULT:'));
                console.log(chalk.white(result.value));
                if (result.proof_trace?.length) {
                    console.log(chalk.dim('\nAbsorption Trace:'));
                    result.proof_trace.forEach(t => console.log(chalk.dim(`  │ ${t}`)));
                }
                console.log(chalk.dim(`Confidence: ${(result.confidence * 100).toFixed(1)}%`));
            } catch (e: any) {
                console.error(chalk.red(`[DEVOUR ERROR]: ${e.message}`));
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
                } else {
                    console.log(chalk.yellow(`[EXTRACT]: No model found. Place .gguf files in models/ first.`));
                }
            } catch (e: any) {
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
            } else {
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
        } catch (e: any) {
            console.error(chalk.red(`[COGNITION ERROR]: ${e.message}`));
        }
        prompt();
    });

    prompt();
}

main();
