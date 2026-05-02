import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
const CORTEX_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
export class CSharpBridge extends EventEmitter {
    process = null;
    ready = false;
    pendingRequests = new Map();
    buffer = '';
    get binaryPath() {
        const win = path.join(CORTEX_ROOT, 'csharp', 'CortexForensics', 'bin', 'Release', 'net8.0', 'CortexForensics.exe');
        const linux = path.join(CORTEX_ROOT, 'csharp', 'CortexForensics', 'bin', 'Release', 'net8.0', 'CortexForensics');
        return os.platform() === 'win32' ? win : linux;
    }
    async start() {
        if (this.ready)
            return true;
        if (!fs.existsSync(this.binaryPath))
            return false;
        return new Promise((resolve) => {
            this.process = spawn(this.binaryPath, [], {
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            this.process.stdout?.on('data', (chunk) => {
                this.buffer += chunk.toString();
                const lines = this.buffer.split('\n');
                this.buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.trim())
                        continue;
                    try {
                        const msg = JSON.parse(line);
                        if (msg.type === 'ready') {
                            this.ready = true;
                            resolve(true);
                        }
                        else if (msg.id && this.pendingRequests.has(msg.id)) {
                            this.pendingRequests.get(msg.id)(msg.result);
                            this.pendingRequests.delete(msg.id);
                        }
                    }
                    catch { /* skip malformed lines */ }
                }
            });
            this.process.on('exit', () => { this.ready = false; this.process = null; });
            setTimeout(() => { if (!this.ready)
                resolve(false); }, 8000);
        });
    }
    async _send(command, args) {
        if (!this.ready) {
            const started = await this.start();
            if (!started)
                return null;
        }
        return new Promise((resolve) => {
            const id = `${command}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const payload = JSON.stringify({ id, command, args }) + '\n';
            this.pendingRequests.set(id, (result) => resolve(result));
            this.process?.stdin?.write(payload);
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    resolve(null);
                }
            }, 15000);
        });
    }
    async analyzePE(filepath) {
        return this._send('analyze-pe', { filepath });
    }
    async hashFile(filepath) {
        return this._send('hash-file', { filepath });
    }
    async scanMemory(target) {
        return this._send('scan-memory', { target });
    }
    async verifySignature(filepath) {
        return this._send('verify-signature', { filepath });
    }
    stop() {
        this.process?.stdin?.write(JSON.stringify({ command: 'exit' }) + '\n');
        setTimeout(() => this.process?.kill(), 1000);
        this.process = null;
        this.ready = false;
    }
    isReady() { return this.ready; }
}
