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
// ─── Progress Bar Helper ────────────────────────────────────────────────────
function ProgressBar({ value, max, width = 20, color = 'green' }) {
    const ratio = Math.min(value / max, 1.0);
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    const barColor = ratio > 0.8 ? 'red' : ratio > 0.5 ? 'yellow' : color;
    return (React.createElement(Text, null,
        React.createElement(Text, { color: barColor }, '█'.repeat(filled)),
        React.createElement(Text, { color: "gray" }, '░'.repeat(empty)),
        React.createElement(Text, { color: "white" },
            " ",
            (ratio * 100).toFixed(0),
            "%")));
}
// ─── Dashboard Component ────────────────────────────────────────────────────
export const Dashboard = ({ onExit }) => {
    const [metrics, setMetrics] = useState(null);
    const [nativeBrain, setNativeBrain] = useState(null);
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const refresh = () => {
            try {
                if (CortexKernel.isBooted()) {
                    setMetrics(CortexKernel.get().getRealtimeMetrics());
                    setNativeBrain(CortexKernel.get().getNativeBrainInfo());
                }
            }
            catch {
                // Kernel not booted yet
            }
            setTick(t => t + 1);
        };
        refresh(); // Initial load
        const timer = setInterval(refresh, 2000); // Refresh every 2s
        return () => clearInterval(timer);
    }, []);
    if (!metrics) {
        return (React.createElement(Box, { flexDirection: "column", paddingY: 1 },
            React.createElement(Text, { color: "yellow" }, "\u23F3 Waiting for CORTEX Kernel to boot..."),
            React.createElement(Text, { color: "gray" }, "Press any key to return to chat.")));
    }
    const m = metrics;
    const beastOn = m.beastmode.active;
    const uptimeMin = (m.uptime_ms / 1000 / 60).toFixed(1);
    const uptimeDisplay = Number(uptimeMin) > 60 ? `${(Number(uptimeMin) / 60).toFixed(1)}h` : `${uptimeMin}m`;
    return (React.createElement(Box, { flexDirection: "column", width: 64 },
        React.createElement(Box, { borderStyle: "double", borderColor: beastOn ? 'redBright' : 'cyanBright', paddingX: 1 },
            React.createElement(Text, { color: beastOn ? 'redBright' : 'cyanBright', bold: true }, beastOn ? '⚡ CORTEX BEASTMODE DASHBOARD ⚡' : '  CORTEX SYSTEM DASHBOARD'),
            React.createElement(Text, { color: "gray" }, "  \u2502 "),
            React.createElement(Text, { color: "white" },
                "UP: ",
                uptimeDisplay),
            React.createElement(Text, { color: "gray" }, "  \u2502 "),
            React.createElement(Text, { color: "gray", dimColor: true },
                "tick #",
                tick)),
        React.createElement(Box, { borderStyle: "single", borderColor: "gray", paddingX: 1, flexDirection: "column", marginTop: 0 },
            React.createElement(Text, { color: "white", bold: true }, "\uD83D\uDCBB HARDWARE"),
            React.createElement(Box, null,
                React.createElement(Text, { color: "gray" }, "CPU: "),
                React.createElement(ProgressBar, { value: m.memory_usage_percent, max: 100, color: "cyan" }),
                React.createElement(Text, { color: "gray" }, "  \u2502  RAM: "),
                React.createElement(ProgressBar, { value: m.memory_used_gb, max: m.memory_total_gb || 16, color: "magenta" })),
            React.createElement(Text, { color: "gray", dimColor: true },
                m.cpu_model.slice(0, 50),
                " \u2502 ",
                m.cpu_threads,
                " threads \u2502 ",
                m.cpu_freq_mhz,
                " MHz")),
        React.createElement(Box, { borderStyle: "single", borderColor: nativeBrain ? 'greenBright' : 'yellow', paddingX: 1, flexDirection: "column", marginTop: 0 },
            React.createElement(Box, { flexDirection: "row", justifyContent: "space-between" },
                React.createElement(Text, { color: nativeBrain ? 'greenBright' : 'yellowBright', bold: true },
                    "\uD83E\uDDE0 ACTIVE BRAIN: ",
                    nativeBrain ? 'LOCAL SOVEREIGN AI' : 'CLOUD AI'),
                nativeBrain && (React.createElement(Text, { color: "gray", dimColor: true },
                    "Power: ",
                    nativeBrain.power.toFixed(3)))),
            nativeBrain ? (React.createElement(Box, { flexDirection: "column" },
                React.createElement(Box, null,
                    React.createElement(Text, { color: "gray" }, "Model : "),
                    React.createElement(Text, { color: "white" }, nativeBrain.filename.replace('.gguf', ''))),
                React.createElement(Box, null,
                    React.createElement(Text, { color: "gray" }, "Top   : "),
                    React.createElement(Text, { color: "cyanBright" }, nativeBrain.top_domain.toUpperCase())),
                Object.keys(nativeBrain.champions).length > 0 && (React.createElement(Box, { flexDirection: "row", flexWrap: "wrap", gap: 1, marginTop: 0 }, Object.entries(nativeBrain.champions).slice(0, 4).map(([domain, champ]) => (React.createElement(Box, { key: domain },
                    React.createElement(Text, { color: "gray" },
                        domain.slice(0, 4),
                        ": "),
                    React.createElement(Text, { color: "green" },
                        (champ.score * 100).toFixed(0),
                        "%")))))))) : (React.createElement(Box, { flexDirection: "column" },
                React.createElement(Text, { color: "gray" }, "Using cloud LLM via OpenRouter/OpenAI"),
                React.createElement(Text, { color: "gray", dimColor: true }, "Run /absorb with a .gguf model to enable local AI")))),
        React.createElement(Box, { borderStyle: "single", borderColor: "cyan", paddingX: 1, flexDirection: "column", marginTop: 0 },
            React.createElement(Text, { color: "cyanBright", bold: true }, "\uD83E\uDDE0 COGNITION CORE"),
            React.createElement(Box, { flexDirection: "row" },
                React.createElement(Box, { width: "50%" },
                    React.createElement(Text, { color: "gray" }, "Thoughts : "),
                    React.createElement(Text, { color: "white" }, m.thoughts_processed)),
                React.createElement(Box, { width: "50%" },
                    React.createElement(Text, { color: "gray" }, "Domains  : "),
                    React.createElement(Text, { color: "white" },
                        m.domains_active.length,
                        " active"))),
            React.createElement(Box, { flexDirection: "row" },
                React.createElement(Box, { width: "50%" },
                    React.createElement(Text, { color: "gray" }, "Entropy  : "),
                    React.createElement(Text, { color: m.global_entropy > 10 ? 'yellow' : 'green' }, m.global_entropy.toFixed(3))),
                React.createElement(Box, { width: "50%" },
                    React.createElement(Text, { color: "gray" }, "Energy   : "),
                    React.createElement(Text, { color: "green" }, m.network_energy.toFixed(3)))),
            React.createElement(Box, { flexDirection: "row" },
                React.createElement(Text, { color: "gray" }, "Synapses : "),
                React.createElement(Text, { color: "white" }, m.synaptic_updates))),
        React.createElement(Box, { borderStyle: "single", borderColor: "red", paddingX: 1, flexDirection: "column", marginTop: 0 },
            React.createElement(Text, { color: "redBright", bold: true }, "\uD83D\uDD12 SECURITY & INTEGRITY"),
            React.createElement(Box, { flexDirection: "row" },
                React.createElement(Box, { width: "50%" },
                    React.createElement(Text, { color: "gray" }, "Chain    : "),
                    React.createElement(Text, { color: m.integrity_chain_valid ? 'greenBright' : 'redBright' }, m.integrity_chain_valid ? '✓ VALID' : '✗ BROKEN'),
                    React.createElement(Text, { color: "gray" },
                        " (",
                        m.integrity_chain_length,
                        ")")),
                React.createElement(Box, { width: "50%" },
                    React.createElement(Text, { color: "gray" }, "Threats  : "),
                    React.createElement(Text, { color: m.threats_blocked > 0 ? 'redBright' : 'greenBright' },
                        m.threats_blocked,
                        " blocked"))),
            React.createElement(Box, { flexDirection: "row" },
                React.createElement(Box, { width: "50%" },
                    React.createElement(Text, { color: "gray" }, "Mythos   : "),
                    React.createElement(Text, { color: "magenta" },
                        m.mythos_layers,
                        " layers")),
                React.createElement(Box, { width: "50%" },
                    React.createElement(Text, { color: "gray" }, "Audit    : "),
                    React.createElement(Text, { color: "white" },
                        m.security_audit_count,
                        " entries")))),
        React.createElement(Box, { borderStyle: "single", borderColor: m.arl_running ? 'green' : 'yellow', paddingX: 1, flexDirection: "column", marginTop: 0 },
            React.createElement(Text, { color: m.arl_running ? 'greenBright' : 'yellowBright', bold: true },
                "\uD83D\uDD04 ARL: ",
                m.arl_running ? (beastOn ? 'RUNNING (BEAST)' : 'RUNNING') : 'STOPPED'),
            React.createElement(Box, { flexDirection: "row" },
                React.createElement(Box, { width: "33%" },
                    React.createElement(Text, { color: "gray" }, "Cycles: "),
                    React.createElement(Text, { color: "white" }, m.arl_cycles)),
                React.createElement(Box, { width: "33%" },
                    React.createElement(Text, { color: "gray" }, "Anomalies: "),
                    React.createElement(Text, { color: m.arl_anomalies > 0 ? 'red' : 'green' }, m.arl_anomalies)),
                React.createElement(Box, { width: "33%" },
                    React.createElement(Text, { color: "gray" }, "Queries: "),
                    React.createElement(Text, { color: "white" }, m.arl_self_queries)))),
        React.createElement(Box, { borderStyle: "single", borderColor: "magenta", paddingX: 1, flexDirection: "column", marginTop: 0 },
            React.createElement(Box, { flexDirection: "row" },
                React.createElement(Box, { width: "50%" },
                    React.createElement(Text, { color: "magentaBright", bold: true }, "\uD83D\uDCBE MEMORY")),
                React.createElement(Box, { width: "50%" },
                    React.createElement(Text, { color: "magentaBright", bold: true }, "\uD83C\uDF7D\uFE0F  ABSORBER"))),
            React.createElement(Box, { flexDirection: "row" },
                React.createElement(Box, { width: "50%" },
                    React.createElement(Text, { color: "gray" }, "Cells    : "),
                    React.createElement(Text, { color: "white" }, m.memory_cells)),
                React.createElement(Box, { width: "50%" },
                    React.createElement(Text, { color: "gray" }, "Models   : "),
                    React.createElement(Text, { color: "white" }, m.models_absorbed))),
            React.createElement(Box, { flexDirection: "row" },
                React.createElement(Box, { width: "50%" },
                    React.createElement(Text, { color: "gray" }, "Episodic : "),
                    React.createElement(Text, { color: "white" },
                        m.episodic_records,
                        " records")),
                React.createElement(Box, { width: "50%" },
                    React.createElement(Text, { color: "gray" }, "Power    : "),
                    React.createElement(Text, { color: "white" }, m.absorber_total_power.toFixed(3))))),
        React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, { color: "gray", dimColor: true },
                "Press /dashboard again to close  \u2502  Auto-refresh: 2s  \u2502  ",
                beastOn ? '⚡ BEAST' : '● NORMAL'))));
};
export default Dashboard;
