import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
const MAX_AUDIT_LOG = 200;
/**
 * Check if a path is a filesystem root (e.g. "C:\", "/", "D:\").
 * mkdirSync on a root path causes EPERM on Windows.
 */
function isDriveRoot(p) {
    const resolved = path.resolve(p);
    return resolved === path.parse(resolved).root;
}
export class SharedContext {
    static getContextFile() {
        const baseRoot = process.env.CORTEX_WORKSPACE_ROOT?.trim() || process.cwd();
        // Guard: if running from a drive root (C:\, D:\, /), use ~/.cortex/ instead
        if (isDriveRoot(baseRoot)) {
            const fallback = path.join(os.homedir(), '.cortex', 'state.json');
            return fallback;
        }
        const candidate = path.join(baseRoot, '.cortex');
        if (fs.existsSync(candidate)) {
            try {
                const st = fs.statSync(candidate);
                if (st.isDirectory()) {
                    return path.join(candidate, 'state.json');
                }
            }
            catch {
                // fall through and return candidate
            }
        }
        return candidate;
    }
    static init() {
        try {
            const contextFile = this.getContextFile();
            if (!fs.existsSync(contextFile)) {
                fs.mkdirSync(path.dirname(contextFile), { recursive: true });
                fs.writeFileSync(contextFile, JSON.stringify({}, null, 2));
            }
        }
        catch (err) {
            // Gracefully handle permission errors — don't crash the entire app
            console.error(`[SharedContext] Warning: Could not initialize context file: ${err.message}`);
        }
    }
    static get(key) {
        const contextFile = this.getContextFile();
        if (!fs.existsSync(contextFile))
            return null;
        try {
            const data = JSON.parse(fs.readFileSync(contextFile, 'utf-8'));
            return data[key];
        }
        catch (e) {
            return null;
        }
    }
    static set(key, value) {
        const contextFile = this.getContextFile();
        let data = {};
        if (fs.existsSync(contextFile)) {
            try {
                data = JSON.parse(fs.readFileSync(contextFile, 'utf-8'));
            }
            catch (e) {
                // Ignore parse errors, rewrite
            }
        }
        data[key] = value;
        fs.mkdirSync(path.dirname(contextFile), { recursive: true });
        fs.writeFileSync(contextFile, JSON.stringify(data, null, 2));
    }
    static updateSession(patch) {
        const current = (this.get('session') || {});
        this.set('session', { ...current, ...patch });
    }
    static appendRecentCommand(command) {
        if (!command?.trim())
            return;
        const session = (this.get('session') || {});
        const prev = session.recentCommands || [];
        const next = [...prev, command].slice(-20);
        this.updateSession({ recentCommands: next });
    }
    static touchFile(filePath) {
        if (!filePath?.trim())
            return;
        const normalized = path.resolve(process.cwd(), filePath);
        const session = (this.get('session') || {});
        const prev = session.touchedFiles || [];
        const next = [...prev.filter((p) => p !== normalized), normalized].slice(-40);
        this.updateSession({ touchedFiles: next });
    }
    static appendAudit(entry) {
        const current = (this.get('auditLog') || []);
        const next = [...current, { ts: new Date().toISOString(), ...entry }].slice(-MAX_AUDIT_LOG);
        this.set('auditLog', next);
    }
    static buildMemoryBlock() {
        const session = (this.get('session') || {});
        const lines = [];
        if (session.rollingSummary)
            lines.push(`- rollingSummary: ${session.rollingSummary}`);
        if (session.lastGitHead)
            lines.push(`- lastGitHead: ${session.lastGitHead}`);
        if (session.recentCommands?.length) {
            lines.push(`- recentCommands: ${session.recentCommands.slice(-5).join(' | ')}`);
        }
        if (session.touchedFiles?.length) {
            lines.push(`- touchedFiles: ${session.touchedFiles.slice(-8).join(' | ')}`);
        }
        if (!lines.length)
            return '';
        return `\n\n[SESSION MEMORY]\n${lines.join('\n')}\n[/SESSION MEMORY]\n`;
    }
    static upsertWorkflowRun(record) {
        const runs = (this.get('workflowRuns') || []);
        const existing = runs.find((x) => x.runId === record.runId);
        if (existing) {
            Object.assign(existing, record, { updatedAt: new Date().toISOString() });
        }
        else {
            runs.push({ ...record, updatedAt: new Date().toISOString() });
        }
        this.set('workflowRuns', runs.slice(-100));
    }
    static updateWorkflowStep(runId, step) {
        const runs = (this.get('workflowRuns') || []);
        const run = runs.find((x) => x.runId === runId);
        if (!run)
            return;
        const existing = run.steps.find((s) => s.stepId === step.stepId);
        if (existing) {
            Object.assign(existing, step, { updatedAt: new Date().toISOString() });
        }
        else {
            run.steps.push({ ...step, updatedAt: new Date().toISOString() });
        }
        run.updatedAt = new Date().toISOString();
        this.set('workflowRuns', runs.slice(-100));
    }
    static markWorkflowError(runId, error) {
        const runs = (this.get('workflowRuns') || []);
        const run = runs.find((x) => x.runId === runId);
        if (!run)
            return;
        run.status = 'failed';
        run.lastError = error;
        run.updatedAt = new Date().toISOString();
        this.set('workflowRuns', runs.slice(-100));
    }
}
