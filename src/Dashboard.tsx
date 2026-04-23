/**
 * CORTEX — Real-Time BEASTMODE Dashboard
 * ─────────────────────────────────────────────────────────────────────────
 * A live terminal dashboard built with React Ink that shows real-time
 * system telemetry, neural metrics, integrity chain, ARL status,
 * memory stats, and active thought stream — auto-refreshing every 2s.
 *
 * © 2026 SpaceTon. CORTEX Sovereign Intelligence Infrastructure.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { CortexKernel } from './core/CortexKernel.js';
import type { SystemMetrics } from './core/CortexKernel.js';

// ─── Progress Bar Helper ────────────────────────────────────────────────────

function ProgressBar({ value, max, width = 20, color = 'green' }: { value: number; max: number; width?: number; color?: string }) {
    const ratio = Math.min(value / max, 1.0);
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    const barColor = ratio > 0.8 ? 'red' : ratio > 0.5 ? 'yellow' : color;
    return (
        <Text>
            <Text color={barColor}>{'█'.repeat(filled)}</Text>
            <Text color="gray">{'░'.repeat(empty)}</Text>
            <Text color="white"> {(ratio * 100).toFixed(0)}%</Text>
        </Text>
    );
}

// ─── Dashboard Component ────────────────────────────────────────────────────

export const Dashboard = ({ onExit }: { onExit: () => void }) => {
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const refresh = () => {
            try {
                if (CortexKernel.isBooted()) {
                    setMetrics(CortexKernel.get().getRealtimeMetrics());
                }
            } catch {
                // Kernel not booted yet
            }
            setTick(t => t + 1);
        };

        refresh(); // Initial load
        const timer = setInterval(refresh, 2000); // Refresh every 2s
        return () => clearInterval(timer);
    }, []);

    if (!metrics) {
        return (
            <Box flexDirection="column" paddingY={1}>
                <Text color="yellow">⏳ Waiting for CORTEX Kernel to boot...</Text>
                <Text color="gray">Press any key to return to chat.</Text>
            </Box>
        );
    }

    const m = metrics;
    const beastOn = m.beastmode.active;
    const uptimeMin = (m.uptime_ms / 1000 / 60).toFixed(1);
    const uptimeDisplay = Number(uptimeMin) > 60 ? `${(Number(uptimeMin) / 60).toFixed(1)}h` : `${uptimeMin}m`;

    return (
        <Box flexDirection="column" width={64}>
            {/* ── Header ── */}
            <Box borderStyle="double" borderColor={beastOn ? 'redBright' : 'cyanBright'} paddingX={1}>
                <Text color={beastOn ? 'redBright' : 'cyanBright'} bold>
                    {beastOn ? '⚡ CORTEX BEASTMODE DASHBOARD ⚡' : '  CORTEX SYSTEM DASHBOARD'}
                </Text>
                <Text color="gray">  │ </Text>
                <Text color="white">UP: {uptimeDisplay}</Text>
                <Text color="gray">  │ </Text>
                <Text color="gray" dimColor>tick #{tick}</Text>
            </Box>

            {/* ── Hardware ── */}
            <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column" marginTop={0}>
                <Text color="white" bold>💻 HARDWARE</Text>
                <Box>
                    <Text color="gray">CPU: </Text>
                    <ProgressBar value={m.memory_usage_percent} max={100} color="cyan" />
                    <Text color="gray">  │  RAM: </Text>
                    <ProgressBar value={m.memory_used_gb} max={m.memory_total_gb || 16} color="magenta" />
                </Box>
                <Text color="gray" dimColor>{m.cpu_model.slice(0, 50)} │ {m.cpu_threads} threads │ {m.cpu_freq_mhz} MHz</Text>
            </Box>

            {/* ── Cognition ── */}
            <Box borderStyle="single" borderColor="cyan" paddingX={1} flexDirection="column" marginTop={0}>
                <Text color="cyanBright" bold>🧠 COGNITION CORE</Text>
                <Box flexDirection="row">
                    <Box width="50%">
                        <Text color="gray">Thoughts : </Text>
                        <Text color="white">{m.thoughts_processed}</Text>
                    </Box>
                    <Box width="50%">
                        <Text color="gray">Domains  : </Text>
                        <Text color="white">{m.domains_active.length} active</Text>
                    </Box>
                </Box>
                <Box flexDirection="row">
                    <Box width="50%">
                        <Text color="gray">Entropy  : </Text>
                        <Text color={m.global_entropy > 10 ? 'yellow' : 'green'}>{m.global_entropy.toFixed(3)}</Text>
                    </Box>
                    <Box width="50%">
                        <Text color="gray">Energy   : </Text>
                        <Text color="green">{m.network_energy.toFixed(3)}</Text>
                    </Box>
                </Box>
                <Box flexDirection="row">
                    <Text color="gray">Synapses : </Text>
                    <Text color="white">{m.synaptic_updates}</Text>
                </Box>
            </Box>

            {/* ── Security ── */}
            <Box borderStyle="single" borderColor="red" paddingX={1} flexDirection="column" marginTop={0}>
                <Text color="redBright" bold>🔒 SECURITY & INTEGRITY</Text>
                <Box flexDirection="row">
                    <Box width="50%">
                        <Text color="gray">Chain    : </Text>
                        <Text color={m.integrity_chain_valid ? 'greenBright' : 'redBright'}>
                            {m.integrity_chain_valid ? '✓ VALID' : '✗ BROKEN'}
                        </Text>
                        <Text color="gray"> ({m.integrity_chain_length})</Text>
                    </Box>
                    <Box width="50%">
                        <Text color="gray">Threats  : </Text>
                        <Text color={m.threats_blocked > 0 ? 'redBright' : 'greenBright'}>{m.threats_blocked} blocked</Text>
                    </Box>
                </Box>
                <Box flexDirection="row">
                    <Box width="50%">
                        <Text color="gray">Mythos   : </Text>
                        <Text color="magenta">{m.mythos_layers} layers</Text>
                    </Box>
                    <Box width="50%">
                        <Text color="gray">Audit    : </Text>
                        <Text color="white">{m.security_audit_count} entries</Text>
                    </Box>
                </Box>
            </Box>

            {/* ── ARL ── */}
            <Box borderStyle="single" borderColor={m.arl_running ? 'green' : 'yellow'} paddingX={1} flexDirection="column" marginTop={0}>
                <Text color={m.arl_running ? 'greenBright' : 'yellowBright'} bold>
                    🔄 ARL: {m.arl_running ? (beastOn ? 'RUNNING (BEAST)' : 'RUNNING') : 'STOPPED'}
                </Text>
                <Box flexDirection="row">
                    <Box width="33%">
                        <Text color="gray">Cycles: </Text>
                        <Text color="white">{m.arl_cycles}</Text>
                    </Box>
                    <Box width="33%">
                        <Text color="gray">Anomalies: </Text>
                        <Text color={m.arl_anomalies > 0 ? 'red' : 'green'}>{m.arl_anomalies}</Text>
                    </Box>
                    <Box width="33%">
                        <Text color="gray">Queries: </Text>
                        <Text color="white">{m.arl_self_queries}</Text>
                    </Box>
                </Box>
            </Box>

            {/* ── Memory & Absorber ── */}
            <Box borderStyle="single" borderColor="magenta" paddingX={1} flexDirection="column" marginTop={0}>
                <Box flexDirection="row">
                    <Box width="50%">
                        <Text color="magentaBright" bold>💾 MEMORY</Text>
                    </Box>
                    <Box width="50%">
                        <Text color="magentaBright" bold>🍽️  ABSORBER</Text>
                    </Box>
                </Box>
                <Box flexDirection="row">
                    <Box width="50%">
                        <Text color="gray">Cells    : </Text>
                        <Text color="white">{m.memory_cells}</Text>
                    </Box>
                    <Box width="50%">
                        <Text color="gray">Models   : </Text>
                        <Text color="white">{m.models_absorbed}</Text>
                    </Box>
                </Box>
                <Box flexDirection="row">
                    <Box width="50%">
                        <Text color="gray">Episodic : </Text>
                        <Text color="white">{m.episodic_records} records</Text>
                    </Box>
                    <Box width="50%">
                        <Text color="gray">Power    : </Text>
                        <Text color="white">{m.absorber_total_power.toFixed(3)}</Text>
                    </Box>
                </Box>
            </Box>

            {/* ── Footer ── */}
            <Box marginTop={1}>
                <Text color="gray" dimColor>Press /dashboard again to close  │  Auto-refresh: 2s  │  {beastOn ? '⚡ BEAST' : '● NORMAL'}</Text>
            </Box>
        </Box>
    );
};

export default Dashboard;
