/**
 * BIGROCK_v1 — Mythos Threat Ontology (FULL 12-LAYER STACK)
 * ─────────────────────────────────────────────────────────────────────────
 * This file defines the structured taxonomy of the full cybersecurity stack.
 * It serves as the foundation for the Mythos Graph Engine.
 */

export type ThreatDomain = 
    | 'Foundations'
    | 'SOC'
    | 'Threat Intelligence'
    | 'Vulnerability Management'
    | 'Web & API Security'
    | 'Penetration Testing'
    | 'Cloud Security'
    | 'DevSecOps'
    | 'Digital Forensics'
    | 'GRC'
    | 'Security Tools'
    | 'AI Security';

export interface ThreatNode {
    id: string;
    domain: ThreatDomain;
    category: string;
    name: string;
    description: string;
    mitigations: string[];
}

export const MYTHOS_SEED_ONTOLOGY: ThreatNode[] = [
    // ─── 1. Foundations ───────────────────────────────────────────────────
    {
        id: 'TTP-FND-001', domain: 'Foundations', category: 'Networking',
        name: 'TCP/IP Session Hijacking',
        description: 'Attacker takes over a valid TCP session between two machines by predicting sequence numbers.',
        mitigations: ['Enforce IPsec/TLS for all internal traffic', 'Use strong randomized TCP sequence numbers']
    },
    {
        id: 'TTP-FND-002', domain: 'Foundations', category: 'OSI Model',
        name: 'Layer 2 ARP Spoofing',
        description: 'Attacker sends falsified ARP messages over a LAN to link their MAC address with a legitimate IP.',
        mitigations: ['Implement Dynamic ARP Inspection (DAI)', 'Use static ARP tables for critical infrastructure']
    },

    // ─── 2. Security Operations (SOC) ─────────────────────────────────────
    {
        id: 'TTP-SOC-001', domain: 'SOC', category: 'Log Analysis',
        name: 'SIEM Log Evasion / Tampering',
        description: 'Attacker clears event logs or alters log forwarding rules to hide tracks.',
        mitigations: ['Forward logs immediately to an immutable WORM drive', 'Alert on "Event Log Cleared" (Event ID 1102)']
    },

    // ─── 3. Threat Intelligence ───────────────────────────────────────────
    {
        id: 'TTP-INT-001', domain: 'Threat Intelligence', category: 'OSINT',
        name: 'Corporate OSINT Exposure',
        description: 'Sensitive architectural details or employee credentials are inadvertently exposed on public forums or GitHub.',
        mitigations: ['Deploy automated secret scanning on public repos', 'Enforce strict OPSEC policies for engineering blogs']
    },

    // ─── 4. Vulnerability Management ──────────────────────────────────────
    {
        id: 'TTP-VUL-001', domain: 'Vulnerability Management', category: 'CVE Analysis',
        name: 'N-Day Supply Chain Exploitation',
        description: 'Attacker exploits known, unpatched vulnerabilities in deep transitive dependencies.',
        mitigations: ['Automated SBOM generation', 'Enforce strict version pinning and automated SCA tooling']
    },

    // ─── 5. Web & API Security ────────────────────────────────────────────
    {
        id: 'TTP-WEB-001', domain: 'Web & API Security', category: 'Authentication',
        name: 'Broken Object Level Authorization (BOLA)',
        description: 'Attackers manipulate IDs in API requests to access data belonging to other users.',
        mitigations: ['Implement strict RBAC/ABAC', 'Validate ownership on every request']
    },
    {
        id: 'TTP-WEB-002', domain: 'Web & API Security', category: 'Input Validation',
        name: 'SQL Injection (SQLi)',
        description: 'Untrusted data is sent to an interpreter as part of a command or query.',
        mitigations: ['Use parameterized queries', 'Employ strict allow-listing']
    },

    // ─── 6. Penetration Testing ───────────────────────────────────────────
    {
        id: 'TTP-PEN-001', domain: 'Penetration Testing', category: 'Post-Exploitation',
        name: 'Lateral Movement via SSH Keys',
        description: 'Attacker extracts private SSH keys from a compromised host to pivot to adjacent servers.',
        mitigations: ['Use SSH certificates instead of static keys', 'Store keys in hardware enclaves or vaults']
    },

    // ─── 7. Cloud Security ────────────────────────────────────────────────
    {
        id: 'TTP-CLD-001', domain: 'Cloud Security', category: 'IAM',
        name: 'Over-Privileged IAM Roles',
        description: 'Cloud identities are granted more permissions than necessary.',
        mitigations: ['Implement Principle of Least Privilege (PoLP)', 'Use IAM Access Analyzer']
    },
    {
        id: 'TTP-CLD-002', domain: 'Cloud Security', category: 'Container Security',
        name: 'Privileged Container Escape',
        description: 'Exploiting containers running with the --privileged flag.',
        mitigations: ['Never run containers as --privileged', 'Use AppArmor/Seccomp profiles']
    },

    // ─── 8. DevSecOps ─────────────────────────────────────────────────────
    {
        id: 'TTP-DSO-001', domain: 'DevSecOps', category: 'Secrets Management',
        name: 'Hardcoded Secrets in CI/CD',
        description: 'API keys and database credentials are hardcoded in source code or CI pipelines.',
        mitigations: ['Inject secrets via secure vaults at runtime', 'Use pre-commit hooks to block secret commits']
    },

    // ─── 9. Digital Forensics ─────────────────────────────────────────────
    {
        id: 'TTP-FOR-001', domain: 'Digital Forensics', category: 'Evidence Handling',
        name: 'Anti-Forensics: Timestomping',
        description: 'Modifying file creation/modification timestamps to bypass forensic timelines.',
        mitigations: ['Correlate filesystem timestamps with journal logs (e.g., NTFS $LogFile)', 'Capture volatile memory (RAM) first']
    },

    // ─── 10. Governance, Risk & Compliance (GRC) ──────────────────────────
    {
        id: 'TTP-GRC-001', domain: 'GRC', category: 'PCI-DSS',
        name: 'Cleartext Cardholder Data Storage',
        description: 'Storing primary account numbers (PAN) without encryption, violating PCI-DSS Requirement 3.',
        mitigations: ['Implement AES-256 encryption at rest', 'Use robust tokenization/vaulting solutions']
    },

    // ─── 11. Security Tools ───────────────────────────────────────────────
    {
        id: 'TTP-TLS-001', domain: 'Security Tools', category: 'Nmap',
        name: 'Decoy Scanning Evasion',
        description: 'Using Nmap decoy flags (-D) to mask the true origin IP of a port scan.',
        mitigations: ['Deploy TTL and IP ID tracking algorithms in IDS', 'Implement rate-limiting and SYN flood protection']
    },

    // ─── 12. AI Security ──────────────────────────────────────────────────
    {
        id: 'TTP-AIS-001', domain: 'AI Security', category: 'Prompt Injection',
        name: 'Direct Prompt Injection (Jailbreaking)',
        description: 'Crafting inputs to bypass safety filters and force an LLM to execute malicious instructions.',
        mitigations: ['Use a robust neuro-symbolic Security Processor', 'Implement strict input-output sandboxing']
    },
    {
        id: 'TTP-AIS-002', domain: 'AI Security', category: 'Data Leakage',
        name: 'Model Inversion / Memorization Extraction',
        description: 'Extracting sensitive training data (PII, credentials) by repeatedly prompting an LLM.',
        mitigations: ['Scrub PII from training datasets', 'Deploy output egress filters to catch sensitive strings']
    }
];
