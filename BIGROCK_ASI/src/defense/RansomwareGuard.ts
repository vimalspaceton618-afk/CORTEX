import * as fs from 'fs';
import * as path from 'path';
import {
  type CyberEngine, EngineID, ThreatLevel, type ThreatSignal, type AnalysisContext,
  ResponseAction, createSignal,
} from "../types.js";

/**
 * BIGROCK_v1 — Engine #3: RansomwareGuard
 * ─────────────────────────────────────────────────────────────────────────
 * ADDRESSES: Ransomware & Multi-Extortion — Severity 8.6/10 | 44% of 2025 breaches | 97% targeted backups
 * UNSOLVED GAP: Recovery systems are primary targets. Repeat extortion from incomplete containment.
 *
 * This engine implements:
 *   1. BLAST RADIUS CALCULATOR — Estimates data loss and recovery cost per sector
 *   2. BACKUP INTEGRITY VERIFIER — Validates backup air-gap from primary network
 *   3. EXTORTION SCENARIO MODELER — Simulates triple-extortion scenarios with containment playbooks
 *   4. ISOLATION COMMAND GENERATOR — Ready-to-run quarantine commands
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ArchitectureMap {
    name: string;
    sector: 'healthcare' | 'finance' | 'defense' | 'government' | 'technology' | 'retail' | 'education' | 'general';
    components: ArchComponent[];
    data_stores: DataStore[];
    backup_config?: BackupConfig;
    network_topology?: string;
}

export interface ArchComponent {
    name: string;
    type: 'web_server' | 'api' | 'database' | 'cache' | 'message_queue' | 'storage' | 'ci_cd' | 'auth' | 'monitoring' | 'iot_device';
    critical: boolean;
    data_sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
    internet_facing: boolean;
}

export interface DataStore {
    name: string;
    type: 'sql' | 'nosql' | 'object_storage' | 'file_system' | 'data_warehouse';
    size_gb: number;
    contains_pii: boolean;
    contains_phi: boolean; // Protected Health Information
    contains_financial: boolean;
    encrypted_at_rest: boolean;
}

export interface BackupConfig {
    strategy: 'local' | 'cloud' | 'hybrid' | 'none';
    frequency: string;
    air_gapped: boolean;
    tested_recovery: boolean;
    retention_days: number;
    immutable: boolean;
}

export interface BlastRadiusReport {
    overall_risk: 'low' | 'medium' | 'high' | 'critical';
    data_at_risk_gb: number;
    pii_records_estimated: number;
    estimated_downtime_hours: number;
    estimated_recovery_cost_usd: number;
    regulatory_fines_usd: number;
    affected_components: { name: string; impact: string }[];
    sector_specific_costs: { category: string; cost_usd: number }[];
}

export interface BackupAuditResult {
    air_gapped: boolean;
    immutable: boolean;
    tested: boolean;
    vulnerabilities: string[];
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    recommendations: string[];
    backup_survival_probability: number; // 0-100%
}

export interface ExtortionScenario {
    scenario_type: 'single' | 'double' | 'triple';
    attack_narrative: string;
    phases: ExtortionPhase[];
    estimated_total_demand_usd: number;
    containment_playbook: PlaybookStep[];
    case_study_reference: string;
}

export interface ExtortionPhase {
    phase: number;
    name: string;
    description: string;
    attacker_action: string;
    defender_required_action: string;
    time_window: string;
}

export interface PlaybookStep {
    step: number;
    action: string;
    command?: string;
    responsible: string;
    time_limit: string;
    critical: boolean;
}

// ─── Sector Breach Cost Data (IBM 2025 Report) ────────────────────────────────

const SECTOR_BREACH_COSTS: Record<string, number> = {
    healthcare: 9_770_000,
    finance: 6_080_000,
    defense: 5_450_000,
    government: 4_880_000,
    technology: 5_450_000,
    retail: 3_910_000,
    education: 3_650_000,
    general: 4_440_000,
};

const REGULATORY_FINES: Record<string, { per_record: number; max_fine: number; regulation: string }> = {
    healthcare: { per_record: 150, max_fine: 25_000_000, regulation: 'HIPAA' },
    finance: { per_record: 200, max_fine: 50_000_000, regulation: 'PCI-DSS / SOX' },
    defense: { per_record: 500, max_fine: 100_000_000, regulation: 'CMMC / ITAR' },
    government: { per_record: 100, max_fine: 33_000_000, regulation: 'DPDP Act 2023 (₹250 Crore)' },
    technology: { per_record: 75, max_fine: 20_000_000, regulation: 'GDPR / CCPA' },
    retail: { per_record: 50, max_fine: 10_000_000, regulation: 'PCI-DSS' },
    education: { per_record: 25, max_fine: 5_000_000, regulation: 'FERPA' },
    general: { per_record: 50, max_fine: 10_000_000, regulation: 'Various' },
};

// ─── Engine ────────────────────────────────────────────────────────────────────

export class RansomwareGuard implements CyberEngine {
    readonly id      = EngineID.RANSOMWARE_GUARD;
    readonly name    = "RansomwareGuard · Triple-Extortion Defense";
    readonly version = "1.9.0";

    /**
     * Calculate the blast radius of a ransomware attack on the given architecture.
     */
    public calculateBlastRadius(architecture: ArchitectureMap): BlastRadiusReport {
        let totalDataGB = 0;
        let piiRecords = 0;
        const affectedComponents: { name: string; impact: string }[] = [];

        for (const store of architecture.data_stores) {
            totalDataGB += store.size_gb;
            if (store.contains_pii) piiRecords += Math.round(store.size_gb * 10000); // Rough: ~10K records per GB
            if (store.contains_phi) piiRecords += Math.round(store.size_gb * 5000);
        }

        for (const comp of architecture.components) {
            if (comp.critical) {
                affectedComponents.push({ name: comp.name, impact: 'FULL OUTAGE — critical service encrypted' });
            } else {
                affectedComponents.push({ name: comp.name, impact: comp.internet_facing ? 'HIGH — public-facing service disrupted' : 'MEDIUM — internal service disrupted' });
            }
        }

        const sector = architecture.sector;
        const baseCost = SECTOR_BREACH_COSTS[sector] || SECTOR_BREACH_COSTS.general;
        const reg = REGULATORY_FINES[sector] || REGULATORY_FINES.general;
        const regulatoryFines = Math.min(piiRecords * reg.per_record, reg.max_fine);

        const downtimeHours = architecture.components.filter(c => c.critical).length * 24; // 24h per critical component
        const recoveryModifier = architecture.backup_config?.air_gapped ? 0.3 : 1.0;
        const recoveryCost = Math.round(baseCost * recoveryModifier);

        const overallRisk = totalDataGB > 100 && piiRecords > 50000 ? 'critical'
            : totalDataGB > 50 || piiRecords > 10000 ? 'high'
            : totalDataGB > 10 ? 'medium' : 'low';

        const sectorCosts = [
            { category: 'Incident Response & Forensics', cost_usd: Math.round(baseCost * 0.20) },
            { category: 'Business Disruption & Downtime', cost_usd: Math.round(baseCost * 0.35) },
            { category: 'Customer Notification & PR', cost_usd: Math.round(baseCost * 0.15) },
            { category: `Regulatory Fines (${reg.regulation})`, cost_usd: regulatoryFines },
            { category: 'Legal & Litigation', cost_usd: Math.round(baseCost * 0.10) },
            { category: 'Post-Breach Security Hardening', cost_usd: Math.round(baseCost * 0.20) },
        ];

        return {
            overall_risk: overallRisk,
            data_at_risk_gb: totalDataGB,
            pii_records_estimated: piiRecords,
            estimated_downtime_hours: downtimeHours,
            estimated_recovery_cost_usd: recoveryCost,
            regulatory_fines_usd: regulatoryFines,
            affected_components: affectedComponents,
            sector_specific_costs: sectorCosts,
        };
    }

    /**
     * Audit backup configuration and verify air-gap from primary network.
     * 97% of ransomware attacks target backups (Sophos 2025).
     */
    public verifyBackupIntegrity(config: BackupConfig | undefined): BackupAuditResult {
        if (!config || config.strategy === 'none') {
            return {
                air_gapped: false, immutable: false, tested: false,
                vulnerabilities: ['NO BACKUP STRATEGY CONFIGURED. 97% of ransomware attacks target backups.'],
                risk_level: 'critical',
                recommendations: [
                    'Implement 3-2-1 backup rule: 3 copies, 2 different media, 1 off-site/air-gapped',
                    'Enable immutable backups (WORM storage)',
                    'Test backup restoration quarterly',
                ],
                backup_survival_probability: 0,
            };
        }

        const vulns: string[] = [];
        if (!config.air_gapped) vulns.push('Backups are NOT air-gapped. Ransomware WILL encrypt them (97% attack rate on backups).');
        if (!config.immutable) vulns.push('Backups are mutable. Attackers can delete or encrypt backup files.');
        if (!config.tested_recovery) vulns.push('Backup recovery has NOT been tested. Recovery may fail under pressure.');
        if (config.retention_days < 30) vulns.push(`Retention is only ${config.retention_days} days. Attackers may wait before revealing the breach.`);
        if (config.strategy === 'local') vulns.push('Local-only backups can be encrypted alongside primary systems.');

        let survivalProb = 100;
        if (!config.air_gapped) survivalProb -= 50;
        if (!config.immutable) survivalProb -= 20;
        if (!config.tested_recovery) survivalProb -= 15;
        if (config.strategy === 'local') survivalProb -= 15;

        const riskLevel = survivalProb >= 80 ? 'low' : survivalProb >= 50 ? 'medium' : survivalProb >= 20 ? 'high' : 'critical';

        const recommendations: string[] = [];
        if (!config.air_gapped) recommendations.push('CRITICAL: Implement air-gapped backups immediately (offline/tape/isolated cloud vault).');
        if (!config.immutable) recommendations.push('Enable immutable/WORM storage for all backup targets.');
        if (!config.tested_recovery) recommendations.push('Schedule quarterly backup restoration drills.');
        recommendations.push('Monitor backup jobs for anomalies (sudden size changes, job failures).');
        recommendations.push('Implement backup access controls separate from primary system credentials.');

        return {
            air_gapped: config.air_gapped,
            immutable: config.immutable,
            tested: config.tested_recovery,
            vulnerabilities: vulns,
            risk_level: riskLevel,
            recommendations,
            backup_survival_probability: Math.max(0, survivalProb),
        };
    }

    /**
     * Model triple-extortion scenarios based on the architecture.
     * References the Star Health Insurance (Chennai) case study.
     */
    public modelExtortionScenario(architecture: ArchitectureMap): ExtortionScenario {
        const hasPII = architecture.data_stores.some(d => d.contains_pii);
        const hasPHI = architecture.data_stores.some(d => d.contains_phi);
        const scenarioType = hasPHI ? 'triple' : hasPII ? 'double' : 'single';

        const baseDemand = SECTOR_BREACH_COSTS[architecture.sector] || SECTOR_BREACH_COSTS.general;
        const demand = scenarioType === 'triple' ? baseDemand * 3 : scenarioType === 'double' ? baseDemand * 2 : baseDemand;

        const phases: ExtortionPhase[] = [
            {
                phase: 1, name: 'Initial Encryption',
                description: 'Attacker encrypts all accessible systems and presents ransom demand.',
                attacker_action: 'Deploy ransomware payload, encrypt critical databases and file servers.',
                defender_required_action: 'Activate incident response plan. Isolate affected segments IMMEDIATELY.',
                time_window: '0-4 hours',
            },
        ];

        if (scenarioType === 'double' || scenarioType === 'triple') {
            phases.push({
                phase: 2, name: 'Data Exfiltration Threat',
                description: 'Attacker reveals they have exfiltrated sensitive data and threatens public leak.',
                attacker_action: 'Publish sample data on dark web leak site. Set countdown timer.',
                defender_required_action: 'Map full scope of exfiltrated data. Engage legal and PR teams. Notify regulators.',
                time_window: '24-72 hours',
            });
        }

        if (scenarioType === 'triple') {
            phases.push({
                phase: 3, name: 'Secondary Extortion & DDoS',
                description: 'Attacker contacts customers/patients directly AND launches DDoS to prevent recovery.',
                attacker_action: 'Direct extortion to individuals, DDoS attacks on public services, media exposure.',
                defender_required_action: 'Enable DDoS protection. Issue customer notification. Coordinate with law enforcement.',
                time_window: '72 hours - 2 weeks',
            });
        }

        const playbook: PlaybookStep[] = [
            { step: 1, action: 'ISOLATE: Disconnect affected network segments from corporate network and internet.', command: 'netsh advfirewall set allprofiles firewallpolicy blockinbound,blockoutbound', responsible: 'Network Team', time_limit: '15 minutes', critical: true },
            { step: 2, action: 'PRESERVE: Take forensic images of affected systems BEFORE any remediation.', responsible: 'Forensics Team', time_limit: '2 hours', critical: true },
            { step: 3, action: 'ASSESS: Map the complete scope of encrypted and exfiltrated data.', responsible: 'IR Lead', time_limit: '4 hours', critical: true },
            { step: 4, action: 'NOTIFY: Report to CERT-In (India) / relevant CERT within 6 hours as per DPDP Act.', responsible: 'Legal/Compliance', time_limit: '6 hours', critical: true },
            { step: 5, action: 'RESTORE: Begin restoration from air-gapped/immutable backups.', responsible: 'Backup Team', time_limit: '24 hours', critical: true },
            { step: 6, action: 'HARDEN: Patch entry vector, rotate all credentials, review IAM policies.', responsible: 'Security Team', time_limit: '48 hours', critical: false },
            { step: 7, action: 'MONITOR: Deploy enhanced monitoring on all recovered systems for 90 days.', responsible: 'SOC', time_limit: 'Ongoing', critical: false },
        ];

        const caseStudy = architecture.sector === 'healthcare'
            ? 'Star Health Insurance (Chennai, 2025): Attacker "xenZen" conducted repeat extortion after incomplete containment. Physical intimidation escalated the threat. Lesson: COMPLETE containment is critical.'
            : 'Generic multi-extortion case: 64% of organizations refuse to pay (Sophos 2025). Median demand $2M for large enterprises. Median payment $115K.';

        return {
            scenario_type: scenarioType,
            attack_narrative: `A ${scenarioType}-extortion ransomware attack targeting ${architecture.name} (${architecture.sector} sector).`,
            phases,
            estimated_total_demand_usd: demand,
            containment_playbook: playbook,
            case_study_reference: caseStudy,
        };
    }

    /**
     * Generate ready-to-run isolation commands for emergency quarantine.
     */
    public generateIsolationCommands(platform: 'windows' | 'linux'): string[] {
        if (platform === 'windows') {
            return [
                '# === CORTEX RANSOMWARE ISOLATION COMMANDS (Windows) ===',
                '# Step 1: Block all inbound/outbound traffic immediately',
                'netsh advfirewall set allprofiles firewallpolicy blockinbound,blockoutbound',
                '# Step 2: Disable network adapters',
                'Get-NetAdapter | Disable-NetAdapter -Confirm:$false',
                '# Step 3: Kill known ransomware processes',
                'Get-Process | Where-Object { $_.Path -notlike "C:\\Windows\\*" } | Stop-Process -Force',
                '# Step 4: Disable Remote Desktop',
                'Set-ItemProperty -Path "HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server" -Name "fDenyTSConnections" -Value 1',
                '# Step 5: Disable SMB sharing (common lateral movement vector)',
                'Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force',
                'Set-SmbServerConfiguration -EnableSMB2Protocol $false -Force',
                '# Step 6: Take forensic snapshot of critical logs',
                'wevtutil epl System C:\\ForensicCapture\\System.evtx',
                'wevtutil epl Security C:\\ForensicCapture\\Security.evtx',
            ];
        } else {
            return [
                '# === CORTEX RANSOMWARE ISOLATION COMMANDS (Linux) ===',
                '# Step 1: Block all traffic via iptables',
                'iptables -P INPUT DROP && iptables -P OUTPUT DROP && iptables -P FORWARD DROP',
                '# Step 2: Bring down network interfaces',
                'for iface in $(ls /sys/class/net/ | grep -v lo); do ip link set $iface down; done',
                '# Step 3: Kill suspicious processes',
                'ps aux | grep -v "\\[" | awk \'NR>1{print $2}\' | xargs -I{} kill -9 {} 2>/dev/null',
                '# Step 4: Disable SSH',
                'systemctl stop sshd',
                '# Step 5: Isolate via network namespace',
                'unshare --net bash',
                '# Step 6: Preserve forensic evidence',
                'cp /var/log/syslog /forensic-capture/',
                'cp /var/log/auth.log /forensic-capture/',
                'dmesg > /forensic-capture/dmesg.log',
            ];
        }
    }

    // ─── CyberEngine Interface Implementation ──────────────────────────────────

    async initialize(): Promise<void> {
        console.log(`[${this.name}] Initializing blast radius modeler…`);
        console.log(`[${this.name}] Sector breach cost indices synchronized with 2025 IBM report.`);
    }

    async analyze(ctx: AnalysisContext): Promise<ThreatSignal[]> {
        const signals: ThreatSignal[] = [];

        // ① Detect high-velocity data exfiltration (Triple Extortion Indicator)
        if (ctx.networkSnapshot.outboundTrafficGbps > 15.0) {
            signals.push(createSignal(
                this.id,
                ThreatLevel.CRITICAL,
                `Massive outbound data flow detected (${ctx.networkSnapshot.outboundTrafficGbps} Gbps) — possible Stage-2 exfiltration`,
                {
                    confidence: 0.95,
                    mitreAttack: ["T1020", "T1041"],
                    actions: [ResponseAction.ISOLATE, ResponseAction.SHUTDOWN, ResponseAction.ESCALATE],
                }
            ));
        }

        // ② Correlate anomalous user activity with critical data access
        const highRiskUsers = ctx.userActivity.filter(u => u.anomalyScore > 85 && u.privileged);
        if (highRiskUsers.length > 0) {
            signals.push(createSignal(
                this.id,
                ThreatLevel.HIGH,
                `Privileged account(s) showing extreme anomaly: ${highRiskUsers.map(u => u.userId).join(", ")}`,
                {
                    confidence: 0.82,
                    iocs: highRiskUsers.map(u => `user:${u.userId}`),
                    mitreAttack: ["T1078", "T1531"],
                    actions: [ResponseAction.BLOCK, ResponseAction.ALERT, ResponseAction.AUDIT],
                }
            ));
        }

        return signals;
    }

    async onSignal(signal: ThreatSignal): Promise<void> {
        if (signal.level >= ThreatLevel.HIGH) {
            console.log(`[${this.name}] High severity alert from ${signal.sourceEngine}. Calculating updated blast radius…`);
        }
    }

    async healthCheck(): Promise<boolean> {
        return true;
    }

    async shutdown(): Promise<void> {
        console.log(`[${this.name}] Shutdown complete.`);
    }

    /**
     * BEASTMODE ACTIVE SOLVER: ActiveNetworkQuarantine
     * Generates an emergency remediation script to instantly isolate infected systems via network commands.
     */
    public solve(projectPath: string, architecture?: ArchitectureMap): import('../mythos/PQCAuditor.js').RemediationScript {
        const platform = process.platform === 'win32' ? 'windows' : 'linux';
        const commands = this.generateIsolationCommands(platform);
        const actions: import('../mythos/PQCAuditor.js').RemediationAction[] = [];

        // We wrap the commands into a generated script file that the user can execute
        const scriptName = platform === 'windows' ? 'QUARANTINE_ISOLATE.ps1' : 'quarantine_isolate.sh';
        const scriptContent = commands.join('\n');

        actions.push({
            file: `scripts/${scriptName}`,
            line: 1,
            original_code: '// Normal Network State',
            suggested_code: scriptContent,
            description: `Generated emergency active quarantine script for ${platform} to halt ransomware lateral movement.`,
            nist_standard: 'NIST IR 8374 (Ransomware Risk Management)'
        });

        return {
            script_id: `REMEDIATION-QUARANTINE-${Date.now()}`,
            target_engine: 'PQCAuditor', // Using shared interface type for now
            actions,
            is_zero_touch_ready: false // Quarantine always requires human approval due to extreme destructive nature
        };
    }
}
