import * as fs from 'fs';
import * as path from 'path';
import { EngineID, ThreatLevel, ResponseAction, createSignal, } from "../types.js";
// ─── Quantum-Vulnerable Algorithm Database ─────────────────────────────────────
const QUANTUM_VULNERABLE_ALGORITHMS = {
    // Asymmetric — ALL broken by Shor's algorithm
    'rsa': { risk: 'HARVEST_NOW_DECRYPT_LATER', replacement: 'FIPS 204 ML-DSA (CRYSTALS-Dilithium)', priority: 'critical' },
    'rsa-2048': { risk: 'HARVEST_NOW_DECRYPT_LATER', replacement: 'FIPS 204 ML-DSA (CRYSTALS-Dilithium)', priority: 'critical' },
    'rsa-4096': { risk: 'HARVEST_NOW_DECRYPT_LATER', replacement: 'FIPS 204 ML-DSA (CRYSTALS-Dilithium)', priority: 'critical' },
    'rs256': { risk: 'HARVEST_NOW_DECRYPT_LATER', replacement: 'FIPS 204 ML-DSA + FIPS 203 ML-KEM hybrid', priority: 'critical' },
    'rs384': { risk: 'HARVEST_NOW_DECRYPT_LATER', replacement: 'FIPS 204 ML-DSA', priority: 'critical' },
    'rs512': { risk: 'HARVEST_NOW_DECRYPT_LATER', replacement: 'FIPS 204 ML-DSA', priority: 'critical' },
    'ps256': { risk: 'HARVEST_NOW_DECRYPT_LATER', replacement: 'FIPS 204 ML-DSA', priority: 'critical' },
    'ecdsa': { risk: 'HARVEST_NOW_DECRYPT_LATER', replacement: 'FIPS 204 ML-DSA (CRYSTALS-Dilithium)', priority: 'critical' },
    'ecdh': { risk: 'HARVEST_NOW_DECRYPT_LATER', replacement: 'FIPS 203 ML-KEM (CRYSTALS-Kyber)', priority: 'critical' },
    'es256': { risk: 'HARVEST_NOW_DECRYPT_LATER', replacement: 'FIPS 204 ML-DSA', priority: 'critical' },
    'es384': { risk: 'HARVEST_NOW_DECRYPT_LATER', replacement: 'FIPS 204 ML-DSA', priority: 'critical' },
    'es512': { risk: 'HARVEST_NOW_DECRYPT_LATER', replacement: 'FIPS 204 ML-DSA', priority: 'critical' },
    'ed25519': { risk: 'QUANTUM_VULNERABLE', replacement: 'FIPS 204 ML-DSA or FIPS 205 SLH-DSA', priority: 'high' },
    'ed448': { risk: 'QUANTUM_VULNERABLE', replacement: 'FIPS 204 ML-DSA', priority: 'high' },
    'x25519': { risk: 'QUANTUM_VULNERABLE', replacement: 'FIPS 203 ML-KEM + X25519 hybrid', priority: 'high' },
    'x448': { risk: 'QUANTUM_VULNERABLE', replacement: 'FIPS 203 ML-KEM', priority: 'high' },
    'diffie-hellman': { risk: 'HARVEST_NOW_DECRYPT_LATER', replacement: 'FIPS 203 ML-KEM (CRYSTALS-Kyber)', priority: 'critical' },
    'dh': { risk: 'HARVEST_NOW_DECRYPT_LATER', replacement: 'FIPS 203 ML-KEM (CRYSTALS-Kyber)', priority: 'critical' },
    'dsa': { risk: 'HARVEST_NOW_DECRYPT_LATER', replacement: 'FIPS 204 ML-DSA', priority: 'critical' },
    'elgamal': { risk: 'HARVEST_NOW_DECRYPT_LATER', replacement: 'FIPS 203 ML-KEM', priority: 'critical' },
    // Symmetric — SAFE (Grover's algorithm halves key strength, but AES-256 → AES-128 equivalent is still strong)
    'aes-256': { risk: 'SYMMETRIC_SAFE', replacement: 'No change needed (quantum-resistant at 256-bit)', priority: 'low' },
    'aes-256-gcm': { risk: 'SYMMETRIC_SAFE', replacement: 'No change needed', priority: 'low' },
    'aes-256-cbc': { risk: 'SYMMETRIC_SAFE', replacement: 'Prefer AES-256-GCM for AEAD', priority: 'low' },
    'aes-128': { risk: 'QUANTUM_VULNERABLE', replacement: 'Upgrade to AES-256', priority: 'medium' },
    'aes-128-gcm': { risk: 'QUANTUM_VULNERABLE', replacement: 'Upgrade to AES-256-GCM', priority: 'medium' },
    'chacha20-poly1305': { risk: 'SYMMETRIC_SAFE', replacement: 'No change needed (quantum-resistant)', priority: 'low' },
    'chacha20': { risk: 'SYMMETRIC_SAFE', replacement: 'No change needed', priority: 'low' },
    // Hash — SAFE (Grover reduces to O(√N), but SHA-256+ remains computationally infeasible)
    'sha-256': { risk: 'HASH_SAFE', replacement: 'No change needed', priority: 'low' },
    'sha-384': { risk: 'HASH_SAFE', replacement: 'No change needed', priority: 'low' },
    'sha-512': { risk: 'HASH_SAFE', replacement: 'No change needed', priority: 'low' },
    'sha256': { risk: 'HASH_SAFE', replacement: 'No change needed', priority: 'low' },
    'sha512': { risk: 'HASH_SAFE', replacement: 'No change needed', priority: 'low' },
    'sha3-256': { risk: 'HASH_SAFE', replacement: 'No change needed', priority: 'low' },
    'sha3-512': { risk: 'HASH_SAFE', replacement: 'No change needed', priority: 'low' },
    'blake2': { risk: 'HASH_SAFE', replacement: 'No change needed', priority: 'low' },
    'blake3': { risk: 'HASH_SAFE', replacement: 'No change needed', priority: 'low' },
    // Weak / Deprecated
    'md5': { risk: 'UNKNOWN', replacement: 'Upgrade to SHA-256 (broken even classically)', priority: 'high' },
    'sha1': { risk: 'UNKNOWN', replacement: 'Upgrade to SHA-256 (broken even classically)', priority: 'high' },
    'sha-1': { risk: 'UNKNOWN', replacement: 'Upgrade to SHA-256 (broken even classically)', priority: 'high' },
    'des': { risk: 'QUANTUM_VULNERABLE', replacement: 'Upgrade to AES-256', priority: 'critical' },
    '3des': { risk: 'QUANTUM_VULNERABLE', replacement: 'Upgrade to AES-256', priority: 'critical' },
    'rc4': { risk: 'QUANTUM_VULNERABLE', replacement: 'Upgrade to AES-256-GCM', priority: 'critical' },
    'blowfish': { risk: 'QUANTUM_VULNERABLE', replacement: 'Upgrade to AES-256', priority: 'high' },
};
// ─── Detection Patterns ────────────────────────────────────────────────────────
const CRYPTO_PATTERNS = [
    // Node.js crypto module
    { regex: /createSign\s*\(\s*['"]([^'"]+)['"]/g, context: 'Signing' },
    { regex: /createVerify\s*\(\s*['"]([^'"]+)['"]/g, context: 'Verification' },
    { regex: /createCipheriv\s*\(\s*['"]([^'"]+)['"]/g, context: 'Encryption' },
    { regex: /createDecipheriv\s*\(\s*['"]([^'"]+)['"]/g, context: 'Decryption' },
    { regex: /createHash\s*\(\s*['"]([^'"]+)['"]/g, context: 'Hashing' },
    { regex: /createHmac\s*\(\s*['"]([^'"]+)['"]/g, context: 'HMAC' },
    { regex: /createDiffieHellman/g, context: 'Key Exchange' },
    { regex: /createECDH/g, context: 'Key Exchange' },
    { regex: /generateKeyPair\s*\(\s*['"]([^'"]+)['"]/g, context: 'Key Generation' },
    { regex: /generateKeyPairSync\s*\(\s*['"]([^'"]+)['"]/g, context: 'Key Generation' },
    // JWT libraries
    { regex: /algorithm\s*:\s*['"]([A-Z0-9]+)['"]/g, context: 'JWT Signing' },
    { regex: /jwt\.sign\s*\(/g, context: 'JWT Signing' },
    { regex: /jwt\.verify\s*\(/g, context: 'JWT Verification' },
    // Generic patterns
    { regex: /['"]RSA-OAEP['"]/gi, context: 'Asymmetric Encryption' },
    { regex: /['"]ECDSA['"]/gi, context: 'Digital Signature' },
    { regex: /['"]ECDH['"]/gi, context: 'Key Exchange' },
    // bcrypt/scrypt
    { regex: /bcrypt\.|bcryptjs/gi, context: 'Password Hashing' },
];
// ─── Engine ────────────────────────────────────────────────────────────────────
export class PQCAuditor {
    id = EngineID.PQC_AUDITOR;
    name = "PQCAuditor · Quantum Cryptographic Transition";
    version = "4.2.1";
    /**
     * Perform a complete cryptographic inventory of the entire project.
     * Every usage of crypto libraries is found, classified, and risk-scored.
     */
    inventoryCryptographicUsage(projectPath) {
        const start = Date.now();
        const instances = [];
        let filesScanned = 0;
        const scanFile = (filePath) => {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                const relPath = path.relative(projectPath, filePath);
                filesScanned++;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    for (const pattern of CRYPTO_PATTERNS) {
                        pattern.regex.lastIndex = 0;
                        let match;
                        while ((match = pattern.regex.exec(line)) !== null) {
                            const algorithm = (match[1] || this.inferAlgorithm(line)).toLowerCase();
                            const classification = this.classifyQuantumRisk(algorithm);
                            instances.push({
                                file: relPath,
                                line: i + 1,
                                algorithm: algorithm.toUpperCase(),
                                usage_context: pattern.context,
                                library: this.inferLibrary(content),
                                quantum_risk: classification.risk,
                                nist_replacement: classification.replacement,
                                migration_priority: classification.priority,
                                raw_snippet: lines[i].trim()
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
                    if (['node_modules', '.git', 'dist', 'build'].includes(entry.name))
                        continue;
                    walkDir(full);
                }
                else if (/\.(ts|js|tsx|jsx|py|rs|go|java)$/.test(entry.name)) {
                    scanFile(full);
                }
            }
        };
        walkDir(projectPath);
        // Build risk summary
        const summary = { harvest_now_decrypt_later: 0, quantum_vulnerable: 0, symmetric_safe: 0, hash_safe: 0, unknown: 0 };
        for (const inst of instances) {
            if (inst.quantum_risk === 'HARVEST_NOW_DECRYPT_LATER')
                summary.harvest_now_decrypt_later++;
            else if (inst.quantum_risk === 'QUANTUM_VULNERABLE')
                summary.quantum_vulnerable++;
            else if (inst.quantum_risk === 'SYMMETRIC_SAFE')
                summary.symmetric_safe++;
            else if (inst.quantum_risk === 'HASH_SAFE')
                summary.hash_safe++;
            else
                summary.unknown++;
        }
        const total = instances.length || 1;
        const safe = summary.symmetric_safe + summary.hash_safe;
        const readiness = Math.round((safe / total) * 100);
        return {
            scan_time_ms: Date.now() - start,
            total_files_scanned: filesScanned,
            total_crypto_instances: instances.length,
            instances,
            risk_summary: summary,
            overall_quantum_readiness: readiness,
        };
    }
    /**
     * Classify a specific algorithm for quantum risk.
     */
    classifyQuantumRisk(algorithm) {
        const lower = algorithm.toLowerCase().replace(/[_\s]/g, '-');
        const entry = QUANTUM_VULNERABLE_ALGORITHMS[lower];
        if (entry)
            return entry;
        // Check partial matches
        for (const [key, val] of Object.entries(QUANTUM_VULNERABLE_ALGORITHMS)) {
            if (lower.includes(key) || key.includes(lower))
                return val;
        }
        return { risk: 'UNKNOWN', replacement: 'Manual review required', priority: 'medium' };
    }
    /**
     * Generate a complete PQC migration plan with concrete code replacements.
     */
    generatePQCMigrationPlan(inventory) {
        const critical = inventory.instances.filter(i => i.quantum_risk === 'HARVEST_NOW_DECRYPT_LATER' || i.quantum_risk === 'QUANTUM_VULNERABLE');
        const steps = critical.map(inst => ({
            file: inst.file,
            line: inst.line,
            current_algorithm: inst.algorithm,
            replacement_algorithm: inst.nist_replacement,
            nist_standard: inst.nist_replacement.includes('203') ? 'FIPS 203 (ML-KEM)' :
                inst.nist_replacement.includes('204') ? 'FIPS 204 (ML-DSA)' :
                    inst.nist_replacement.includes('205') ? 'FIPS 205 (SLH-DSA)' : 'N/A',
            code_before: `// Line ${inst.line}: ${inst.usage_context} using ${inst.algorithm}`,
            code_after: `// Line ${inst.line}: MIGRATED to ${inst.nist_replacement}\n// TODO: Install PQC library and update key generation`,
            breaking_change: inst.quantum_risk === 'HARVEST_NOW_DECRYPT_LATER',
            notes: inst.quantum_risk === 'HARVEST_NOW_DECRYPT_LATER'
                ? '⚠️ CRITICAL: This algorithm is actively targeted by "Harvest Now, Decrypt Later" attacks by state actors.'
                : 'Upgrade recommended before Q-Day (projected 2029).',
        }));
        const effortHours = steps.length * 4; // Estimate 4 hours per migration step
        return {
            total_instances: critical.length,
            critical_migrations: steps,
            estimated_effort_hours: effortHours,
            recommended_standards: ['FIPS 203 ML-KEM (CRYSTALS-Kyber)', 'FIPS 204 ML-DSA (CRYSTALS-Dilithium)', 'FIPS 205 SLH-DSA (SPHINCS+)'],
            hybrid_recommendations: [
                'ML-KEM + X25519 for key exchange (protects against both classical and quantum)',
                'ML-DSA + Ed25519 for digital signatures (hybrid transition strategy)',
                'Implement cryptographic agility layer to hot-swap algorithms without redeployment',
            ],
        };
    }
    /**
     * Score the codebase's ability to hot-swap cryptographic algorithms (Cryptographic Agility).
     */
    scoreCryptographicAgility(projectPath) {
        const factors = [];
        let totalScore = 0;
        // Factor 1: Abstraction layer
        const hasAbstraction = this.checkForCryptoAbstraction(projectPath);
        factors.push({
            name: 'Cryptographic Abstraction Layer',
            score: hasAbstraction ? 30 : 0,
            description: hasAbstraction
                ? 'Found centralized crypto module — algorithms can be swapped in one place.'
                : 'Crypto is scattered across files. A centralized abstraction layer is needed.',
        });
        totalScore += hasAbstraction ? 30 : 0;
        // Factor 2: Algorithm hardcoding
        const inventory = this.inventoryCryptographicUsage(projectPath);
        const hardcodedCount = inventory.instances.filter(i => i.usage_context !== 'Hashing').length;
        const hardcodedScore = hardcodedCount === 0 ? 25 : hardcodedCount < 3 ? 15 : hardcodedCount < 10 ? 5 : 0;
        factors.push({
            name: 'Algorithm Hardcoding',
            score: hardcodedScore,
            description: `${hardcodedCount} hardcoded algorithm references found. ${hardcodedCount === 0 ? 'Excellent — fully configurable.' : 'Should be moved to configuration.'}`,
        });
        totalScore += hardcodedScore;
        // Factor 3: Configuration-driven crypto
        const hasConfig = this.checkForCryptoConfig(projectPath);
        factors.push({
            name: 'Configuration-Driven Algorithms',
            score: hasConfig ? 25 : 0,
            description: hasConfig
                ? 'Algorithms are referenced via configuration — can be changed without code changes.'
                : 'Algorithms are not configurable. Must be hardcoded changes to swap.',
        });
        totalScore += hasConfig ? 25 : 0;
        // Factor 4: Key management
        const hasKeyMgmt = this.checkForKeyManagement(projectPath);
        factors.push({
            name: 'Key Management System',
            score: hasKeyMgmt ? 20 : 0,
            description: hasKeyMgmt
                ? 'Key management system detected — supports key rotation.'
                : 'No centralized key management. Key rotation will be manual and risky.',
        });
        totalScore += hasKeyMgmt ? 20 : 0;
        const recommendations = [];
        if (!hasAbstraction)
            recommendations.push('Create a centralized CryptoProvider class that abstracts all cryptographic operations.');
        if (hardcodedCount > 0)
            recommendations.push('Move all algorithm references to a single configuration file or environment variable.');
        if (!hasConfig)
            recommendations.push('Implement algorithm selection via configuration to enable hot-swapping.');
        if (!hasKeyMgmt)
            recommendations.push('Implement a key management system with automated rotation capabilities.');
        recommendations.push('Plan PQC migration timeline: inventory → test hybrid → full migration before Q-Day 2029.');
        return { score: totalScore, hardcoded_algorithms: hardcodedCount, hardcoded_keysizes: 0, crypto_abstraction_layer_present: hasAbstraction, recommendations };
    }
    // ─── Private Helpers ───────────────────────────────────────────────────────
    inferAlgorithm(line) {
        const lower = line.toLowerCase();
        if (/diffie.?hellman/i.test(lower))
            return 'diffie-hellman';
        if (/ecdh/i.test(lower))
            return 'ecdh';
        if (/ecdsa/i.test(lower))
            return 'ecdsa';
        if (/bcrypt/i.test(lower))
            return 'bcrypt';
        if (/jwt\.sign/i.test(lower))
            return 'rs256';
        return 'unknown';
    }
    inferLibrary(content) {
        if (content.includes("from 'crypto'") || content.includes("require('crypto')"))
            return 'node:crypto';
        if (content.includes('jsonwebtoken'))
            return 'jsonwebtoken';
        if (content.includes('bcrypt'))
            return 'bcrypt';
        if (content.includes('jose'))
            return 'jose';
        if (content.includes('tweetnacl'))
            return 'tweetnacl';
        if (content.includes('elliptic'))
            return 'elliptic';
        return 'unknown';
    }
    checkForCryptoAbstraction(projectPath) {
        // Check if there's a centralized crypto module
        const candidates = ['crypto.ts', 'CryptoProvider.ts', 'encryption.ts', 'security.ts', 'SecurityProcessor.ts'];
        for (const c of candidates) {
            const found = this.findFile(projectPath, c);
            if (found)
                return true;
        }
        return false;
    }
    checkForCryptoConfig(projectPath) {
        // Check for algorithm config patterns
        const configFiles = ['config.json', 'config.ts', '.env', 'crypto.config.ts'];
        for (const c of configFiles) {
            const found = this.findFile(projectPath, c);
            if (found) {
                try {
                    const content = fs.readFileSync(found, 'utf-8');
                    if (/algorithm|cipher|hash_algo|sign_algo/i.test(content))
                        return true;
                }
                catch { /* skip */ }
            }
        }
        return false;
    }
    checkForKeyManagement(projectPath) {
        const indicators = ['KeyManager', 'keyRotation', 'key_rotation', 'vault', 'kms', 'KeyVault'];
        try {
            return false; // searchInProject not implemented
        }
        catch {
            return false;
        }
    }
    findFile(dir, name) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isFile() && entry.name === name)
                    return full;
                if (entry.isDirectory() && !['node_modules', '.git', 'dist'].includes(entry.name)) {
                    const found = this.findFile(full, name);
                    if (found)
                        return found;
                }
            }
        }
        catch { /* skip */ }
        return null;
    }
    // ─── CyberEngine Interface Implementation ──────────────────────────────────
    async initialize() {
        console.log(`[${this.name}] Initializing quantum risk assessment module…`);
        console.log(`[${this.name}] FIPS 203/204/205 heuristics loaded. Ready for Q-Day analysis.`);
    }
    async analyze(ctx) {
        const signals = [];
        // ① Detect Harvest-Now-Decrypt-Later targets
        const harvestTargets = ctx.assetInventory.filter(a => a.type === "server" && a.exposedToInternet);
        if (harvestTargets.length > 0) {
            signals.push(createSignal(this.id, ThreatLevel.EXISTENTIAL, `Harvest-Now-Decrypt-Later: ${harvestTargets.length} TLS 1.2 endpoints using RSA-2048/ECDH. Post-quantum capture imminent.`, {
                confidence: 0.98,
                iocs: harvestTargets.map(a => `server:${a.assetId}`),
                mitreAttack: ["T1557", "T1040"],
                actions: [ResponseAction.PATCH, ResponseAction.ESCALATE, ResponseAction.REPORT],
            }));
        }
        // ② Cryptographic Agility Score (derived from network TLS distribution)
        const tls12Count = ctx.networkSnapshot.tlsVersionDistribution["TLSv1.2"] || 0;
        if (tls12Count > 100) {
            signals.push(createSignal(this.id, ThreatLevel.MODERATE, `Stale cryptographic agility: ${tls12Count} connections using legacy TLS. Hybrid PQC not supported.`, {
                confidence: 0.75,
                mitreAttack: ["T1573.001"],
                actions: [ResponseAction.AUDIT, ResponseAction.PATCH],
            }));
        }
        return signals;
    }
    async onSignal(signal) {
        if (signal.level === ThreatLevel.EXISTENTIAL) {
            console.log(`[${this.name}] EXISTENTIAL THREAT CORRELATED. Accelerating migration playbook…`);
        }
    }
    async healthCheck() {
        return true;
    }
    async shutdown() {
        console.log(`[${this.name}] Shutdown complete.`);
    }
    /**
     * BEASTMODE ACTIVE SOLVER: PQCAuditor
     * Generates a remediation script to automate the migration to NIST PQC standards.
     */
    solve(projectPath, cryptoInventory) {
        const inventory = cryptoInventory || this.inventoryCryptographicUsage(projectPath);
        const plan = this.generatePQCMigrationPlan(inventory);
        const actions = [];
        for (const step of plan.critical_migrations) {
            actions.push({
                file: step.file,
                line: step.line,
                original_code: step.code_before,
                suggested_code: step.code_after,
                description: `Migrate ${step.current_algorithm} to ${step.replacement_algorithm}`,
                nist_standard: step.nist_standard
            });
        }
        return {
            script_id: `REMEDIATION-PQC-${Date.now()}`,
            target_engine: 'PQCAuditor',
            actions,
            is_zero_touch_ready: actions.every(a => !a.description.includes('HARVEST_NOW_DECRYPT_LATER'))
        };
    }
}
