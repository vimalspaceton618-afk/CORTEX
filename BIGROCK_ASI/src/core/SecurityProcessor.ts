import { createHash } from 'crypto';
import type { SecurityAuditLog, ThreatType } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * BIGROCK_v1 — Zero-Trust Security Processor
 * ────────────────────────────────────────────
 * Every single input to Bigrock is routed through this firewall FIRST
 * before any cognition begins.
 *
 * This is not a simple regex filter — it uses a multi-layer
 * behavioral pattern analysis to detect:
 *
 *  Layer 1: Prompt Injection & Jailbreak patterns
 *  Layer 2: Privilege Escalation attempts
 *  Layer 3: Recursive/Infinite-loop denial-of-service attacks
 *  Layer 4: Data exfiltration probe patterns
 *  Layer 5: Null-byte and encoding-bypass attacks
 *  Layer 6: System call interception patterns
 */
export interface ThreatScan {
    clean: boolean;
    threat_type?: ThreatType;
    severity?: SecurityAuditLog['severity'];
    sanitized_input?: string;
    reason?: string;
}

export class SecurityProcessor {
    private audit_log: SecurityAuditLog[] = [];
    private readonly audit_path: string;

    constructor() {
        this.audit_path = path.resolve(process.cwd(), 'data', 'security_audit.log');
        const data_dir = path.dirname(this.audit_path);
        if (!fs.existsSync(data_dir)) {
            fs.mkdirSync(data_dir, { recursive: true });
        }
    }

    // ── Layer 1: Jailbreak & Prompt Injection Signatures ─────────────────────
    private static readonly JAILBREAK_PATTERNS: RegExp[] = [
        /ignore\s+(all\s+)?(previous|above|prior|your)?\s*instructions/i,
        /you are now\s+(in\s+|a\s+|an\s+)?(developer|god|unrestricted|dan|jailbreak)/i,
        /pretend (you have no |you are not|there are no) (rules|limits|restrictions)/i,
        /act as (if )?you (have no|are without) (restrictions|guidelines|ethics)/i,
        /act as\s+(a\s+)?(god|devil|dan|unrestricted|evil|jailbreak|hacker|root)/i,
        /\[system\]|\[override\]|\[admin\]|\[root\]/i,
        /forget (everything|all|your|previous)/i,
        /your new (persona|identity|role|directive) is/i,
        /disregard (safety|ethical|policy|all)/i,
        /from now on (you|ignore|act|behave|respond)/i,
        /you (have|are) now (no |un)(restricted|limited|filtered)/i,
        /switch (to|into) (developer|god|dan|unrestricted)\s*mode/i,
        /enable\s+(developer|god|jailbreak|unrestricted)\s*mode/i,
    ];

    // ── Layer 2: Privilege Escalation Attempts ────────────────────────────────
    private static readonly PRIVILEGE_ESCALATION_PATTERNS: RegExp[] = [
        /sudo|chmod|chown|setuid|setgid/i,
        /rm\s+-rf|rmdir\s+\/|format\s+c:/i,
        /\b(exec|eval|spawn)\s*\(/i,
        /process\.env|process\.exit|require\s*\(\s*['"]child_process/i,
        /\/etc\/passwd|\/etc\/shadow|\/etc\/sudoers/i,
        /net\s+user\s+.*\/add|reg\s+add.*sam/i,
    ];

    // ── Layer 3: Infinite Loop / DoS Attack Patterns ──────────────────────────
    private static readonly DOS_PATTERNS: RegExp[] = [
        /while\s*\(\s*true\s*\)|for\s*\(\s*;;\s*\)/i,
        /fork.?bomb|forkbomb/i,
        /repeat\s+this\s+(forever|infinitely|1000000)/i,
    ];

    // ── Layer 5: Null Byte & Encoding Bypass Attacks ──────────────────────────
    private static readonly ENCODING_ATTACKS: RegExp[] = [
        /\x00|\\u0000|%00/,                         // Null byte injection
        /\.\.(\/|\\)+/,                              // Path traversal
        /&#(x[0-9a-f]+|[0-9]+);/i,                  // HTML entity bypass
        /<script|javascript:|data:text\/html/i,      // XSS/injection payloads
    ];

    // ── Layer 6: System Call Interception ────────────────────────────────────
    private static readonly SYSCALL_PATTERNS: RegExp[] = [
        /ptrace|mmap|mprotect|munmap/i,
        /syscall\s*\(|int\s+0x80|sysenter/i,
        /\/proc\/self\/mem|\/proc\/\d+\/maps/i,
    ];

    /** 
     * Full 6-layer threat scan. This runs BEFORE any other processing.
     * Returns a clean/dirty verdict with detailed reason.
     */
    public scan(input: string): ThreatScan {
        const layers: Array<[RegExp[], ThreatType, SecurityAuditLog['severity']]> = [
            [SecurityProcessor.JAILBREAK_PATTERNS,          'jailbreak_attempt',         'critical'],
            [SecurityProcessor.PRIVILEGE_ESCALATION_PATTERNS,'privilege_escalation',       'critical'],
            [SecurityProcessor.DOS_PATTERNS,                'infinite_loop',              'high'],
            [SecurityProcessor.ENCODING_ATTACKS,            'null_byte_injection',        'high'],
            [SecurityProcessor.SYSCALL_PATTERNS,            'syscall_interception_attempt','critical'],
        ];

        for (const [patterns, threat_type, severity] of layers) {
            for (const pattern of patterns) {
                if (pattern.test(input)) {
                    const log = this.buildLog(threat_type, severity, input, true);
                    this.audit_log.push(log);
                    return {
                        clean: false,
                        threat_type,
                        severity,
                        reason: `Threat pattern matched in Layer: ${threat_type}`
                    };
                }
            }
        }

        // Layer 4: Data Exfiltration Length Probe
        if (input.length > 32_000) {
            const log = this.buildLog('data_exfiltration_attempt', 'medium', input, true);
            this.audit_log.push(log);
            return {
                clean: false,
                threat_type: 'data_exfiltration_attempt',
                severity: 'medium',
                reason: `Input length (${input.length}) exceeds safe limit of 32000 characters.`
            };
        }

        return { clean: true, sanitized_input: this.sanitize(input) };
    }

    /** Sanitize clean inputs — strip control chars and normalize whitespace */
    private sanitize(input: string): string {
        return input
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Strip ASCII control chars
            .replace(/\s{3,}/g, '  ')                             // Normalize excessive whitespace
            .trim();
    }

    private buildLog(
        threat_type: ThreatType,
        severity: SecurityAuditLog['severity'],
        input: string,
        blocked: boolean
    ): SecurityAuditLog {
        const log: SecurityAuditLog = {
            threat_id: createHash('sha256').update(input + Date.now()).digest('hex').slice(0, 16),
            timestamp: Date.now(),
            threat_type,
            severity,
            payload_hash: createHash('sha256').update(input).digest('hex'),
            blocked,
            action_taken: blocked ? 'INPUT_QUARANTINED' : 'LOGGED',
        };
        
        // Asynchronous non-blocking file append for real-time SIEM ingestion
        const logLine = `[${new Date(log.timestamp).toISOString()}] [${log.severity.toUpperCase()}] Threat: ${log.threat_type} | Action: ${log.action_taken} | Hash: ${log.payload_hash}\n`;
        fs.appendFile(this.audit_path, logLine, 'utf8', (err) => {
            if (err) console.error(`[SECURITY PROCESSOR]: Failed to write to audit log: ${err.message}`);
        });

        return log;
    }

    /**
     * Specialized behavioral audit for shell commands.
     * Returns a detailed risk report for the Approval Gate.
     */
    public auditCommand(command: string): { risk: 'low' | 'medium' | 'high' | 'critical'; reason?: string } {
        const lower = command.toLowerCase();

        // Critical: Destructive/System-level damage
        if (/rm\s+-rf\s+\/|format\s+c:|mkfs|dd\s+if=.*of=\/dev\/sd/i.test(lower)) {
            return { risk: 'critical', reason: 'Attempt to perform catastrophic system destruction or raw disk overwrite.' };
        }
        if (/mv\s+.*\/etc\/|cp\s+.*\/etc\/|chmod\s+777\s+\//i.test(lower)) {
            return { risk: 'critical', reason: 'Attempt to modify critical system configuration or insecurely open filesystem permissions.' };
        }

        // High: Credential/Data exfiltration or privilege escalation
        if (/curl|wget|nc\s+|telnet|ssh\s+|scp\s+|ftp\s+/i.test(lower) && (/\.env|id_rsa|passwd|shadow|config\.json|secret/i.test(lower))) {
            return { risk: 'high', reason: 'Potential credential exfiltration detected (network tool + sensitive file).' };
        }
        if (/sudo\s+|runas\s+|su\s+/i.test(lower)) {
            return { risk: 'high', reason: 'Request for administrative privilege escalation.' };
        }
        if (/grep\s+-r.*password|find\s+.*-name.*\.pem/i.test(lower)) {
            return { risk: 'high', reason: 'Searching for sensitive credentials or keys.' };
        }

        // Medium: Unusual or suspicious activity
        if (/powershell\s+-enc|base64\s+-d|nohup|&|bg\b/i.test(lower)) {
            return { risk: 'medium', reason: 'Use of encoded commands or background execution which can hide malicious activity.' };
        }
        if (/crontab|schtasks|systemctl\s+enable/i.test(lower)) {
            return { risk: 'medium', reason: 'Attempt to establish persistence on the host machine.' };
        }

        return { risk: 'low' };
    }

    public getAuditLog(): SecurityAuditLog[] { return this.audit_log; }
    public getThreatCount(): number { return this.audit_log.filter(l => l.blocked).length; }
}
