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
  .option('--beast', 'Boot in BEASTMODE (all systems MAX power)');

program.parse(process.argv);
const options = program.opts();

async function runHeadless(prompt: string, asJson: boolean, autoApprove: boolean, beastMode: boolean) {
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
    } else {
      process.stdout.write(`${formatHealthReport(status)}\n`);
    }
    return;
  }

  // ─── /status ───────────────────────────────────────────────
  if (normalized === '/status') {
    const report = kernel.getStatusReport();
    if (asJson) {
      process.stdout.write(`${JSON.stringify({ prompt, status: kernel.getRealtimeMetrics() }, null, 2)}\n`);
    } else {
      process.stdout.write(`${report}\n`);
    }
    return;
  }

  // ─── /beast ────────────────────────────────────────────────
  if (normalized === '/beast') {
    const status = kernel.toggleBeastMode();
    if (asJson) {
      process.stdout.write(`${JSON.stringify({ prompt, beastmode: status }, null, 2)}\n`);
    } else {
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
    } else {
      process.stdout.write(kernel.formatThought(thought) + '\n');
    }
    return;
  }

  // ─── Smart routing: local cognition or cloud LLM ───────────
  // Check if the query can be handled locally first
  if (kernel.shouldHandleLocally(prompt)) {
    const thought = await kernel.think(prompt);
    if (asJson) {
      process.stdout.write(`${JSON.stringify({ prompt, thought, routed_to: 'bigrock_local' }, null, 2)}\n`);
    } else {
      process.stdout.write(`[ROUTED: Local CognitionCore]\n${kernel.formatThought(thought)}\n`);
    }
    return;
  }

  // ─── Cloud LLM fallback ────────────────────────────────────
  const orchestrator = new AgentManager();
  const confirm = async (msg: string) => autoApprove ? true : false;
  const stream = orchestrator.delegateTask(prompt, confirm);
  let output = '';
  for await (const chunk of stream) {
    output += chunk;
  }
  orchestrator.recordTurn(prompt, output);
  if (asJson) {
    process.stdout.write(`${JSON.stringify({ prompt, output, routed_to: 'cloud_llm' }, null, 2)}\n`);
  } else {
    process.stdout.write(`${output}\n`);
  }
}

if (options.run) {
  runHeadless(options.run, Boolean(options.json), Boolean(options.yes), Boolean(options.beast)).catch((error) => {
    process.stderr.write(`[HEADLESS ERROR]: ${error.message}\n`);
    process.exitCode = 1;
  });
} else {
  const { waitUntilExit } = render(<App />);
  waitUntilExit().then(() => {
    // Graceful shutdown
  });
}
