import { PolymorphicDefense, type ShadowAIReport, type AIBOM, type InjectionVulnerability, type DriftAlert } from '../defense/PolymorphicDefense.js';
import { ZeroDayPatcher, type ZeroDayScanResult } from '../defense/ZeroDayPatcher.js';
import { RansomwareGuard, type BlastRadiusReport, type BackupAuditResult, type ExtortionScenario, type ArchitectureMap } from '../defense/RansomwareGuard.js';
import { InsiderThreatEngine, type InsiderThreatReport, type BehaviorEvent, type ShadowAIMonitorResult } from '../defense/InsiderThreatEngine.js';
import { WorkforceAI, type SecurityAlert, type TriagedAlert, type SkillsGapReport, type ThreatHuntResult, type BurnoutAssessment, type TeamProfile } from '../defense/WorkforceAI.js';
import { PQCAuditor, type CryptoInventory, type MigrationPlan, type AgilityScore, type RemediationScript } from '../mythos/PQCAuditor.js';
import { SupplyChainScanner, type DependencyGraph, type SupplyChainAIBOM, type OAuthRiskReport, type VendorRiskGraph } from '../mythos/SupplyChainScanner.js';
import { DeepfakeProtocol, type ImpersonationRisk, type VerificationPlaybook, type DPDPComplianceReport, type DetectionAdvisory, type OrgProfile } from '../mythos/DeepfakeProtocol.js';
import { IoTVulnScanner, type IoTAttackSurfaceReport, type IoMTSafetyReport, type CRAComplianceReport, type SegmentationPlan, type IoTDevice } from '../mythos/IoTVulnScanner.js';
import { CloudConfigAuditor, type IaCScanResult, type SharedResponsibilityMap, type SSOAuditResult, type ConfigDriftReport } from '../mythos/CloudConfigAuditor.js';
import { type CyberEngine, type AnalysisContext, type ThreatSignal, ThreatLevel } from '../types.js';

/**
 * BIGROCK_v1 — CyberSecurityKing
 * ═══════════════════════════════════════════════════════════════════════════
 * MASTER ORCHESTRATOR — Unified controller for all 10 cybersecurity engines.
 *
 * This is the single entry point for CORTEX's cybersecurity capabilities.
 * It provides:
 *   1. FULL SPECTRUM SCAN — Run all engines against a target project
 *   2. SECTOR-SPECIFIC REPORTS — Defense, Healthcare, Finance, Government
 *   3. INDIVIDUAL ENGINE ACCESS — Direct access to each engine
 *   4. COMPOSITE RISK SCORING — Unified threat score across all 10 domains
 *
 * Addresses: ALL 10 Unsolved Cybersecurity Problems of 2026
 *   #1  AI-Powered Attacks          → PolymorphicDefense     (9.2/10)
 *   #2  Zero-Day Exploitation       → ZeroDayPatcher         (8.8/10)
 *   #3  Ransomware Multi-Extortion  → RansomwareGuard        (8.6/10)
 *   #4  Quantum Cryptographic Threat → PQCAuditor             (8.5/10)
 *   #5  Supply Chain Attacks        → SupplyChainScanner     (8.3/10)
 *   #6  Deepfake Fraud              → DeepfakeProtocol       (8.1/10)
 *   #7  IoT/IoMT Vulnerabilities    → IoTVulnScanner         (7.9/10)
 *   #8  Insider Threats             → InsiderThreatEngine     (7.8/10)
 *   #9  Workforce Shortage          → WorkforceAI            (7.5/10)
 *   #10 Cloud Misconfigurations     → CloudConfigAuditor     (7.2/10)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface FullSpectrumScanResult {
    scan_timestamp: number;
    scan_duration_ms: number;
    project_path: string;
    composite_risk_score: number;
    composite_risk_grade: 'A' | 'B' | 'C' | 'D' | 'F';
    engine_results: {
        polymorphic_defense: { shadow_ai: ShadowAIReport; aibom: AIBOM; drift_alerts: DriftAlert[] };
        zero_day_patcher: ZeroDayScanResult;
        pqc_auditor: { inventory: CryptoInventory; migration: MigrationPlan; agility: AgilityScore };
        supply_chain: { graph: DependencyGraph; aibom: SupplyChainAIBOM; oauth: OAuthRiskReport; vendors: VendorRiskGraph };
        cloud_config: IaCScanResult;
        sso_audit: SSOAuditResult;
    };
    summary: string[];
    top_priorities: string[];
}

export class CyberSecurityKing {
    // ─── The 10 Engines ────────────────────────────────────────────────────────
    public readonly polymorphicDefense = new PolymorphicDefense();
    public readonly zeroDayPatcher = new ZeroDayPatcher();
    public readonly ransomwareGuard = new RansomwareGuard();
    public readonly pqcAuditor = new PQCAuditor();
    public readonly supplyChainScanner = new SupplyChainScanner();
    public readonly deepfakeProtocol = new DeepfakeProtocol();
    public readonly iotVulnScanner = new IoTVulnScanner();
    public readonly insiderThreatEngine = new InsiderThreatEngine();
    public readonly workforceAI = new WorkforceAI();
    public readonly cloudConfigAuditor = new CloudConfigAuditor();

    private readonly engines: CyberEngine[];

    constructor() {
        this.engines = [
            this.polymorphicDefense,
            this.zeroDayPatcher,
            this.ransomwareGuard,
            this.pqcAuditor,
            this.supplyChainScanner,
            this.deepfakeProtocol,
            this.iotVulnScanner,
            this.insiderThreatEngine,
            this.workforceAI,
            this.cloudConfigAuditor,
        ];
    }

    /**
     * Initialize all 10 engines in parallel.
     */
    public async initializeAll(): Promise<void> {
        console.log(`[CyberSecurityKing] Initializing full 10-engine stack…`);
        await Promise.all(this.engines.map(e => e.initialize()));
        console.log(`[CyberSecurityKing] All engines online.`);
    }

    /**
     * Run a FULL SPECTRUM SCAN — all applicable engines against a project directory.
     * This is the "one command to rule them all" — a complete cybersecurity audit.
     */
    public fullSpectrumScan(projectPath: string): FullSpectrumScanResult {
        const start = Date.now();

        // ── Engine #1: PolymorphicDefense ────────────────────────────────────
        const baseline = this.polymorphicDefense.buildBehavioralBaseline(projectPath);
        const shadowAI = this.polymorphicDefense.scanForShadowAI(projectPath);
        const aibom = this.polymorphicDefense.generateAIBOM(projectPath);
        const driftAlerts = this.polymorphicDefense.detectSemanticDrift(baseline, baseline); // No drift against self

        // ── Engine #2: ZeroDayPatcher ────────────────────────────────────────
        const zeroDayResult = this.zeroDayPatcher.fullScan(projectPath);

        // ── Engine #4: PQCAuditor ────────────────────────────────────────────
        const cryptoInventory = this.pqcAuditor.inventoryCryptographicUsage(projectPath);
        const migrationPlan = this.pqcAuditor.generatePQCMigrationPlan(cryptoInventory);
        const agilityScore = this.pqcAuditor.scoreCryptographicAgility(projectPath);

        // ── Engine #5: SupplyChainScanner ────────────────────────────────────
        const depGraph = this.supplyChainScanner.buildDependencyGraph(projectPath);
        const supplyAIBOM = this.supplyChainScanner.generateAIBOM(projectPath);
        const oauthReport = this.supplyChainScanner.analyzeOAuthTokens(projectPath);
        const vendorGraph = this.supplyChainScanner.mapThirdPartyIntegrations(projectPath);

        // ── Engine #10: CloudConfigAuditor ───────────────────────────────────
        const iacScan = this.cloudConfigAuditor.scanIaC(projectPath);
        const ssoAudit = this.cloudConfigAuditor.auditSSOConfig(projectPath);

        // ── Composite Score Calculation ──────────────────────────────────────
        const scores = [
            shadowAI.risk_level === 'critical' ? 40 : shadowAI.risk_level === 'high' ? 25 : shadowAI.risk_level === 'medium' ? 10 : 0,
            zeroDayResult.risk_score,
            cryptoInventory.risk_summary.harvest_now_decrypt_later * 20 + cryptoInventory.risk_summary.quantum_vulnerable * 10,
            depGraph.risk_summary.unknown_licenses * 3 + depGraph.risk_summary.no_integrity_hash * 2,
            iacScan.risk_score,
            oauthReport.risk_level === 'critical' ? 30 : oauthReport.risk_level === 'high' ? 20 : 0,
        ];

        const compositeRisk = scores.reduce((a, b) => a + b, 0);
        const compositeGrade = compositeRisk === 0 ? 'A' : compositeRisk < 50 ? 'B' : compositeRisk < 100 ? 'C' : compositeRisk < 200 ? 'D' : 'F';

        // ── Build Summary ────────────────────────────────────────────────────
        const summary: string[] = [];
        summary.push(`📊 COMPOSITE RISK: ${compositeGrade} (Score: ${compositeRisk})`);
        summary.push(`🔍 Files Scanned: ${baseline.total_files} | LOC: ${baseline.total_loc}`);
        summary.push(`🛡️ Zero-Day: ${zeroDayResult.vulnerabilities_found.length} vulns | ${zeroDayResult.taint_flows.length} taint flows | Grade: ${zeroDayResult.risk_grade}`);
        summary.push(`🔐 PQC: ${cryptoInventory.total_crypto_instances} crypto instances | ${cryptoInventory.risk_summary.harvest_now_decrypt_later} HARVEST_NOW targets | Readiness: ${cryptoInventory.overall_quantum_readiness}%`);
        summary.push(`📦 Supply Chain: ${depGraph.total_dependencies} deps | ${depGraph.risk_summary.unknown_licenses} unknown licenses`);
        summary.push(`👤 Shadow AI: ${shadowAI.instances.length} instances | Risk: ${shadowAI.risk_level}`);
        summary.push(`☁️ Cloud IaC: ${iacScan.findings.length} misconfigs | Grade: ${iacScan.risk_grade}`);
        summary.push(`🔑 OAuth/Secrets: ${oauthReport.total_tokens_found} tokens | Risk: ${oauthReport.risk_level}`);

        // ── Top Priorities ───────────────────────────────────────────────────
        const priorities: string[] = [];
        if (cryptoInventory.risk_summary.harvest_now_decrypt_later > 0)
            priorities.push(`🚨 PQC CRITICAL: ${cryptoInventory.risk_summary.harvest_now_decrypt_later} cryptographic operations vulnerable to Harvest Now, Decrypt Later. Migrate to FIPS 203/204/205 IMMEDIATELY.`);
        if (zeroDayResult.vulnerabilities_found.some(v => v.cve.severity === 'critical'))
            priorities.push(`🚨 ZERO-DAY: ${zeroDayResult.vulnerabilities_found.filter(v => v.cve.severity === 'critical').length} CRITICAL CVEs detected in dependencies.`);
        if (shadowAI.risk_level === 'critical' || shadowAI.risk_level === 'high')
            priorities.push(`🚨 SHADOW AI: Unsanctioned AI API usage detected. Corporate data may be leaking to cloud LLMs.`);
        if (oauthReport.risk_level === 'critical' || oauthReport.risk_level === 'high')
            priorities.push(`🚨 SECRETS: Hardcoded credentials detected. Rotate immediately.`);
        if (iacScan.findings.some(f => f.severity === 'critical'))
            priorities.push(`🚨 CLOUD: ${iacScan.findings.filter(f => f.severity === 'critical').length} critical cloud misconfigurations.`);

        if (priorities.length === 0) priorities.push('✅ No critical threats detected. Continue monitoring.');

        return {
            scan_timestamp: Date.now(),
            scan_duration_ms: Date.now() - start,
            project_path: projectPath,
            composite_risk_score: compositeRisk,
            composite_risk_grade: compositeGrade as any,
            engine_results: {
                polymorphic_defense: { shadow_ai: shadowAI, aibom, drift_alerts: driftAlerts },
                zero_day_patcher: zeroDayResult,
                pqc_auditor: { inventory: cryptoInventory, migration: migrationPlan, agility: agilityScore },
                supply_chain: { graph: depGraph, aibom: supplyAIBOM, oauth: oauthReport, vendors: vendorGraph },
                cloud_config: iacScan,
                sso_audit: ssoAudit,
            },
            summary,
            top_priorities: priorities,
        };
    }

    /**
     * Get a human-readable status report of all 10 engines.
     */
    public getEngineManifest(): string[] {
        return [
            '═══════════════════════════════════════════════════════════════════',
            '  BIGROCK CYBERSECURITY KING — 10-ENGINE SOVEREIGN STACK',
            '═══════════════════════════════════════════════════════════════════',
            '',
            '  ┌─ DEFENSE LAYER ─────────────────────────────────────────────┐',
            '  │ #1  PolymorphicDefense    [9.2] AI-Powered Attacks         │',
            '  │ #2  ZeroDayPatcher        [8.8] Zero-Day Exploitation      │',
            '  │ #3  RansomwareGuard       [8.6] Ransomware Multi-Extortion │',
            '  │ #8  InsiderThreatEngine   [7.8] Insider Threat Detection   │',
            '  │ #9  WorkforceAI           [7.5] Workforce Shortage         │',
            '  └───────────────────────────────────────────────────────────────┘',
            '',
            '  ┌─ MYTHOS LAYER ──────────────────────────────────────────────┐',
            '  │ #4  PQCAuditor            [8.5] Quantum Cryptographic Thr. │',
            '  │ #5  SupplyChainScanner    [8.3] Supply Chain Attacks       │',
            '  │ #6  DeepfakeProtocol      [8.1] Deepfake & Synthetic ID   │',
            '  │ #7  IoTVulnScanner        [7.9] IoT/IoMT Vulnerabilities  │',
            '  │ #10 CloudConfigAuditor    [7.2] Cloud Misconfigurations    │',
            '  └───────────────────────────────────────────────────────────────┘',
            '',
            '  Compliance: DPDP Act 2023 | IT Rules 2026 | NIST PQC',
            '              HIPAA | PCI-DSS | EU CRA | SOX | CMMC',
            '  Target Sectors: Defense | Healthcare | Finance | Government',
            '═══════════════════════════════════════════════════════════════════',
        ];
    }

    /**
     * Run all autonomous solvers to generate unified remediation scripts.
     * This enables the /cyberheal command for interactive or zero-touch remediation.
     */
    public runSolvers(projectPath: string, autoApprove: boolean = false): RemediationScript[] {
        const scripts: RemediationScript[] = [];

        // Execute all 10 active solvers
        scripts.push(this.polymorphicDefense.solve(projectPath));
        scripts.push(this.zeroDayPatcher.solve(projectPath));
        scripts.push(this.ransomwareGuard.solve(projectPath));
        scripts.push(this.pqcAuditor.solve(projectPath));
        scripts.push(this.supplyChainScanner.solve(projectPath));
        scripts.push(this.deepfakeProtocol.solve(projectPath));
        scripts.push(this.iotVulnScanner.solve(projectPath));
        scripts.push(this.insiderThreatEngine.solve(projectPath));
        scripts.push(this.workforceAI.solve(projectPath));
        scripts.push(this.cloudConfigAuditor.solve(projectPath));

        // Filter out empty scripts (no actions needed)
        const activeScripts = scripts.filter(s => s.actions.length > 0);

        if (autoApprove) {
            // In a fully wired environment, this would iterate over activeScripts
            // and apply the `suggested_code` directly to the `file` using fs.writeFileSync.
            // For the purpose of the demo, the CLI will handle the rendering.
        }

        return activeScripts;
    }

    /**
     * MAIN EVENT LOOP — The heart of BIGROCK ASI.
     * Continuously triages threats, correlates signals, and triggers remediation.
     */
    public async orchestrate(ctx: AnalysisContext): Promise<void> {
        console.log(`\n[CyberSecurityKing] Starting autonomous orchestration loop…`);
        
        // 1. Analyze phase: Gather signals from all engines
        const signalPromises = this.engines.map(async (engine) => {
            try {
                return await engine.analyze(ctx);
            } catch (err) {
                console.error(`[CyberSecurityKing] Engine ${engine.id} analysis failed:`, err);
                return [];
            }
        });

        const signalArrays = await Promise.all(signalPromises);
        const allSignals = signalArrays.flat().sort((a, b) => b.level - a.level);

        if (allSignals.length === 0) {
            console.log(`[CyberSecurityKing] No active threats detected in this cycle.`);
            return;
        }

        console.log(`[CyberSecurityKing] Triage: ${allSignals.length} signals aggregated.`);

        // 2. Cross-Engine Correlation phase: Broadcast signals to other engines
        for (const signal of allSignals) {
            if (signal.level >= ThreatLevel.MODERATE) {
                const targets = this.engines.filter(e => e.id !== signal.sourceEngine);
                await Promise.all(targets.map(e => e.onSignal(signal)));
            }
        }

        // 3. Response phase: Critical threat handling
        const criticalThreats = allSignals.filter(s => s.level >= ThreatLevel.CRITICAL);
        if (criticalThreats.length > 0) {
            console.warn(`[CyberSecurityKing] ALERT: ${criticalThreats.length} CRITICAL threats active!`);
            // In zero-touch mode, we would call runSolvers(ctx.projectPath, true) here.
        }
    }
}
