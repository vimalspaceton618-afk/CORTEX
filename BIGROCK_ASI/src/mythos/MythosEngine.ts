import { ThreatNode, MYTHOS_SEED_ONTOLOGY, ThreatDomain } from './ThreatOntology.js';

export interface MythGap {
    threat: ThreatNode;
    confidence: number;
    reasoning: string;
}

/**
 * BIGROCK_v1 — Mythos Threat Engine
 * ─────────────────────────────────────────────────────────────────────────
 * The ontological graph engine that maps architectural context to known TTPs.
 */
export class MythosEngine {
    private ontology: Map<string, ThreatNode> = new Map();

    constructor() {
        this.initializeOntology();
    }

    private initializeOntology() {
        for (const node of MYTHOS_SEED_ONTOLOGY) {
            this.ontology.set(node.id, node);
        }
    }

    /**
     * Queries the ontology for specific threat domains.
     */
    public queryByDomain(domain: ThreatDomain): ThreatNode[] {
        return Array.from(this.ontology.values()).filter(node => node.domain === domain);
    }

    /**
     * Given an architectural description (e.g., "A Node.js API connected to an S3 bucket"),
     * the engine finds "Myth Gaps" — potential vulnerabilities that apply to this architecture.
     * 
     * In a full implementation, this uses Bigrock's LLMDevourer or SLM to perform semantic mapping.
     * For this MVP, we use heuristic keyword matching against the ontology.
     */
    public analyzeArchitecture(architectureContext: string): MythGap[] {
        const lowerContext = architectureContext.toLowerCase();
        const gaps: MythGap[] = [];

        // 1. Foundations / Network
        if (lowerContext.includes('tcp') || lowerContext.includes('network') || lowerContext.includes('lan')) {
            gaps.push(...this.generateGaps('Foundations', 0.80, 'Architecture mentions raw networking layers, exposing foundational protocol risks.'));
        }

        // 2. SOC
        if (lowerContext.includes('log') || lowerContext.includes('siem') || lowerContext.includes('splunk')) {
            gaps.push(...this.generateGaps('SOC', 0.85, 'Architecture involves centralized logging, susceptible to log evasion and tampering.'));
        }

        // 3. Threat Intel
        if (lowerContext.includes('github') || lowerContext.includes('public repo') || lowerContext.includes('blog')) {
            gaps.push(...this.generateGaps('Threat Intelligence', 0.90, 'Public exposure of assets highly likely to be indexed by OSINT tools.'));
        }

        // 4. Vulnerability Management
        if (lowerContext.includes('dependency') || lowerContext.includes('npm') || lowerContext.includes('package')) {
            gaps.push(...this.generateGaps('Vulnerability Management', 0.85, 'Heavy reliance on third-party dependencies creates supply-chain risk.'));
        }

        // 5. Web & API
        if (lowerContext.includes('api') || lowerContext.includes('endpoint') || lowerContext.includes('web')) {
            gaps.push(...this.generateGaps('Web & API Security', 0.85, 'Architecture exposes web endpoints, vulnerable to BOLA and Injection.'));
        }

        // 6. Penetration Testing
        if (lowerContext.includes('ssh') || lowerContext.includes('bastion')) {
            gaps.push(...this.generateGaps('Penetration Testing', 0.75, 'Use of SSH keys presents lateral movement pivoting risks.'));
        }

        // 7. Cloud Security
        if (lowerContext.includes('s3') || lowerContext.includes('cloud') || lowerContext.includes('docker') || lowerContext.includes('aws')) {
            gaps.push(...this.generateGaps('Cloud Security', 0.90, 'Cloud deployment detected. IAM and container misconfigurations are high risk.'));
        }

        // 8. DevSecOps
        if (lowerContext.includes('ci/cd') || lowerContext.includes('pipeline') || lowerContext.includes('github actions')) {
            gaps.push(...this.generateGaps('DevSecOps', 0.85, 'Automated pipelines present a high risk of hardcoded secret leakage.'));
        }

        // 9. Digital Forensics
        if (lowerContext.includes('incident') || lowerContext.includes('forensics')) {
            gaps.push(...this.generateGaps('Digital Forensics', 0.70, 'Forensic timelines can be manipulated via timestomping if not secured.'));
        }

        // 10. GRC
        if (lowerContext.includes('credit card') || lowerContext.includes('pci') || lowerContext.includes('payment')) {
            gaps.push(...this.generateGaps('GRC', 0.95, 'Payment processing detected. Strict PCI-DSS data storage controls required.'));
        }

        // 11. Security Tools
        if (lowerContext.includes('nmap') || lowerContext.includes('ids') || lowerContext.includes('firewall')) {
            gaps.push(...this.generateGaps('Security Tools', 0.80, 'Perimeter scanning and defense detected. Susceptible to evasion techniques.'));
        }

        // 12. AI Security
        if (lowerContext.includes('llm') || lowerContext.includes('prompt') || lowerContext.includes('ai')) {
            gaps.push(...this.generateGaps('AI Security', 0.99, 'LLM integration detected. Extremely high risk of prompt injection and data leakage.'));
        }

        return gaps;
    }

    /** Helper to generate gaps for a specific domain */
    private generateGaps(domain: ThreatDomain, confidence: number, reasoning: string): MythGap[] {
        const threats = this.queryByDomain(domain);
        return threats.map(threat => ({ threat, confidence, reasoning }));
    }
}
