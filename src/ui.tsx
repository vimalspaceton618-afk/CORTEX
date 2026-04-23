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

        if (lower === '/absorb') {
            pushMessage('user', query);
            if (!CortexKernel.isBooted()) { pushMessage('assistant', '⚠ Kernel not booted.'); return; }
            setStreaming(true);
            setStreamingText('');
            setActivity([addActivity('◆', 'Scanning for GGUF models…', false)]);
            try {
                const absorber = CortexKernel.get().getAbsorber();
                const report = await absorber.absorbAll(false);
                finishStreaming([
                    `Absorbed ${report.total_models_absorbed} of ${report.total_models_found} models`,
                    `Total absorber power: ${report.total_power.toFixed(3)}`,
                    `Time: ${report.absorption_time_ms}ms`,
                ].join('\n'), []);
            } catch (e: any) {
                finishStreaming(`⛔ Absorption failed: ${e.message}`, []);
            }
            return;
        }

        if (lower === '/help') {
            pushMessage('user', query);
            pushMessage('assistant', [
                'Commands',
                '  /beast          Toggle BEASTMODE (all systems MAX)',
                '  /dashboard      Live system monitoring',
                '  /status         Full system status report',
                '  /think <query>  Route through local Cognition Core',
                '  /arl [start|stop]  Autonomous Reasoning Loop',
                '  /absorb         Absorb local GGUF models',
                '  /mythos <arch>  Mythos threat analysis',
                '  /health         Runtime readiness checks',
                '  /exit           Quit',
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
                    textAcc += `\n⛔ ${event.summary}`;
                    setStreamingText(textAcc);

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
