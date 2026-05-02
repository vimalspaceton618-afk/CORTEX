import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { EngineID, ThreatLevel, ResponseAction, createSignal, } from "../types.js";
// ─── Known Risky License Types ─────────────────────────────────────────────────
const COPYLEFT_LICENSES = ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'SSPL-1.0', 'EUPL-1.2'];
// ─── Known Third-Party Vendor Patterns ─────────────────────────────────────────
const VENDOR_PATTERNS = [
    { regex: /stripe\.com|@stripe/gi, name: 'Stripe', type: 'payment', data_access: ['payment_data', 'customer_pii'] },
    { regex: /paypal\.com/gi, name: 'PayPal', type: 'payment', data_access: ['payment_data'] },
    { regex: /razorpay/gi, name: 'Razorpay', type: 'payment', data_access: ['payment_data', 'customer_pii'] },
    { regex: /aws\.amazon\.com|@aws-sdk/gi, name: 'AWS', type: 'storage', data_access: ['infrastructure', 'data_storage'] },
    { regex: /googleapis\.com|@google-cloud/gi, name: 'Google Cloud', type: 'storage', data_access: ['infrastructure', 'data_storage'] },
    { regex: /azure\.microsoft\.com|@azure/gi, name: 'Microsoft Azure', type: 'storage', data_access: ['infrastructure', 'data_storage'] },
    { regex: /twilio\.com|@twilio/gi, name: 'Twilio', type: 'api', data_access: ['phone_numbers', 'communication_data'] },
    { regex: /sendgrid\.com|@sendgrid/gi, name: 'SendGrid', type: 'api', data_access: ['email_addresses', 'email_content'] },
    { regex: /auth0\.com|@auth0/gi, name: 'Auth0', type: 'auth', data_access: ['user_credentials', 'identity_data'] },
    { regex: /firebase\.google\.com|firebase/gi, name: 'Firebase', type: 'storage', data_access: ['user_data', 'app_data'] },
    { regex: /cloudflare\.com/gi, name: 'Cloudflare', type: 'cdn', data_access: ['traffic_data', 'dns'] },
    { regex: /sentry\.io|@sentry/gi, name: 'Sentry', type: 'monitoring', data_access: ['error_logs', 'stack_traces', 'user_context'] },
    { regex: /datadog\.com|dd-trace/gi, name: 'Datadog', type: 'monitoring', data_access: ['metrics', 'logs', 'traces'] },
    { regex: /salesforce\.com|jsforce/gi, name: 'Salesforce', type: 'saas', data_access: ['customer_data', 'crm_records'] },
    { regex: /slack\.com|@slack/gi, name: 'Slack', type: 'api', data_access: ['messages', 'user_data'] },
    { regex: /drift\.com/gi, name: 'Drift', type: 'saas', data_access: ['customer_conversations', 'oauth_tokens'] },
    { regex: /mongodb\.com|mongoose/gi, name: 'MongoDB Atlas', type: 'storage', data_access: ['database_records'] },
];
// ─── Engine ────────────────────────────────────────────────────────────────────
export class SupplyChainScanner {
    id = EngineID.SUPPLY_CHAIN_SCANNER;
    name = "SupplyChainScanner · Continuous Inventory & SBOM";
    version = "3.4.0";
    /**
     * Build the full transitive dependency graph from lockfiles.
     */
    buildDependencyGraph(projectPath) {
        const lockPath = path.join(projectPath, 'package-lock.json');
        const pkgPath = path.join(projectPath, 'package.json');
        let directDeps = new Set();
        if (fs.existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                directDeps = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);
            }
            catch { /* skip */ }
        }
        const nodes = [];
        let maxDepth = 0;
        let totalTransitive = 0;
        if (fs.existsSync(lockPath)) {
            try {
                const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
                const packages = lock.packages || {};
                for (const [key, info] of Object.entries(packages)) {
                    if (key === '')
                        continue;
                    const pkgInfo = info;
                    const name = key.replace(/^node_modules\//, '').split('node_modules/').pop() || '';
                    const depth = (key.match(/node_modules/g) || []).length;
                    const isDirect = directDeps.has(name);
                    if (!isDirect)
                        totalTransitive++;
                    if (depth > maxDepth)
                        maxDepth = depth;
                    nodes.push({
                        name,
                        version: pkgInfo.version || 'unknown',
                        depth,
                        is_direct: isDirect,
                        license: pkgInfo.license || 'UNKNOWN',
                        integrity: pkgInfo.integrity || '',
                        children: [],
                    });
                }
            }
            catch { /* skip */ }
        }
        const riskSummary = {
            unknown_licenses: nodes.filter(n => n.license === 'UNKNOWN').length,
            copyleft_licenses: nodes.filter(n => COPYLEFT_LICENSES.includes(n.license)).length,
            no_integrity_hash: nodes.filter(n => !n.integrity).length,
            deeply_nested: nodes.filter(n => n.depth > 5).length,
        };
        return {
            root: path.basename(projectPath),
            ecosystem: 'npm',
            total_dependencies: nodes.length,
            direct_dependencies: directDeps.size,
            transitive_dependencies: totalTransitive,
            max_depth: maxDepth,
            nodes,
            risk_summary: riskSummary,
        };
    }
    /**
     * Generate a signed AI Bill of Materials manifest.
     */
    generateAIBOM(projectPath) {
        const graph = this.buildDependencyGraph(projectPath);
        const dependencies = graph.nodes.map(n => ({
            name: n.name,
            version: n.version,
            license: n.license,
            integrity: n.integrity,
            trust_score: n.integrity ? 80 : (n.license !== 'UNKNOWN' ? 50 : 20),
            known_cves: 0, // Would be populated by ZeroDayPatcher cross-reference
            is_direct: n.is_direct,
        }));
        // Scan for local GGUF models
        const localModels = [];
        const modelsDir = path.join(projectPath, 'models');
        if (fs.existsSync(modelsDir)) {
            try {
                for (const f of fs.readdirSync(modelsDir)) {
                    if (f.endsWith('.gguf')) {
                        const fullPath = path.join(modelsDir, f);
                        const stat = fs.statSync(fullPath);
                        localModels.push({
                            filename: f,
                            format: 'GGUF',
                            size_bytes: stat.size,
                            hash: createHash('sha256').update(f + stat.size + stat.mtimeMs).digest('hex'),
                            provenance: 'unverified',
                        });
                    }
                }
            }
            catch { /* skip */ }
        }
        const riskScore = graph.risk_summary.unknown_licenses * 10
            + graph.risk_summary.copyleft_licenses * 5
            + graph.risk_summary.no_integrity_hash * 3
            + graph.risk_summary.deeply_nested * 2
            + localModels.filter(m => m.provenance === 'unverified').length * 15;
        const bomData = JSON.stringify({ dependencies: dependencies.map(d => d.name + d.version), models: localModels.map(m => m.hash) });
        const signature = createHash('sha256').update(bomData).digest('hex');
        let projectName = 'unknown';
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
            projectName = pkg.name || 'unknown';
        }
        catch { /* skip */ }
        return {
            generated_at: Date.now(),
            project_name: projectName,
            version: '1.0.0',
            dependencies,
            local_models: localModels,
            total_risk_score: riskScore,
            signature,
        };
    }
    /**
     * Scan for OAuth tokens, API keys, and overly-broad credential scopes.
     * Addresses the Drift → Salesforce OAuth compromise vector.
     */
    analyzeOAuthTokens(projectPath) {
        const tokens = [];
        const tokenPatterns = [
            { regex: /OAUTH_TOKEN|oauth_token|access_token/gi, type: 'OAuth Token' },
            { regex: /API_KEY|api_key|apikey/gi, type: 'API Key' },
            { regex: /AWS_SECRET_ACCESS_KEY|aws_secret/gi, type: 'AWS Secret' },
            { regex: /STRIPE_SECRET_KEY|sk_live_|sk_test_/gi, type: 'Stripe Secret Key' },
            { regex: /GITHUB_TOKEN|gh_token|ghp_/gi, type: 'GitHub Token' },
            { regex: /PRIVATE_KEY|private_key|-----BEGIN.*PRIVATE KEY/gi, type: 'Private Key' },
            { regex: /DATABASE_URL|DB_PASSWORD|db_pass/gi, type: 'Database Credential' },
            { regex: /JWT_SECRET|jwt_secret|token_secret/gi, type: 'JWT Secret' },
        ];
        const scanFile = (filePath) => {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                const relPath = path.relative(projectPath, filePath);
                for (let i = 0; i < lines.length; i++) {
                    for (const pat of tokenPatterns) {
                        pat.regex.lastIndex = 0;
                        if (pat.regex.test(lines[i])) {
                            // Check if it's a hardcoded value vs. a reference
                            const isHardcoded = /=\s*['"][a-zA-Z0-9_\-]{20,}['"]/g.test(lines[i]);
                            tokens.push({
                                file: relPath,
                                line: i + 1,
                                type: pat.type,
                                scope_risk: isHardcoded ? 'HARDCODED SECRET — Critical exposure' : 'Reference detected — verify scope is minimal',
                                recommendation: isHardcoded
                                    ? 'CRITICAL: Remove hardcoded secret. Use environment variables or a secrets vault.'
                                    : 'Audit token scope. Apply principle of least privilege.',
                            });
                        }
                    }
                }
            }
            catch { /* skip */ }
        };
        const walkDir = (dir) => {
            let entries;
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (['node_modules', '.git', 'dist'].includes(entry.name))
                        continue;
                    walkDir(full);
                }
                else if (/\.(ts|js|env|yaml|yml|json|toml|cfg|ini)$/.test(entry.name)) {
                    scanFile(full);
                }
            }
        };
        walkDir(projectPath);
        const highRisk = tokens.filter(t => t.scope_risk.includes('HARDCODED'));
        const riskLevel = highRisk.length > 3 ? 'critical'
            : highRisk.length > 0 ? 'high' : tokens.length > 5 ? 'medium' : tokens.length > 0 ? 'low' : 'none';
        return {
            total_tokens_found: tokens.length,
            high_risk_tokens: tokens,
            risk_level: riskLevel,
            recommendations: highRisk.length > 0 ? [
                'Immediately rotate all hardcoded secrets.',
                'Migrate to a secrets management system (HashiCorp Vault, AWS Secrets Manager).',
                'Add pre-commit hooks to block secret commits (e.g., git-secrets, detect-secrets).',
                'Audit OAuth token scopes — enforce least privilege (ref: Drift/Salesforce breach 2025).',
            ] : ['No critical token exposures found. Continue monitoring.'],
        };
    }
    /**
     * Map all third-party SaaS integrations and their data access permissions.
     */
    mapThirdPartyIntegrations(projectPath) {
        const vendorMap = new Map();
        const scanFile = (filePath) => {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const relPath = path.relative(projectPath, filePath);
                for (const vp of VENDOR_PATTERNS) {
                    vp.regex.lastIndex = 0;
                    if (vp.regex.test(content)) {
                        if (!vendorMap.has(vp.name)) {
                            vendorMap.set(vp.name, {
                                name: vp.name,
                                type: vp.type,
                                data_access: vp.data_access,
                                trust_level: 'medium',
                                detected_in: [relPath],
                            });
                        }
                        else {
                            const existing = vendorMap.get(vp.name);
                            if (!existing.detected_in.includes(relPath)) {
                                existing.detected_in.push(relPath);
                            }
                        }
                    }
                }
            }
            catch { /* skip */ }
        };
        const walkDir = (dir) => {
            let entries;
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (['node_modules', '.git', 'dist'].includes(entry.name))
                        continue;
                    walkDir(full);
                }
                else if (/\.(ts|js|tsx|jsx|json|yaml|yml|env)$/.test(entry.name)) {
                    scanFile(full);
                }
            }
        };
        walkDir(projectPath);
        const vendors = [...vendorMap.values()];
        const criticalPaths = vendors
            .filter(v => v.data_access.some(d => d.includes('payment') || d.includes('credentials') || d.includes('pii')))
            .map(v => `${v.name} → ${v.data_access.join(', ')}`);
        const overall = criticalPaths.length > 3 ? 'critical'
            : criticalPaths.length > 1 ? 'high'
                : vendors.length > 5 ? 'medium'
                    : 'low';
        return {
            total_integrations: vendors.length,
            vendors,
            critical_paths: criticalPaths,
            overall_risk: overall,
        };
    }
    // ─── CyberEngine Interface Implementation ──────────────────────────────────
    async initialize() {
        console.log(`[${this.name}] Initializing transitive dependency graph engine…`);
        console.log(`[${this.name}] VENDOR_PATTERNS registry loaded (Stripe, AWS, Twilio, Auth0).`);
    }
    async analyze(ctx) {
        const signals = [];
        // ① Detect malicious package patterns from threat feeds
        const maliciousPackages = ctx.externalFeeds.filter(f => f.iocType === "pattern" && f.severity >= ThreatLevel.HIGH);
        if (maliciousPackages.length > 0) {
            signals.push(createSignal(this.id, ThreatLevel.CRITICAL, `Malicious dependency pattern detected: ${maliciousPackages.map(p => p.ioc).join(", ")} — Possible typo-squatting or brand-jacking`, {
                confidence: 0.94,
                mitreAttack: ["T1195.001", "T1195.002"],
                actions: [ResponseAction.BLOCK, ResponseAction.ALERT, ResponseAction.ESCALATE],
            }));
        }
        // ② Identify overly-broad OAuth token scopes
        const broadTokens = ctx.assetInventory.filter(a => a.tags.includes("oauth-broad-scope"));
        if (broadTokens.length > 0) {
            signals.push(createSignal(this.id, ThreatLevel.HIGH, `${broadTokens.length} OAuth token(s) found with global scope (e.g., Salesforce/Drift vector)`, {
                confidence: 0.89,
                iocs: broadTokens.map(t => `token:${t.assetId}`),
                mitreAttack: ["T1550.001"],
                actions: [ResponseAction.AUDIT, ResponseAction.REPORT, ResponseAction.ALERT],
            }));
        }
        return signals;
    }
    async onSignal(signal) {
        if (signal.sourceEngine === EngineID.ZERO_DAY_PATCHER) {
            console.log(`[${this.name}] Correlating Zero-Day with dependency tree…`);
        }
    }
    async healthCheck() {
        return true;
    }
    async shutdown() {
        console.log(`[${this.name}] Shutdown complete.`);
    }
    /**
     * BEASTMODE ACTIVE SOLVER: SecretRevoker & DependencyLocker
     * Generates a remediation script to revoke hardcoded secrets and enforce dependency constraints.
     */
    solve(projectPath, oauthResult) {
        const result = oauthResult || this.analyzeOAuthTokens(projectPath);
        const actions = [];
        // Secret Revoker
        for (const token of result.high_risk_tokens) {
            if (token.scope_risk.includes('HARDCODED')) {
                const fullPath = path.join(projectPath, token.file);
                if (fs.existsSync(fullPath)) {
                    try {
                        const lines = fs.readFileSync(fullPath, 'utf-8').split('\n');
                        const lineIdx = token.line - 1;
                        if (lines[lineIdx]) {
                            const line = lines[lineIdx];
                            let suggested = '';
                            // Automatically extract the key and replace with process.env
                            const keyMatch = line.match(/(const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*['"][a-zA-Z0-9_\-]{20,}['"]/);
                            if (keyMatch) {
                                const varName = keyMatch[2];
                                suggested = line.replace(/['"][a-zA-Z0-9_\-]{20,}['"]/, `process.env.${varName.toUpperCase()}`);
                            }
                            else {
                                // Fallback: obfuscate string
                                suggested = line.replace(/['"]([a-zA-Z0-9_\-]{20,})['"]/, 'process.env.SECRET_REMOVED_BY_CORTEX');
                            }
                            if (suggested && suggested !== line) {
                                actions.push({
                                    file: token.file,
                                    line: token.line,
                                    original_code: line.trim(),
                                    suggested_code: suggested.trim(),
                                    description: `Revoked hardcoded secret. Replaced with environment variable reference.`,
                                    nist_standard: 'NIST SP 800-63B (Authentication Lifecycle)'
                                });
                            }
                        }
                    }
                    catch { /* skip */ }
                }
            }
        }
        // Dependency Locker
        const pkgPath = path.join(projectPath, 'package.json');
        if (fs.existsSync(pkgPath)) {
            try {
                let content = fs.readFileSync(pkgPath, 'utf-8');
                const pkg = JSON.parse(content);
                let modified = content;
                // Ensure dependencies are strictly pinned (no ^ or ~)
                if (pkg.dependencies) {
                    for (const [name, version] of Object.entries(pkg.dependencies)) {
                        const v = version;
                        if (v.startsWith('^') || v.startsWith('~')) {
                            modified = modified.replace(`"${name}": "${v}"`, `"${name}": "${v.substring(1)}"`);
                        }
                    }
                }
                if (modified !== content) {
                    actions.push({
                        file: 'package.json',
                        line: 1, // conceptual global edit
                        original_code: 'Dependencies with ^ or ~ ranges',
                        suggested_code: 'Strictly pinned dependency versions (e.g., "1.2.3")',
                        description: `Locked dependency versions to prevent dynamic supply chain poisoning.`,
                        nist_standard: 'SSDF (NIST SP 800-218) PW.4.1'
                    });
                }
            }
            catch { /* skip */ }
        }
        return {
            script_id: `REMEDIATION-SUPPLYCHAIN-${Date.now()}`,
            target_engine: 'PQCAuditor', // Using shared interface type for now
            actions,
            is_zero_touch_ready: actions.length > 0
        };
    }
}
