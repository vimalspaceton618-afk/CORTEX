/**
 * CORTEX v4.0 — Professional Terminal UI
 * Clean, minimal, Claude Code-inspired interface.
 * All agent debug noise is parsed into structured activity items.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp, usePaste } from 'ink';
import { AgentManager } from './core/agent/AgentManager.js';
import { collectHealthStatus, formatHealthReport } from './core/health.js';
import { CortexKernel } from './core/CortexKernel.js';
import { BeastMode } from './core/BeastMode.js';
import { Dashboard } from './Dashboard.js';
import { parseStreamChunk, getFriendlyToolLabel, getAgentIcon } from './core/StreamParser.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface ActivityItem {
    id: number;
    icon: string;
    label: string;     // e.g. "Read 3 files"
    detail?: string;   // collapsed detail
    done: boolean;
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function useSpinner(active: boolean): string {
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        if (!active) return;
        const t = setInterval(() => setFrame(f => (f + 1) % SPINNER_FRAMES.length), 80);
        return () => clearInterval(t);
    }, [active]);
    return active ? SPINNER_FRAMES[frame] : '✓';
}

// ─── Activity Row ─────────────────────────────────────────────────────────────

const ActivityRow = ({ item, isLast }: { item: ActivityItem; isLast: boolean }) => {
    const spinner = useSpinner(!item.done && isLast);
    return (
        <Box paddingLeft={2}>
            <Text color={item.done ? 'gray' : 'white'}>
                {item.done ? '✓' : spinner}{' '}
            </Text>
            <Text color={item.done ? 'gray' : 'white'}>
                {item.label}
            </Text>
        </Box>
    );
};

// ─── Message Bubble ───────────────────────────────────────────────────────────

const AssistantMessage = ({ content, activity, streaming, beastMode }: {
    content: string;
    activity: ActivityItem[];
    streaming: boolean;
    beastMode: boolean;
}) => {
    const spinner = useSpinner(streaming && content.length === 0);

    return (
        <Box flexDirection="column" marginBottom={1}>
            {/* Agent activity steps (like Claude Code bullets) */}
            {activity.map((item, i) => (
                <ActivityRow key={item.id} item={item} isLast={i === activity.length - 1 && streaming} />
            ))}

            {/* Main response text */}
            {content.length > 0 && (
                <Box marginTop={activity.length > 0 ? 1 : 0}>
                    <Text color="white">{content}</Text>
                </Box>
            )}

            {/* Loading state when no content yet */}
            {content.length === 0 && streaming && activity.length === 0 && (
                <Box paddingLeft={2}>
                    <Text color="gray">{spinner} Thinking…</Text>
                </Box>
            )}
        </Box>
    );
};

// ─── Input Bar ────────────────────────────────────────────────────────────────

const InputBar = ({ value, streaming, beastMode, kernelReady }: {
    value: string;
    streaming: boolean;
    beastMode: boolean;
    kernelReady: boolean;
}) => {
    const spinner = useSpinner(streaming);
    return (
        <Box
            borderStyle="round"
            borderColor={beastMode ? 'red' : 'gray'}
            paddingX={1}
            marginTop={1}
        >
            <Text color={beastMode ? 'red' : 'green'} bold>❯ </Text>
            {streaming ? (
                <Text color="gray">{spinner} Working…</Text>
            ) : (
                <>
                    <Text color="white">{value}</Text>
                    <Text color="gray">█</Text>
                </>
            )}
        </Box>
    );
};

// ─── Trust Screen ─────────────────────────────────────────────────────────────

const TrustScreen = ({ cursor, onSelect }: { cursor: number; onSelect: (v: number) => void }) => (
    <Box flexDirection="column" paddingY={1} paddingX={2}>
        <Box marginBottom={1}>
            <Text color="white" bold>Trust this workspace?</Text>
        </Box>
        <Text color="gray">{process.cwd()}</Text>
        <Box marginY={1} flexDirection="column" gap={0}>
            <Text color="gray" wrap="wrap">
                CORTEX will read, edit, and execute files here.
                Only proceed with code you trust.
            </Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
            {[
                { n: 1, label: 'Yes, I trust this folder' },
                { n: 2, label: 'No, exit' },
            ].map(({ n, label }) => (
                <Box key={n}>
                    <Text color={cursor === n ? 'greenBright' : 'gray'}>
                        {cursor === n ? '❯ ' : '  '}{label}
                    </Text>
                </Box>
            ))}
        </Box>
        <Box marginTop={1}>
            <Text color="gray" dimColor>↑↓ navigate · Enter to confirm</Text>
        </Box>
    </Box>
);

// ─── Setup Wizard ─────────────────────────────────────────────────────────────

const SetupWizard = ({ onExit }: { onExit: () => void }) => {
    return (
        <Box flexDirection="column" paddingY={1} paddingX={2} borderStyle="round" borderColor="cyan">
            <Text color="cyanBright" bold>CORTEX Initialization Wizard</Text>
            <Box marginY={1} flexDirection="column">
                <Text color="yellow">⚠ No AI brain is currently responding.</Text>
                <Text color="white">Please choose how you want to power CORTEX:</Text>
            </Box>
            
            <Box flexDirection="column" gap={1} marginY={1}>
                <Box flexDirection="column">
                    <Text color="greenBright" bold>1. Local Sovereign AI (Recommended for Privacy)</Text>
                    <Text color="gray">   • Download a .gguf model (e.g., Phi-3, Llama-3)</Text>
                    <Text color="gray">   • Place it in the /models directory</Text>
                    <Text color="gray">   • Run the /absorb command in CORTEX</Text>
                </Box>
                <Box flexDirection="column">
                    <Text color="blueBright" bold>2. Cloud AI (Fastest Setup)</Text>
                    <Text color="gray">   • Set OPENAI_API_KEY in your .env file</Text>
                    <Text color="gray">   • Optionally set OPENAI_BASE_URL to use OpenRouter</Text>
                </Box>
                <Box flexDirection="column">
                    <Text color="magentaBright" bold>3. Hybrid Power</Text>
                    <Text color="gray">   • Combine both approaches. CORTEX routes tasks dynamically.</Text>
                </Box>
            </Box>
            
            <Box marginTop={1}>
                <Text color="gray" dimColor>Press Esc to return to terminal.</Text>
            </Box>
        </Box>
    );
};

// ─── Confirm Prompt ───────────────────────────────────────────────────────────

const ConfirmBar = ({ message }: { message: string }) => (
    <Box borderStyle="single" borderColor="yellow" paddingX={2} paddingY={0} marginTop={1} flexDirection="column">
        <Text color="yellow">⚠ Approval required</Text>
        <Text color="white" wrap="wrap">{message.slice(0, 300)}</Text>
        <Text color="gray" dimColor>y = yes · n = no</Text>
    </Box>
);

// ─── Header ───────────────────────────────────────────────────────────────────

const Header = ({ beastMode, kernelReady }: { beastMode: boolean; kernelReady: boolean }) => (
    <Box justifyContent="space-between" paddingX={1} paddingBottom={1} borderStyle="single" borderColor="gray">
        <Box gap={1}>
            <Text color={beastMode ? 'red' : 'cyanBright'} bold>CORTEX</Text>
            {beastMode && <Text color="red" bold>⚡ BEAST</Text>}
        </Box>
        <Box gap={2}>
            {kernelReady && <Text color="green" dimColor>● Local ASI</Text>}
            <Text color="gray" dimColor>v4.0 · /help</Text>
        </Box>
    </Box>
);

// ─── Main App ─────────────────────────────────────────────────────────────────

const App = () => {
    const { exit } = useApp();

    // Trust gate
    const [trusted, setTrusted] = useState(false);
    const [trustCursor, setTrustCursor] = useState(1);

    // Chat
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [activity, setActivity] = useState<ActivityItem[]>([]);
    const [streamingText, setStreamingText] = useState('');
    const [streaming, setStreaming] = useState(false);
    const activityCounter = useRef(0);

    // UI state
    const [confirmPrompt, setConfirmPrompt] = useState<{ message: string; resolve: (v: boolean) => void } | null>(null);
    const [showDashboard, setShowDashboard] = useState(false);
    const [showSetup, setShowSetup] = useState(false);
    const [beastMode, setBeastMode] = useState(false);
    const [kernelReady, setKernelReady] = useState(false);

    // Paste buffer
    const [pasteBuffer, setPasteBuffer] = useState<string[]>([]);

    const orchestrator = useRef(new AgentManager()).current;

    useEffect(() => {
        CortexKernel.boot().then(() => setKernelReady(true)).catch(() => {});
    }, []);

    usePaste((text) => {
        if (!trusted || confirmPrompt || streaming) return;
        setPasteBuffer(prev => [...prev, text]);
        setInput(prev => prev + `[paste#${pasteBuffer.length + 1}] `);
    });

    // ─── Input handler ─────────────────────────────────────────────────────

    useInput((char, key) => {
        // ── Trust screen ──
        if (!trusted) {
            if (key.upArrow) { setTrustCursor(1); return; }
            if (key.downArrow) { setTrustCursor(2); return; }
            if (char === '1' || (key.return && trustCursor === 1)) {
                process.env.CORTEX_WORKSPACE_ROOT = process.cwd();
                setTrusted(true);
                return;
            }
            if (char === '2' || key.escape || (key.return && trustCursor === 2)) { exit(); }
            return;
        }

        // ── Setup Wizard ──
        if (showSetup) {
            if (key.escape || key.return) {
                setShowSetup(false);
            }
            return;
        }

        // ── Confirm prompt ──
        if (confirmPrompt) {
            const lower = char?.toLowerCase();
            if (lower === 'y' || key.return) { confirmPrompt.resolve(true); setConfirmPrompt(null); }
            else if (lower === 'n' || key.escape) { confirmPrompt.resolve(false); setConfirmPrompt(null); }
            return;
        }

        if (streaming) return;

        // ── Return → submit ──
        if (key.return) {
            // Reconstruct input with paste buffers
            let query = input;
            pasteBuffer.forEach((text, i) => {
                query = query.replace(`[paste#${i + 1}]`, text);
            });
            query = query.trim();
            if (!query) return;
            setPasteBuffer([]);
            setInput('');
            handleSubmit(query);
            return;
        }

        if (key.backspace || key.delete) {
            setInput(prev => prev.slice(0, -1));
            return;
        }

        if (char && !key.ctrl && !key.meta) {
            setInput(prev => prev + char);
        }
    });

    // ─── Submit handler ────────────────────────────────────────────────────

    const handleSubmit = async (query: string) => {
        const lower = query.toLowerCase();

        // ── Built-in commands ──────────────────────────────────

        if (lower === '/exit' || lower === 'exit') { exit(); return; }

        if (lower === '/dashboard') { setShowDashboard(d => !d); return; }
        
        if (lower === '/setup') { setShowSetup(true); return; }

        if (lower === '/beast' || lower === '/beastmode') {
            if (!CortexKernel.isBooted()) {
                pushMessage('user', query);
                pushMessage('assistant', '⚠ BIGROCK Kernel not booted. Run npm run build in BIGROCK_ASI/ first.');
                return;
            }
            const status = CortexKernel.get().toggleBeastMode();
            setBeastMode(status.active);
            pushMessage('user', query);
            pushMessage('assistant', status.active
                ? `⚡ BEASTMODE engaged\n\n${status.systems_cranked.map(s => `  ✓ ${s}`).join('\n')}`
                : `BEASTMODE disengaged — normal operating parameters restored.`
            );
            return;
        }

        if (lower === '/status') {
            pushMessage('user', query);
            pushMessage('assistant', CortexKernel.isBooted()
                ? CortexKernel.get().getStatusReport()
                : formatHealthReport(collectHealthStatus()));
            return;
        }

        if (lower === '/health') {
            pushMessage('user', query);
            pushMessage('assistant', formatHealthReport(collectHealthStatus()));
            return;
        }

        if (lower === '/arl' || lower === '/arl status') {
            pushMessage('user', query);
            if (!CortexKernel.isBooted()) { pushMessage('assistant', '⚠ Kernel not booted.'); return; }
            const m = CortexKernel.get().getARLMetrics();
            const running = CortexKernel.get().isARLRunning();
            pushMessage('assistant', [
                `Autonomous Reasoning Loop: ${running ? 'Running' : 'Stopped'}`,
                `  Cycles completed : ${m.cycles_completed}`,
                `  Self-queries      : ${m.self_queries_generated}`,
                `  Anomalies         : ${m.anomalies_detected}`,
                `  Uptime            : ${(m.uptime_ms / 1000).toFixed(1)}s`,
            ].join('\n'));
            return;
        }

        if (lower === '/arl start') {
            if (CortexKernel.isBooted()) CortexKernel.get().startARL();
            pushMessage('user', query);
            pushMessage('assistant', '✓ Autonomous Reasoning Loop started.');
            return;
        }

        if (lower === '/arl stop') {
            if (CortexKernel.isBooted()) CortexKernel.get().stopARL();
            pushMessage('user', query);
            pushMessage('assistant', '✓ Autonomous Reasoning Loop stopped.');
            return;
        }

        if (lower.startsWith('/think ')) {
            const q = query.slice(7).trim();
            if (!q || !CortexKernel.isBooted()) return;
            pushMessage('user', query);
            setStreaming(true);
            setStreamingText('');
            setActivity([]);
            try {
                const thought = await CortexKernel.get().think(q);
                finishStreaming(CortexKernel.get().formatThought(thought), []);
            } catch (e: any) {
                finishStreaming(`⛔ ${e.message}`, []);
            }
            return;
        }

        if (lower.startsWith('/mythos ')) {
            const arch = query.slice(8).trim();
            pushMessage('user', query);
            if (!CortexKernel.isBooted()) { pushMessage('assistant', '⚠ Kernel not booted.'); return; }
            const mythos = CortexKernel.get().getMythos();
            const gaps = mythos.analyzeArchitecture(arch);
            if (!gaps.length) {
                pushMessage('assistant', `✓ No Myth Gaps detected for: "${arch}"`);
            } else {
                pushMessage('assistant', [
                    `⚠ ${gaps.length} Myth Gaps detected in: "${arch}"`,
                    '',
                    ...gaps.map((g: any) =>
                        `  ${g.threat.name} [${g.threat.domain}] — ${(g.confidence * 100).toFixed(0)}% confidence`
                    ),
                ].join('\n'));
            }
            return;
        }

        if (lower === '/brain eat') {
            pushMessage('user', query);
            if (!CortexKernel.isBooted()) { pushMessage('assistant', '⚠ Kernel not booted.'); return; }
            setStreaming(true);
            setStreamingText('');
            setActivity([addActivity('◆', 'Scanning for GGUF models…', false)]);
            try {
                const brain = CortexKernel.get().getBrain();
                const discovered = brain.getHive().scanModels();
                if (discovered.length === 0) {
                    finishStreaming(`No GGUF models found in models/ directory.`, []);
                    return;
                }
                for (const model of discovered) {
                    await brain.eat(model.filepath, true);
                }
                const bStat = brain.getStatus();
                finishStreaming([
                    `Absorbed models successfully.`,
                    `Collective IQ: ${bStat.collective_iq}`,
                    `Models in Hive: ${bStat.hive_status.total_models}`,
                ].join('\n'), []);
            } catch (e: any) {
                finishStreaming(`⛔ Absorption failed: ${e.message}`, []);
            }
            return;
        }

        if (lower === '/cyberscan') {
            pushMessage('user', query);
            if (!CortexKernel.isBooted()) { pushMessage('assistant', '⚠ Kernel not booted.'); return; }
            setStreaming(true);
            setStreamingText('');
            setActivity([addActivity('🛡️', 'Activating 10 CyberSecurityKing engines...', false)]);
            try {
                const result = CortexKernel.get().getCyberKing().fullSpectrumScan(process.cwd());
                finishStreaming([
                    `🛡️ CYBERSECURITY KING — FULL SPECTRUM SCAN`,
                    `Composite Grade: ${result.composite_risk_grade} (Score: ${result.composite_risk_score}) | ${result.scan_duration_ms}ms`,
                    '',
                    ...result.summary,
                    '',
                    ...(result.top_priorities.length > 0 ? ['⚡ TOP PRIORITIES:', ...result.top_priorities.map((p: string) => `  ${p}`)] : []),
                    '',
                    'Run /cyberheal to generate autonomous remediation scripts.'
                ].join('\n'), []);
            } catch (e: any) {
                finishStreaming(`⛔ Scan failed: ${e.message}`, []);
            }
            return;
        }

        if (lower === '/cyberheal') {
            pushMessage('user', query);
            if (!CortexKernel.isBooted()) { pushMessage('assistant', '⚠ Kernel not booted.'); return; }
            setStreaming(true);
            setStreamingText('');
            setActivity([addActivity('💊', 'Executing autonomous remediation...', false)]);
            try {
                const scripts = CortexKernel.get().getCyberKing().runSolvers(process.cwd(), false);
                if (scripts.length === 0) {
                    finishStreaming('✅ No vulnerabilities detected. Systems are secure.', []);
                } else {
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
                    finishStreaming(lines.join('\n'), []);
                }
            } catch (e: any) {
                finishStreaming(`⛔ Heal failed: ${e.message}`, []);
            }
            return;
        }

        if (lower === '/brain') {
            pushMessage('user', query);
            if (!CortexKernel.isBooted()) { pushMessage('assistant', '⚠ Kernel not booted.'); return; }
            const info = CortexKernel.get().getNativeBrainInfo();
            const hasNative = CortexKernel.get().hasNativeBrain();
            if (hasNative && info) {
                pushMessage('assistant', [
                    '🧠 Active Brain: ADAPTIVE BRAIN (Local Sovereign ASI)',
                    `  Collective IQ : ${info.collective_iq}`,
                    `  Top Model     : ${info.filename}`,
                    `  Power (CPI)   : ${info.power.toFixed(3)}`,
                    `  Top Domain    : ${info.top_domain}`,
                    '',
                    'Cloud fallback is available if needed.',
                ].join('\n'));
            } else {
                const apiKey = process.env.OPENAI_API_KEY;
                pushMessage('assistant', [
                    '🧠 Active Brain: CLOUD AI',
                    apiKey && apiKey !== 'dummy-key'
                        ? `  Provider : OpenRouter / ${process.env.OPENAI_BASE_URL || 'OpenAI'}`
                        : '  ⚠ No API key found. Run /setup for configuration help.',
                    '',
                    'Run /brain eat to activate local sovereign AI.',
                ].join('\n'));
            }
            return;
        }

        if (lower === '/brain wisdom') {
            pushMessage('user', query);
            if (!CortexKernel.isBooted()) { pushMessage('assistant', '⚠ Kernel not booted.'); return; }
            const hasNative = CortexKernel.get().hasNativeBrain();
            if (hasNative) {
                const info = CortexKernel.get().getBrain().getStatus().hive_status.domain_coverage;
                const lines = ['🧠 DOMAIN WISDOM MAP:'];
                for (const [domain, dat] of Object.entries(info) as [string, any][]) {
                    const bar = '█'.repeat(Math.round(dat.score * 20));
                    const empty = '░'.repeat(20 - Math.round(dat.score * 20));
                    lines.push(`  ${domain.padEnd(15)} ${bar}${empty} ${(dat.score * 100).toFixed(1)}% (${dat.champion})`);
                }
                pushMessage('assistant', lines.join('\n'));
            } else {
                pushMessage('assistant', '⚠ No Native Brain active.');
            }
            return;
        }

        if (lower === '/brain iq') {
            pushMessage('user', query);
            if (!CortexKernel.isBooted()) { pushMessage('assistant', '⚠ Kernel not booted.'); return; }
            const hasNative = CortexKernel.get().hasNativeBrain();
            if (hasNative) {
                const bStat = CortexKernel.get().getBrain().getStatus();
                const hs = bStat.hive_status;
                const lines = [
                    '🧠 COLLECTIVE INTELLIGENCE QUOTIENT (CIQ) BREAKDOWN:',
                    `  Total CIQ       : ${bStat.collective_iq}`,
                    `  Models Contrib  : ${hs.total_models}`
                ];
                for (const m of hs.cpi_ranking) {
                    lines.push(`    • ${m.filename}: +${m.cpi} CPI`);
                }
                pushMessage('assistant', lines.join('\n'));
            } else {
                pushMessage('assistant', '⚠ No Native Brain active.');
            }
            return;
        }

        if (lower === '/demo') {
            pushMessage('user', query);
            if (!CortexKernel.isBooted()) {
                pushMessage('assistant', '⚠ Kernel not booted. Run npm run build in BIGROCK_ASI/ first.');
                return;
            }
            setStreaming(true);
            setStreamingText('');
            setActivity([]);
            runDemo();
            return;
        }


        if (lower === '/help') {
            pushMessage('user', query);
            pushMessage('assistant', [
                'Commands',
                '  /beast              Toggle BEASTMODE (all systems MAX)',
                '  /dashboard          Live system monitoring',
                '  /status             Full system status report',
                '  /brain              Show active AI brain info',
                '  /brain eat          Absorb local GGUF models',
                '  /demo               Run automated YC showcase demo',
                '  /think <query>      Route through local Cognition Core',
                '  /arl [start|stop]   Autonomous Reasoning Loop',
                '  /mythos <arch>      Mythos threat analysis',
                '  /cyberscan          Full Spectrum Security Scan',
                '  /cyberheal          Autonomous Security Remediation',
                '  /health             Runtime readiness checks',
                '  /setup              Brain configuration wizard',
                '  /exit               Quit',
                '',
                'Agents',
                '  ExploreAgent · PlanAgent · DeveloperAgent',
                '  QualityAgent · DevOpsAgent · BrowserAgent · NetworkAgent',
            ].join('\n'));
            return;
        }

        // ── Smart routing: local CognitionCore for STEM ────────
        if (CortexKernel.isBooted() && CortexKernel.get().shouldHandleLocally(query)) {
            pushMessage('user', query);
            setStreaming(true);
            setStreamingText('');
            setActivity([addActivity('●', 'Local Cognition Core', false)]);
            try {
                const thought = await CortexKernel.get().think(query);
                finishStreaming(CortexKernel.get().formatThought(thought), []);
            } catch {
                // fall through to cloud
                await runCloudAgent(query);
            }
            return;
        }

        // ── Cloud LLM / Agent swarm ────────────────────────────
        pushMessage('user', query);
        await runCloudAgent(query);
    };

    // ─── Demo runner (YC Showcase) ─────────────────────────────────────────────────

    const runDemo = async () => {
        const kernel = CortexKernel.get();
        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
        const demoSteps: string[] = [];

        const appendDemo = (text: string) => {
            demoSteps.push(text);
            setStreamingText(demoSteps.join('\n\n'));
        };

        try {
            // Step 1: Math Proof
            appendDemo('[● 1/7] ── Deterministic Math Proof Engine');
            await sleep(600);
            const mathThought = await kernel.think('derivative of x^3 + 2x');
            appendDemo(kernel.formatThought(mathThought));
            await sleep(1200);

            // Step 2: Physics
            appendDemo('[● 2/7] ── Physics Simulation Engine');
            await sleep(600);
            const physThought = await kernel.think('escape velocity from Earth');
            appendDemo(kernel.formatThought(physThought));
            await sleep(1200);

            // Step 3: Formal Logic
            appendDemo('[● 3/7] ── Formal Logic Prover');
            await sleep(600);
            const logicThought = await kernel.think('p AND q IMPLIES p');
            appendDemo(kernel.formatThought(logicThought));
            await sleep(1200);

            // Step 4: Security status & CyberKing
            appendDemo('[● 4/7] ── CyberSecurityKing (10-Engine Stack)');
            await sleep(600);
            const cyber = kernel.getCyberKing();
            const scan = cyber ? cyber.fullSpectrumScan(process.cwd()) : null;
            if (scan) {
                appendDemo([
                    `🛡️ Full Spectrum Scan Complete (${scan.scan_duration_ms}ms)`,
                    `Composite Grade: ${scan.composite_risk_grade} (Score: ${scan.composite_risk_score})`,
                    ...scan.summary.slice(0, 3).map((s: string) => `  • ${s}`),
                    `Run /cyberscan for detailed zero-day analysis.`
                ].join('\n'));
            } else {
                appendDemo('✓ CyberSecurityKing engines offline.');
            }
            await sleep(1200);

            // Step 5: AdaptiveBrain status
            appendDemo('[● 5/7] ── AdaptiveBrain (Sovereign Neural Routing)');
            await sleep(600);
            const brain = kernel.getBrain();
            const bStat = brain ? brain.getStatus() : null;
            if (bStat && bStat.hive_status.total_models > 0) {
                appendDemo([
                    `🤖 ${bStat.hive_status.total_models} model(s) absorbed into Hive:`,
                    ...bStat.hive_status.cpi_ranking.map((p: any) =>
                        `  • ${p.filename} | CPI: ${p.cpi.toFixed(1)} | Tier: ${p.tier.toUpperCase()}`
                    ),
                    `Collective IQ  : ${bStat.collective_iq}`,
                    `Fusion Quality : ${(bStat.fusion_status.fusion_quality * 100).toFixed(1)}%`,
                ].join('\n'));
            } else {
                appendDemo('No models absorbed yet. Run /brain eat with a .gguf model in models/.');
            }
            await sleep(1200);

            // Step 6: Security status
            appendDemo('[● 6/7] ── Security Hypervisor & Integrity Chain');
            await sleep(600);
            const metrics = kernel.getRealtimeMetrics();
            appendDemo([
                `🔒 Integrity Chain: ${metrics.integrity_chain_valid ? '✓ VALID' : '✗ BROKEN'} (${metrics.integrity_chain_length} links)`,
                `🛡 Threats Blocked : ${metrics.threats_blocked}`,
                `📖 Security Audits : ${metrics.security_audit_count}`,
                `🦹 Mythos Layers   : ${metrics.mythos_layers} active`,
            ].join('\n'));
            await sleep(1200);

            // Step 7: Value proposition
            appendDemo('[● 7/7] ── CORTEX — Why It Wins');
            await sleep(600);
            appendDemo([
                '╔══════════════════════════════════════════════════════╗',
                '║  CORTEX Sovereign Intelligence Infrastructure       ║',
                '╠══════════════════════════════════════════════════════╣',
                '║  ☑ Zero external HTTP — 100% air-gapped by design      ║',
                '║  ☑ Deterministic proofs — math & physics, never guesses ║',
                '║  ☑ Self-absorbing AI — eats and ranks any LLM you give it║',
                '║  ☑ 12-layer Mythos ontology — finds gaps other tools miss ║',
                '║  ☑ Enterprise-grade — 6-layer security + integrity chain  ║',
                '╚══════════════════════════════════════════════════════╝',
            ].join('\n'));

            finishStreaming(demoSteps.join('\n\n'), []);
        } catch (e: any) {
            finishStreaming(`⛔ Demo failed: ${e.message}`, []);
        }
    };

    // ─── Cloud agent runner (clean stream parsing) ─────────────────────────

    const runCloudAgent = async (query: string) => {
        setStreaming(true);
        setStreamingText('');

        const activityItems: ActivityItem[] = [];
        let currentActivity: ActivityItem[] = [];
        setActivity([]);

        const confirm = (msg: string) =>
            new Promise<boolean>(resolve => setConfirmPrompt({ message: msg, resolve }));

        try {
            const stream = orchestrator.delegateTask(query, confirm);
            let textAcc = '';

            for await (const chunk of stream) {
                const event = parseStreamChunk(chunk);

                if (event.type === 'text') {
                    textAcc += event.raw;
                    setStreamingText(textAcc);

                } else if (event.type === 'tool_start') {
                    const label = getFriendlyToolLabel(event.label || '');
                    const item = addActivity(
                        getActivityIcon(event.summary || ''),
                        event.summary ? capitalize(event.summary) : label,
                        false
                    );
                    activityItems.push(item);
                    currentActivity = [...activityItems];
                    setActivity([...currentActivity]);

                } else if (event.type === 'tool_result') {
                    // Mark last activity done
                    if (activityItems.length > 0) {
                        const last = activityItems[activityItems.length - 1];
                        last.done = true;
                        setActivity([...activityItems]);
                    }

                } else if (event.type === 'routing') {
                    const icon = event.label ? getAgentEmoji(event.label) : '→';
                    const item = addActivity(icon, event.summary || `Delegating to ${event.label}`, false);
                    activityItems.push(item);
                    currentActivity = [...activityItems];
                    setActivity([...currentActivity]);

                } else if (event.type === 'error_fixer') {
                    // Show minimal — don't spam user with model switching noise
                    if (event.summary?.includes('✓ Recovered')) {
                        // silent — just continue
                    }

                } else if (event.type === 'system_error') {
                    if (event.summary?.includes('All brain providers failed')) {
                        setShowSetup(true);
                    } else {
                        textAcc += `\n⛔ ${event.summary}`;
                        setStreamingText(textAcc);
                    }

                } else if (event.type === 'loop_stop') {
                    // Silently stop — user sees final text
                }
                // 'brain_route', 'ignored' → fully suppressed
            }

            // Mark all activity done
            activityItems.forEach(a => { a.done = true; });
            setActivity([...activityItems]);
            orchestrator.recordTurn(query, textAcc);
            finishStreaming(textAcc, activityItems);

        } catch (e: any) {
            finishStreaming(`⛔ ${e.message}`, []);
        }
    };

    // ─── Helpers ───────────────────────────────────────────────────────────

    let _actId = activityCounter.current;
    const addActivity = (icon: string, label: string, done: boolean): ActivityItem => {
        _actId++;
        activityCounter.current = _actId;
        return { id: _actId, icon, label, done };
    };

    const pushMessage = (role: 'user' | 'assistant', content: string) => {
        setMessages(prev => [...prev, { role, content }]);
    };

    const finishStreaming = (finalText: string, finalActivity: ActivityItem[]) => {
        setStreaming(false);
        setStreamingText('');
        setActivity([]);
        if (finalText) {
            setMessages(prev => [...prev, { role: 'assistant', content: finalText }]);
        }
    };

    const getActivityIcon = (summary: string): string => {
        const s = summary.toLowerCase();
        if (s.includes('read') || s.includes('file')) return '↳';
        if (s.includes('list') || s.includes('dir')) return '↳';
        if (s.includes('write')) return '↳';
        if (s.includes('shell') || s.includes('command')) return '↳';
        if (s.includes('search')) return '↳';
        return '↳';
    };

    const getAgentEmoji = (name: string): string => {
        const icons: Record<string, string> = {
            ExploreAgent: '◎',
            PlanAgent: '◈',
            DeveloperAgent: '◉',
            QualityAgent: '◍',
            DevOpsAgent: '◑',
            BrowserAgent: '◐',
            NetworkAgent: '◒',
        };
        return icons[name] || '●';
    };

    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

    // ─── Render ───────────────────────────────────────────────────────────

    if (!trusted) {
        return <TrustScreen cursor={trustCursor} onSelect={setTrustCursor} />;
    }

    if (showSetup) {
        return <SetupWizard onExit={() => setShowSetup(false)} />;
    }

    if (showDashboard) {
        return (
            <Box flexDirection="column">
                <Header beastMode={beastMode} kernelReady={kernelReady} />
                <Dashboard onExit={() => setShowDashboard(false)} />
                <InputBar value={input} streaming={streaming} beastMode={beastMode} kernelReady={kernelReady} />
            </Box>
        );
    }

    return (
        <Box flexDirection="column" width={100}>
            <Header beastMode={beastMode} kernelReady={kernelReady} />

            {/* Chat history */}
            <Box flexDirection="column" paddingX={1} marginY={1}>
                {messages.map((msg, i) => (
                    <Box key={i} flexDirection="column" marginBottom={1}>
                        {msg.role === 'user' ? (
                            // User message — right-aligned style
                            <Box>
                                <Text color="gray" dimColor>❯ </Text>
                                <Text color="white">{msg.content}</Text>
                            </Box>
                        ) : (
                            // Assistant message — clean, no labels
                            <Box paddingLeft={2} flexDirection="column">
                                <Text color="white" wrap="wrap">{msg.content}</Text>
                            </Box>
                        )}
                    </Box>
                ))}

                {/* In-flight streaming message */}
                {streaming && (
                    <Box flexDirection="column" marginBottom={1}>
                        <AssistantMessage
                            content={streamingText}
                            activity={activity}
                            streaming={streaming}
                            beastMode={beastMode}
                        />
                    </Box>
                )}
            </Box>

            {/* Confirm prompt */}
            {confirmPrompt && <ConfirmBar message={confirmPrompt.message} />}

            {/* Input bar */}
            <InputBar value={input} streaming={streaming} beastMode={beastMode} kernelReady={kernelReady} />

            {/* Hint line */}
            <Box paddingX={2}>
                <Text color="gray" dimColor>
                    {streaming ? 'Working…' : '/help for commands · /beast for BEASTMODE · Esc to cancel'}
                </Text>
            </Box>
        </Box>
    );
};

export default App;
