import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot } from '../tools/PathSecurity.js';

export type PluginPolicy = {
    defaultAllow?: boolean;
    tools?: Record<string, {
        allowed?: boolean;
        requireConfirmation?: boolean;
    }>;
};

const DEFAULT_POLICY: PluginPolicy = {
    defaultAllow: true,
    tools: {}
};

export function getPluginConfigDir(): string {
    const workspaceRoot = getWorkspaceRoot();
    const legacyRoot = path.join(workspaceRoot, '.cortex');
    if (fs.existsSync(legacyRoot)) {
        try {
            if (fs.statSync(legacyRoot).isDirectory()) {
                return path.join(legacyRoot, 'plugins');
            }
        } catch {
            // fall back
        }
    }
    return path.join(workspaceRoot, '.cortex_plugins');
}

function getPolicyPath(): string {
    return path.join(getPluginConfigDir(), 'policy.json');
}

export function ensurePluginPolicyFile(): void {
    const policyPath = getPolicyPath();
    if (fs.existsSync(policyPath)) return;
    fs.mkdirSync(path.dirname(policyPath), { recursive: true });
    fs.writeFileSync(policyPath, JSON.stringify(DEFAULT_POLICY, null, 2), 'utf-8');
}

function loadPolicy(): PluginPolicy {
    const policyPath = getPolicyPath();
    if (!fs.existsSync(policyPath)) return DEFAULT_POLICY;
    try {
        const parsed = JSON.parse(fs.readFileSync(policyPath, 'utf-8')) as PluginPolicy;
        return {
            defaultAllow: parsed.defaultAllow ?? true,
            tools: parsed.tools || {}
        };
    } catch {
        return DEFAULT_POLICY;
    }
}

export function getPolicy(): PluginPolicy {
    return loadPolicy();
}

export function savePolicy(policy: PluginPolicy): void {
    ensurePluginPolicyFile();
    const policyPath = getPolicyPath();
    const normalized: PluginPolicy = {
        defaultAllow: policy.defaultAllow ?? true,
        tools: policy.tools || {}
    };
    fs.writeFileSync(policyPath, JSON.stringify(normalized, null, 2), 'utf-8');
}

export function checkToolPolicy(toolName: string, isMutating: boolean): { allowed: boolean; requireConfirmation: boolean } {
    const policy = loadPolicy();
    const perTool = policy.tools?.[toolName];
    const allowed = perTool?.allowed ?? (policy.defaultAllow ?? true);
    const requireConfirmation = perTool?.requireConfirmation ?? isMutating;
    return { allowed, requireConfirmation };
}
