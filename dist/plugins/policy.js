import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot } from '../tools/PathSecurity.js';
const DEFAULT_POLICY = {
    autonomyMode: 'semi_auto',
    riskDefaults: {
        read: { requireConfirmation: false },
        mutate: { requireConfirmation: true },
        destructive: { requireConfirmation: true }
    },
    defaultAllow: true,
    tools: {}
};
export function getPluginConfigDir() {
    const workspaceRoot = getWorkspaceRoot();
    const legacyRoot = path.join(workspaceRoot, '.cortex');
    if (fs.existsSync(legacyRoot)) {
        try {
            if (fs.statSync(legacyRoot).isDirectory()) {
                return path.join(legacyRoot, 'plugins');
            }
        }
        catch {
            // fall back
        }
    }
    return path.join(workspaceRoot, '.cortex_plugins');
}
function getPolicyPath() {
    return path.join(getPluginConfigDir(), 'policy.json');
}
export function ensurePluginPolicyFile() {
    const policyPath = getPolicyPath();
    if (fs.existsSync(policyPath))
        return;
    fs.mkdirSync(path.dirname(policyPath), { recursive: true });
    fs.writeFileSync(policyPath, JSON.stringify(DEFAULT_POLICY, null, 2), 'utf-8');
}
function loadPolicy() {
    const policyPath = getPolicyPath();
    if (!fs.existsSync(policyPath))
        return DEFAULT_POLICY;
    try {
        const parsed = JSON.parse(fs.readFileSync(policyPath, 'utf-8'));
        const mode = (process.env.AUTONOMY_MODE || parsed.autonomyMode || 'semi_auto');
        const riskDefaults = mode === 'full_auto_lab'
            ? {
                read: { requireConfirmation: false },
                mutate: { requireConfirmation: false },
                destructive: { requireConfirmation: false }
            }
            : (parsed.riskDefaults || DEFAULT_POLICY.riskDefaults);
        return {
            autonomyMode: mode,
            riskDefaults,
            defaultAllow: parsed.defaultAllow ?? true,
            tools: parsed.tools || {}
        };
    }
    catch {
        return DEFAULT_POLICY;
    }
}
export function getPolicy() {
    return loadPolicy();
}
export function savePolicy(policy) {
    ensurePluginPolicyFile();
    const policyPath = getPolicyPath();
    const normalized = {
        autonomyMode: policy.autonomyMode || 'semi_auto',
        riskDefaults: policy.riskDefaults || DEFAULT_POLICY.riskDefaults,
        defaultAllow: policy.defaultAllow ?? true,
        tools: policy.tools || {}
    };
    fs.writeFileSync(policyPath, JSON.stringify(normalized, null, 2), 'utf-8');
}
export function checkToolPolicy(toolName, riskLevel = 'read') {
    const policy = loadPolicy();
    const perTool = policy.tools?.[toolName];
    const allowed = perTool?.allowed ?? (policy.defaultAllow ?? true);
    const defaultRisk = policy.riskDefaults?.[riskLevel]?.requireConfirmation ?? (riskLevel !== 'read');
    const requireConfirmation = perTool?.requireConfirmation ?? defaultRisk;
    return { allowed, requireConfirmation, autonomyMode: policy.autonomyMode || 'semi_auto' };
}
