import { Tool } from '../tools/Tool.js';
import { ToolRegistry } from '../tools/registry.js';

export type PluginCategory =
    | 'connectors'
    | 'devtools'
    | 'frontend'
    | 'rag'
    | 'automation';

export type PluginManifest = {
    id: string;
    name: string;
    version: string;
    category: PluginCategory;
    description: string;
    supportedAgents: string[];
    enabledByDefault?: boolean;
    toolsetKey: string;
    source?: 'builtin' | 'workspace';
};

export type PluginToolContext = {
    agentName: string;
    pluginId: string;
    workspaceRoot: string;
};

export type PluginToolFactory = (context: PluginToolContext) => Tool[];

export interface PluginRuntime {
    load(): void;
    registerToolsForAgent(agentName: string, registry: ToolRegistry): void;
    list(): PluginManifest[];
}
