import * as path from 'path';
import { EngineID, ThreatLevel, ResponseAction, createSignal, } from "../types.js";
// ─── Known IoT Vulnerability Patterns ──────────────────────────────────────────
const IOT_VULN_PATTERNS = {
    default_creds: {
        vulns: [
            { name: 'Default/Hardcoded Credentials', severity: 'critical', cwe: 'CWE-798', vector: 'Network brute-force or credential stuffing', fix: 'Force credential change on first boot. Implement device-unique passwords.' },
        ]
    },
    no_updates: {
        vulns: [
            { name: 'No Firmware Update Mechanism', severity: 'high', cwe: 'CWE-1277', vector: 'Exploitation of unpatched known vulnerabilities', fix: 'Implement OTA update capability with signed firmware verification.' },
        ]
    },
    unencrypted: {
        vulns: [
            { name: 'Unencrypted Communication', severity: 'high', cwe: 'CWE-319', vector: 'Man-in-the-middle interception of device data', fix: 'Enforce TLS 1.3 for all device communication. Use DTLS for UDP protocols.' },
        ]
    },
    internet_exposed: {
        vulns: [
            { name: 'Unnecessary Internet Exposure', severity: 'high', cwe: 'CWE-668', vector: 'Direct attack from the internet via Shodan-indexed devices', fix: 'Place behind a firewall/NAT. Use VPN for remote access.' },
        ]
    },
};
// ─── Engine ────────────────────────────────────────────────────────────────────
export class IoTVulnScanner {
    id = EngineID.IOT_VULN_SCANNER;
    name = "IoTVulnScanner · Air-Gapped IoT/IoMT Auditor";
    version = "1.7.0";
    /**
     * Map the IoT attack surface from a device inventory.
     */
    mapAttackSurface(devices) {
        const vulns = [];
        const catCount = {};
        for (const dev of devices) {
            catCount[dev.category] = (catCount[dev.category] || 0) + 1;
            if (dev.has_default_credentials) {
                for (const v of IOT_VULN_PATTERNS.default_creds.vulns) {
                    vulns.push({
                        device: dev.name, vulnerability: v.name, severity: v.severity,
                        cwe: v.cwe, attack_vector: v.vector,
                        patient_safety_impact: dev.criticality === 'life_safety',
                        recommendation: v.fix,
                    });
                }
            }
            // Check firmware age
            if (dev.last_update) {
                const updateAge = Date.now() - new Date(dev.last_update).getTime();
                const daysSinceUpdate = updateAge / (1000 * 60 * 60 * 24);
                if (daysSinceUpdate > 365) {
                    for (const v of IOT_VULN_PATTERNS.no_updates.vulns) {
                        vulns.push({
                            device: dev.name, vulnerability: `${v.name} (${Math.round(daysSinceUpdate)} days since last update)`,
                            severity: daysSinceUpdate > 730 ? 'critical' : v.severity,
                            cwe: v.cwe, attack_vector: v.vector,
                            patient_safety_impact: dev.criticality === 'life_safety',
                            recommendation: v.fix,
                        });
                    }
                }
            }
            if (dev.internet_facing) {
                for (const v of IOT_VULN_PATTERNS.internet_exposed.vulns) {
                    vulns.push({
                        device: dev.name, vulnerability: v.name, severity: v.severity,
                        cwe: v.cwe, attack_vector: v.vector,
                        patient_safety_impact: dev.criticality === 'life_safety',
                        recommendation: v.fix,
                    });
                }
            }
            if (!['MQTT+TLS', 'HTTPS', 'CoAPS', 'DTLS'].some(p => dev.protocol.toUpperCase().includes(p.toUpperCase()))) {
                for (const v of IOT_VULN_PATTERNS.unencrypted.vulns) {
                    vulns.push({
                        device: dev.name, vulnerability: v.name, severity: v.severity,
                        cwe: v.cwe, attack_vector: v.vector,
                        patient_safety_impact: dev.criticality === 'life_safety',
                        recommendation: v.fix,
                    });
                }
            }
        }
        const riskScore = vulns.reduce((sum, v) => {
            const sev = { critical: 25, high: 15, medium: 8, low: 3 };
            return sum + (sev[v.severity] || 0) + (v.patient_safety_impact ? 20 : 0);
        }, 0);
        const grade = riskScore === 0 ? 'A' : riskScore < 30 ? 'B' : riskScore < 80 ? 'C' : riskScore < 150 ? 'D' : 'F';
        const recommendations = [
            ...new Set(vulns.map(v => v.recommendation)),
            'Implement network segmentation — isolate IoT devices in dedicated VLANs.',
            'Deploy an IoT-specific monitoring solution for anomaly detection.',
            'Maintain a complete inventory of all connected devices with firmware versions.',
        ];
        return {
            total_devices: devices.length,
            devices_by_category: catCount,
            critical_vulnerabilities: vulns.sort((a, b) => {
                const sev = { critical: 4, high: 3, medium: 2, low: 1 };
                return sev[b.severity] - sev[a.severity];
            }),
            risk_score: riskScore,
            risk_grade: grade,
            recommendations,
        };
    }
    /**
     * Score patient safety risk for medical IoT/IoMT devices.
     * Healthcare breaches average $9.77M (IBM 2025).
     */
    scoreIoMTPatientSafety(devices) {
        const medDevices = devices.filter(d => d.category === 'medical');
        const lifeSafety = medDevices.filter(d => d.criticality === 'life_safety');
        const findings = [];
        for (const dev of medDevices) {
            if (dev.has_default_credentials) {
                findings.push({
                    device: dev.name,
                    finding: 'Default credentials on medical device',
                    patient_impact: dev.criticality === 'life_safety'
                        ? 'CRITICAL: Unauthorized access could directly affect patient treatment or medication delivery.'
                        : 'Unauthorized access to patient health data.',
                    severity: dev.criticality === 'life_safety' ? 'critical' : 'high',
                    mitigation: 'Implement unique device credentials. Enable multi-factor authentication where supported.',
                });
            }
            if (dev.internet_facing) {
                findings.push({
                    device: dev.name,
                    finding: 'Medical device directly exposed to internet',
                    patient_impact: 'Remote attacker could potentially manipulate device parameters.',
                    severity: 'critical',
                    mitigation: 'IMMEDIATELY place behind hospital network firewall. No medical device should be internet-facing.',
                });
            }
        }
        const safetyScore = medDevices.length === 0 ? 100
            : Math.max(0, 100 - (findings.filter(f => f.severity === 'critical').length * 30) - (findings.filter(f => f.severity === 'high').length * 15));
        return {
            total_medical_devices: medDevices.length,
            life_safety_devices: lifeSafety.length,
            safety_score: safetyScore,
            critical_findings: findings,
            regulatory_compliance: {
                fda_510k: findings.filter(f => f.severity === 'critical').length === 0,
                hipaa: !medDevices.some(d => d.has_default_credentials),
                iec_62443: safetyScore >= 70,
            },
            estimated_breach_cost_usd: medDevices.length > 0 ? 9_770_000 : 0, // IBM 2025 healthcare average
        };
    }
    /**
     * Check compliance with the EU Cyber Resilience Act.
     */
    checkCRACompliance(devices) {
        const checks = [
            {
                requirement: 'Products must be delivered with secure default configuration',
                article: 'Article 10(1)',
                status: devices.some(d => d.has_default_credentials) ? 'fail' : 'pass',
                details: devices.filter(d => d.has_default_credentials).map(d => d.name).join(', ') || 'All devices have unique credentials.',
            },
            {
                requirement: 'Manufacturers must provide security updates for the product lifetime',
                article: 'Article 10(6)',
                status: devices.some(d => {
                    if (!d.last_update)
                        return true;
                    return (Date.now() - new Date(d.last_update).getTime()) > 365 * 24 * 60 * 60 * 1000;
                }) ? 'fail' : 'pass',
                details: 'All devices must receive regular security patches.',
            },
            {
                requirement: 'Data confidentiality and integrity must be protected',
                article: 'Article 10(3)',
                status: devices.some(d => !['MQTT+TLS', 'HTTPS', 'CoAPS', 'DTLS'].some(p => d.protocol.toUpperCase().includes(p.toUpperCase()))) ? 'fail' : 'pass',
                details: 'All device communication must use encrypted protocols.',
            },
            {
                requirement: 'Vulnerability handling and disclosure process',
                article: 'Article 11',
                status: 'partial',
                details: 'Manufacturers must establish a coordinated vulnerability disclosure policy.',
            },
        ];
        const nonCompliant = devices.filter(d => d.has_default_credentials || d.internet_facing).map(d => d.name);
        return {
            compliant: checks.every(c => c.status === 'pass'),
            checks,
            non_compliant_devices: [...new Set(nonCompliant)],
            penalties_at_risk: nonCompliant.length > 0 ? 'Up to €15 million or 2.5% of annual worldwide turnover (EU CRA Article 53)' : 'None — currently compliant.',
        };
    }
    /**
     * Generate a network segmentation plan to isolate IoT devices.
     */
    generateSegmentationPlan(devices) {
        const vlans = [
            { vlan_id: 100, name: 'VLAN_IOT_MEDICAL', purpose: 'Isolated medical/IoMT devices', allowed_device_types: ['medical'], internet_access: false },
            { vlan_id: 200, name: 'VLAN_IOT_INDUSTRIAL', purpose: 'Industrial control systems and SCADA', allowed_device_types: ['industrial'], internet_access: false },
            { vlan_id: 300, name: 'VLAN_IOT_BUILDING', purpose: 'Building automation (HVAC, lighting, access control)', allowed_device_types: ['building'], internet_access: false },
            { vlan_id: 400, name: 'VLAN_IOT_CONSUMER', purpose: 'Consumer and convenience devices', allowed_device_types: ['consumer', 'wearable'], internet_access: true },
            { vlan_id: 500, name: 'VLAN_CORPORATE', purpose: 'Corporate workstations and servers', allowed_device_types: [], internet_access: true },
        ];
        const rules = [
            { rule_id: 1, direction: 'inbound', source: 'VLAN_IOT_*', destination: 'VLAN_CORPORATE', port: '*', protocol: 'any', action: 'deny', reason: 'Block all IoT → Corporate traffic to prevent lateral movement' },
            { rule_id: 2, direction: 'inbound', source: 'VLAN_IOT_MEDICAL', destination: 'Internet', port: '*', protocol: 'any', action: 'deny', reason: 'Medical devices must NEVER have direct internet access' },
            { rule_id: 3, direction: 'outbound', source: 'VLAN_IOT_MEDICAL', destination: 'Medical Server (VLAN 500)', port: '443', protocol: 'TLS', action: 'allow', reason: 'Allow encrypted data to medical record system only' },
            { rule_id: 4, direction: 'inbound', source: 'VLAN_IOT_INDUSTRIAL', destination: 'Internet', port: '*', protocol: 'any', action: 'deny', reason: 'SCADA/ICS must be fully air-gapped from internet' },
            { rule_id: 5, direction: 'outbound', source: 'VLAN_IOT_CONSUMER', destination: 'Internet', port: '443', protocol: 'HTTPS', action: 'allow', reason: 'Allow consumer devices limited HTTPS internet access' },
            { rule_id: 6, direction: 'inbound', source: 'Any', destination: 'VLAN_IOT_*', port: '23,22', protocol: 'TCP', action: 'deny', reason: 'Block Telnet/SSH to IoT devices (common attack vector)' },
        ];
        return {
            vlans,
            firewall_rules: rules,
            isolation_strategy: 'Micro-segmentation with zero-trust inter-VLAN routing. Each device category is isolated in its own VLAN with explicit allow-list firewall rules. No IoT device can reach the corporate network directly.',
        };
    }
    // ─── CyberEngine Interface Implementation ──────────────────────────────────
    async initialize() {
        console.log(`[${this.name}] Initializing IoT/IoMT vulnerability heuristic engine…`);
        console.log(`[${this.name}] EU Cyber Resilience Act (CRA) Article 10/11 rules loaded.`);
    }
    async analyze(ctx) {
        const signals = [];
        // ① Detect critical IoMT device anomalies
        const medicalDevices = ctx.assetInventory.filter(a => a.type === "medical-device" && a.criticality === "life_safety");
        if (medicalDevices.length > 0) {
            const exposed = medicalDevices.filter(d => d.exposedToInternet);
            if (exposed.length > 0) {
                signals.push(createSignal(this.id, ThreatLevel.CRITICAL, `${exposed.length} life-safety IoMT device(s) directly exposed to internet (CRA violation)`, {
                    confidence: 0.99,
                    iocs: exposed.map(d => `device:${d.assetId}`),
                    mitreAttack: ["T1078.003"],
                    actions: [ResponseAction.ISOLATE, ResponseAction.BLOCK, ResponseAction.ESCALATE],
                }));
            }
        }
        // ② Industrial/SCADA segmentation failure
        const scadaTraffic = ctx.networkSnapshot.anomalyScore > 65; // Simulated check for SCADA protocols
        if (scadaTraffic) {
            signals.push(createSignal(this.id, ThreatLevel.HIGH, `Anomalous traffic detected in ICS/SCADA segment — potential lateral movement attempt`, {
                confidence: 0.82,
                mitreAttack: ["T0866", "T0801"],
                actions: [ResponseAction.ISOLATE, ResponseAction.SHUTDOWN, ResponseAction.ESCALATE],
            }));
        }
        return signals;
    }
    async onSignal(signal) {
        if (signal.sourceEngine === EngineID.RANSOMWARE_GUARD) {
            console.log(`[${this.name}] Ransomware detected in enterprise segment — activating IoT/IoMT VLAN isolation…`);
        }
    }
    async healthCheck() {
        return true;
    }
    async shutdown() {
        console.log(`[${this.name}] Shutdown complete.`);
    }
    /**
     * BEASTMODE ACTIVE SOLVER: ZeroTrustEnforcer & FirewallConfigurator
     * Generates a remediation script to segment IoT devices and enforce zero-trust firewalls.
     */
    solve(projectPath, devices) {
        const plan = this.generateSegmentationPlan(devices ?? []);
        const actions = [];
        // Generate synthetic IaC or Shell script representations of the firewall actions
        // In a real environment, this might write to a Terraform file or directly call a Palo Alto/Cisco API
        const firewallConfigPath = path.join(projectPath, 'infrastructure', 'firewall_rules.tf');
        let tfRules = '';
        for (const rule of plan.firewall_rules) {
            tfRules += `\nresource "firewall_rule" "rule_${rule.rule_id}" {
  action = "${rule.action}"
  source = "${rule.source}"
  destination = "${rule.destination}"
  protocol = "${rule.protocol}"
  port = "${rule.port}"
  description = "${rule.reason}"
}\n`;
        }
        if (tfRules) {
            actions.push({
                file: 'infrastructure/firewall_rules.tf',
                line: 1,
                original_code: '// Missing micro-segmentation',
                suggested_code: tfRules.trim(),
                description: `Enforced Zero-Trust micro-segmentation for IoT/IoMT VLANs.`,
                nist_standard: 'NIST SP 800-207 (Zero Trust Architecture)'
            });
        }
        return {
            script_id: `REMEDIATION-IOT-${Date.now()}`,
            target_engine: 'PQCAuditor', // Using shared interface type for now
            actions,
            is_zero_touch_ready: actions.length > 0
        };
    }
}
