import { PluginManifest } from './types.js';

export const BUILTIN_PLUGIN_MANIFESTS: PluginManifest[] = [
    {
        id: 'connectors-core',
        name: 'Connectors Core',
        version: '1.0.0',
        category: 'connectors',
        description: 'Connector readiness and integration hints for Gmail, Slack, GitHub, Notion, and databases.',
        supportedAgents: ['ExploreAgent', 'DeveloperAgent', 'DevOpsAgent'],
        enabledByDefault: true,
        toolsetKey: 'connectors',
        source: 'builtin'
    },
    {
        id: 'devtools-core',
        name: 'Development Debug Toolkit',
        version: '1.0.0',
        category: 'devtools',
        description: 'Project diagnostics for TypeScript/LSP/test/debug workflows.',
        supportedAgents: ['DeveloperAgent', 'QualityAgent', 'DevOpsAgent'],
        enabledByDefault: true,
        toolsetKey: 'devtools',
        source: 'builtin'
    },
    {
        id: 'frontend-design-core',
        name: 'Frontend Design Assistant',
        version: '1.0.0',
        category: 'frontend',
        description: 'Guidance and starter patterns for React, Tailwind, and shadcn-like component systems.',
        supportedAgents: ['DeveloperAgent', 'PlanAgent'],
        enabledByDefault: true,
        toolsetKey: 'frontend',
        source: 'builtin'
    },
    {
        id: 'rag-knowledge-core',
        name: 'Knowledge RAG Starter',
        version: '1.0.0',
        category: 'rag',
        description: 'Workspace knowledge index status and retrieval planning hooks.',
        supportedAgents: ['ExploreAgent', 'PlanAgent', 'DeveloperAgent'],
        enabledByDefault: true,
        toolsetKey: 'rag',
        source: 'builtin'
    },
    {
        id: 'automation-loop-core',
        name: 'Automation Loop Planner',
        version: '1.0.0',
        category: 'automation',
        description: 'Agentic loop planning tool for multi-step autonomous workflows.',
        supportedAgents: ['PlanAgent', 'DevOpsAgent', 'AgentManager'],
        enabledByDefault: true,
        toolsetKey: 'automation',
        source: 'builtin'
    }
];
