import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
const execAsync = promisify(exec);
const CORTEX_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PS_DIR = path.join(CORTEX_ROOT, 'powershell');
export class PowerShellBridge {
    available = null;
    async isAvailable() {
        if (this.available !== null)
            return this.available;
        try {
            await execAsync('pwsh --version', { timeout: 3000 });
            this.available = true;
        }
        catch {
            try {
                await execAsync('powershell -Command "echo ok"', { timeout: 3000 });
                this.available = true;
            }
            catch {
                this.available = false;
            }
        }
        return this.available;
    }
    async runScript(scriptName, params = {}) {
        if (os.platform() !== 'win32') {
            return { error: 'PowerShell Windows-only features unavailable on this OS', platform: os.platform() };
        }
        const scriptPath = path.join(PS_DIR, scriptName);
        if (!fs.existsSync(scriptPath)) {
            return { error: `Script not found: ${scriptName}` };
        }
        const paramStr = Object.entries(params)
            .map(([k, v]) => `-${k} "${v.replace(/"/g, '\\"')}"`)
            .join(' ');
        const shell = await this.getPwshPath();
        const cmd = `${shell} -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}" ${paramStr}`;
        try {
            const { stdout, stderr } = await execAsync(cmd, { timeout: 30000 });
            if (stderr)
                console.error('[PowerShellBridge] stderr:', stderr.slice(0, 200));
            return JSON.parse(stdout.trim());
        }
        catch (err) {
            return { error: err.message, stdout: err.stdout?.slice(0, 500) };
        }
    }
    async getPwshPath() {
        try {
            await execAsync('pwsh --version', { timeout: 2000 });
            return 'pwsh';
        }
        catch {
            return 'powershell';
        }
    }
    async getSecurityPosture() {
        const result = await this.runScript('Get-SecurityPosture.ps1');
        return result ?? null;
    }
    async getThreatEvents(maxEvents = 100, hours = 24) {
        const result = await this.runScript('Get-ThreatEvents.ps1', {
            MaxEvents: String(maxEvents),
            Hours: String(hours),
        });
        if (Array.isArray(result))
            return result;
        return [];
    }
    async registryScan() {
        const result = await this.runScript('Invoke-RegistryScan.ps1');
        return result ?? null;
    }
    async getSystemTelemetry() {
        const result = await this.runScript('Get-SystemTelemetry.ps1');
        return result ?? null;
    }
}
