import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
const BRIDGE_PORT = 9400;
const CORTEX_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
export class PythonBridge extends EventEmitter {
    process = null;
    ready = false;
    startAttempts = 0;
    get pythonPath() {
        const venv = path.join(CORTEX_ROOT, 'python', '.venv');
        const bin = os.platform() === 'win32'
            ? path.join(venv, 'Scripts', 'python.exe')
            : path.join(venv, 'bin', 'python3');
        return fs.existsSync(bin) ? bin : (os.platform() === 'win32' ? 'python' : 'python3');
    }
    async start() {
        if (this.ready)
            return true;
        this.startAttempts++;
        return new Promise((resolve) => {
            const pythonScript = path.join(CORTEX_ROOT, 'python', 'cortex_intel', 'api_bridge.py');
            if (!fs.existsSync(pythonScript)) {
                resolve(false);
                return;
            }
            this.process = spawn(this.pythonPath, ['-m', 'cortex_intel.api_bridge'], {
                cwd: path.join(CORTEX_ROOT, 'python'),
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, PYTHONUNBUFFERED: '1' },
            });
            this.process.stderr?.on('data', (data) => {
                const msg = data.toString();
                if (msg.includes('ready on :9400') || msg.includes('Uvicorn running')) {
                    this.ready = true;
                    this.emit('ready');
                    resolve(true);
                }
            });
            this.process.on('exit', () => { this.ready = false; this.process = null; });
            // Timeout after 10 seconds
            setTimeout(() => {
                if (!this.ready) {
                    // Try HTTP probe
                    this._probe().then(ok => { this.ready = ok; resolve(ok); });
                }
            }, 10000);
        });
    }
    async _probe() {
        try {
            const resp = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/health`);
            return resp.ok;
        }
        catch {
            return false;
        }
    }
    async _post(endpoint, body) {
        if (!this.ready) {
            const started = await this.start();
            if (!started)
                return null;
        }
        try {
            const resp = await fetch(`http://127.0.0.1:${BRIDGE_PORT}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!resp.ok)
                return null;
            return (await resp.json());
        }
        catch {
            return null;
        }
    }
    async classify(signal) {
        return this._post('/classify', signal);
    }
    stop() {
        this.process?.kill();
        this.process = null;
        this.ready = false;
    }
    isReady() { return this.ready; }
}
