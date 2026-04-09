#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import App from './ui.js';
import { ConfigManager } from './core/config.js';

ConfigManager.init();

const program = new Command();

program
  .name('cortex')
  .description('CORTEX Multi-Agent OS')
  .version('3.0.0');

program.parse(process.argv);

console.clear();

const { waitUntilExit } = render(<App />);

waitUntilExit().then(() => {
  // Graceful shutdown
});
