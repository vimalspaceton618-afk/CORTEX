import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot } from '../tools/PathSecurity.js';
import { BUILTIN_PLUGIN_MANIFESTS } from './builtinManifests.js';
import { BUILTIN_TOOLSET_FACTORIES } from './builtinTools.js';
import { ensurePluginPolicyFile, getPluginConfigDir } from './policy.js';
function parseCsv(value) {
    if (!value)
        return new Set();
    return new Set(value.split(',').map((x) => x.trim()).filter(Boolean));
}
function isEnabled(manifest, enabledSet, disabledSet) {
    if (disabledSet.has(manifest.id))
        return false;
    if (enabledSet.size > 0)
        return enabledSet.has(manifest.id);
    return manifest.enabledByDefault !== false;
}
function isSupportedAgent(manifest, agentName) {
    return manifest.supportedAgents.includes(agentName) || manifest.supportedAgents.includes('*');
}
function loadWorkspaceManifests() {
    const manifests = [];
    const pluginDir = getPluginConfigDir();
    const candidateFiles = [];
    if (fs.existsSync(pluginDir)) {
        const files = fs.readdirSync(pluginDir).filter((x) => x.endsWith('.json'));
        for (const file of files) {
            candidateFiles.push(path.join(pluginDir, file));
        }
    }
    const rootPluginsDir = path.join(getWorkspaceRoot(), 'plugins');
    if (fs.existsSync(rootPluginsDir)) {
        const entries = fs.readdirSync(rootPluginsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            const manifestPath = path.join(rootPluginsDir, entry.name, 'manifest.json');
            if (fs.existsSync(manifestPath)) {
                candidateFiles.push(manifestPath);
            }
        }
    }
    const seen = new Set();
    for (const fullPath of candidateFiles) {
        if (seen.has(fullPath))
            continue;
        seen.add(fullPath);
        try {
            const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
            if (!parsed?.id || !parsed?.name || !parsed?.toolsetKey)
                continue;
            manifests.push({ ...parsed, source: 'workspace' });
        }
        catch {
            // ignore malformed plugin manifest
        }
    }
    return manifests;
}
export class PluginManager {
    manifests = [];
    initialized = false;
    load() {
        if (this.initialized)
            return;
        ensurePluginPolicyFile();
        this.manifests = [
            ...BUILTIN_PLUGIN_MANIFESTS,
            ...loadWorkspaceManifests()
        ];
        this.initialized = true;
    }
    list() {
        this.load();
        return [...this.manifests];
    }
    registerToolsForAgent(agentName, registry) {
        this.load();
        const enabledSet = parseCsv(process.env.CORTEX_PLUGINS_ENABLED);
        const disabledSet = parseCsv(process.env.CORTEX_PLUGINS_DISABLED);
        const workspaceRoot = getWorkspaceRoot();
        for (const manifest of this.manifests) {
            if (!isEnabled(manifest, enabledSet, disabledSet))
                continue;
            if (!isSupportedAgent(manifest, agentName))
                continue;
            const factory = BUILTIN_TOOLSET_FACTORIES[manifest.toolsetKey];
            if (!factory)
                continue;
            const tools = factory({
                agentName,
                pluginId: manifest.id,
                workspaceRoot
            });
            for (const tool of tools) {
                registry.register(tool);
            }
        }
    }
}
let pluginManagerInstance = null;
export function getPluginManager() {
    if (!pluginManagerInstance)
        pluginManagerInstance = new PluginManager();
    return pluginManagerInstance;
}
