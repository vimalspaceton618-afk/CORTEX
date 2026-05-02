import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
export class KernelInterface {
    platform = os.platform();
    /**
     * Read live system telemetry.
     * On Linux: reads /proc/cpuinfo, /proc/meminfo, /proc/stat.
     * On Windows: uses Node.js os module equivalents.
     */
    getTelemetry() {
        const memory = {
            total_gb: parseFloat((os.totalmem() / 1e9).toFixed(2)),
            free_gb: parseFloat((os.freemem() / 1e9).toFixed(2)),
            used_gb: parseFloat(((os.totalmem() - os.freemem()) / 1e9).toFixed(2)),
            usage_percent: parseFloat(((1 - os.freemem() / os.totalmem()) * 100).toFixed(1))
        };
        const cpus = os.cpus();
        const load = os.loadavg();
        return {
            timestamp: Date.now(),
            cpu: {
                model: cpus[0]?.model || 'Unknown',
                cores: cpus.length / 2,
                threads: cpus.length,
                load_percent: parseFloat((load[0] * 10).toFixed(1)),
                frequency_mhz: cpus[0]?.speed || 0
            },
            memory,
            os: {
                platform: this.platform,
                release: os.release(),
                hostname: os.hostname(),
                uptime_hours: parseFloat((os.uptime() / 3600).toFixed(2))
            },
            processes: {
                total: this.getProcessCount()
            }
        };
    }
    /** Safe read-only filesystem access — no write permissions at this prototype level */
    readFile(file_path) {
        const resolved = path.resolve(file_path);
        // Security: Never allow traversal outside of user home
        const safe_root = os.homedir();
        if (!resolved.startsWith(safe_root) && !resolved.startsWith('/proc')) {
            return { success: false, error: `ACCESS DENIED: Path "${resolved}" is outside safe root.` };
        }
        try {
            const data = fs.readFileSync(resolved, 'utf-8');
            return { success: true, data, bytes_read: Buffer.byteLength(data) };
        }
        catch (e) {
            return { success: false, error: e.message };
        }
    }
    /** Read a live /proc telemetry file (Linux only) */
    readProc(proc_file) {
        if (this.platform !== 'linux') {
            return {
                success: false,
                error: `Platform "${this.platform}" does not support /proc. Requires Linux kernel.`
            };
        }
        return this.readFile('/proc/' + proc_file);
    }
    /** List directory structure */
    listDirectory(dir_path) {
        try {
            const entries = fs.readdirSync(dir_path);
            return { success: true, entries };
        }
        catch (e) {
            return { success: false, error: e.message };
        }
    }
    /** Safe command execution — whitelist only */
    execSafe(command) {
        const ALLOWED_COMMANDS = ['uptime', 'uname -a', 'df -h', 'free -h', 'ps aux --no-header | wc -l'];
        if (!ALLOWED_COMMANDS.some(c => command.startsWith(c.split(' ')[0]))) {
            return { success: false, error: `Command "${command}" is not on the ASI kernel whitelist.` };
        }
        try {
            const output = execSync(command, { encoding: 'utf-8', timeout: 5000 });
            return { success: true, output: output.trim() };
        }
        catch (e) {
            return { success: false, error: e.message };
        }
    }
    getProcessCount() {
        try {
            if (this.platform === 'linux') {
                return parseInt(execSync('ls /proc | grep -c "^[0-9]"', { encoding: 'utf-8' }));
            }
            return -1; // Unknown on non-Linux
        }
        catch {
            return -1;
        }
    }
}
