export class NeuroBridge {
    neuralClarifier;
    constructor(neuralClarifier) {
        this.neuralClarifier = neuralClarifier;
    }
    /**
     * Classify the cognitive domain of the input.
     * Returns the domain and a confidence score.
     */
    async classifyDomain(input) {
        const lower = input.toLowerCase();
        const signatures = [
            ['physics', [
                    /\b(force|mass|velocity|acceleration|momentum|energy|gravity|quantum|photon|wavelength|frequency|electric|magnetic|relativity|entropy)\b/,
                    /\b(time\s*dilation|length\s*contraction|lorentz|escape\s*velocity|orbital\s*velocity|speed\s*of\s*light)\b/i,
                    /\b(gravitational|coulomb|de\s*broglie|blackbody|thermodynamic|kinematic|projectile|orbital)\b/i,
                    /\b(einstein|newton|planck|boltzmann|maxwell|kepler|bohr|heisenberg|schrodinger)\b/i,
                    /[FEGVPA]\s*=\s*[A-Za-z0-9\*\/\^\s]+/,
                    /\b(newton|joule|watt|volt|ampere|hertz|pascal|kelvin|tesla|farad)\b/i,
                    /E\s*=\s*m\s*c/i,
                ], 0.95],
            ['mathematics', [
                    /\b(solve|derivative|integral|differentiate|calculate|compute|evaluate|simplify|factor|matrix|vector|eigenvalue|limit|expand|modulo)\b/,
                    /(?:[\d\.]+|[a-zA-Z_]+)\s*[\+\-\*\/\^]\s*(?:[\d\.]+|[a-zA-Z_]+)/,
                    /\b(sin|cos|tan|ln|log|sqrt|abs|floor|ceil)\s*\(/,
                    /\b(algebra|calculus|trigonometry|polynomial|quadratic|linear|exponential)\b/i,
                ], 0.95],
            ['chemistry', [
                    /\b(atom|molecule|bond|reaction|element|compound|mole|pH|oxidation|reduction|entropy|enthalpy)\b/,
                    /[A-Z][a-z]?\d*(\+[A-Z][a-z]?\d*)+\s*→/,
                ], 0.90],
            ['logic', [
                    /\b(if|then|else|and|or|not|implies|iff|therefore|prove|theorem|axiom|contradiction|forall|exists)\b/i,
                    /∧|∨|¬|→|↔|∀|∃/,
                ], 0.88],
            ['system', [
                    /\b(file|directory|process|thread|memory|cpu|disk|network|kernel|socket|daemon|port|pid)\b/i,
                ], 0.85],
            ['network', [
                    /\b(ip|tcp|udp|http|https|dns|packet|firewall|router|ssl|tls|proxy|latency|bandwidth)\b/i,
                    /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
                ], 0.85],
            // ── Self-Absorbing Domain Signatures ──
            ['cybersecurity', [
                    /\b(vulnerability|exploit|CVE|malware|phishing|encryption|XSS|SQL\s*injection|brute\s*force|zero.?day)\b/i,
                    /\b(pentesting|penetration|OWASP|SIEM|IDS|IPS|ransomware|rootkit|backdoor|DDoS)\b/i,
                    /\b(cyber|hacking|hacker|security\s*breach|payload|shellcode|privilege\s*escalation)\b/i,
                ], 0.90],
            ['code', [
                    /\b(function|class|variable|array|loop|algorithm|compile|debug|refactor|API|import|export)\b/i,
                    /\b(python|javascript|typescript|rust|golang|java|cpp|react|node|docker|kubernetes)\b/i,
                    /\b(write\s+(?:a|the)\s+(?:code|function|script|program))\b/i,
                ], 0.88],
            ['reasoning', [
                    /\b(why|because|therefore|hence|conclude|deduce|infer|reason|argument|premise|hypothesis)\b/i,
                    /\b(think\s+through|step\s+by\s+step|explain\s+your\s+reasoning|chain\s+of\s+thought)\b/i,
                ], 0.82],
            ['science', [
                    /\b(biology|evolution|genetics|cell|organism|species|ecosystem|climate|geology|astronomy)\b/i,
                    /\b(experiment|hypothesis|theory|observation|evidence|scientific\s+method)\b/i,
                ], 0.85],
            ['creative', [
                    /\b(write\s+a\s+(?:poem|story|song|haiku|essay|narrative|dialogue))\b/i,
                    /\b(creative|imagine|fictional|metaphor|poetic|artistic)\b/i,
                ], 0.80],
        ];
        for (const [domain, patterns, confidence] of signatures) {
            const matched = patterns.filter(p => p.test(lower)).length;
            if (matched >= 1) {
                const scaled_confidence = Math.min(confidence, confidence * (0.7 + matched * 0.15));
                return { domain, confidence: scaled_confidence };
            }
        }
        // ── NEURAL CLARIFIER (Linguistic Intent Guard) ──
        if (this.neuralClarifier) {
            try {
                const neural_domain = await this.neuralClarifier(input);
                if (neural_domain !== 'unknown') {
                    return { domain: neural_domain, confidence: 0.88 };
                }
            }
            catch (e) {
                // Silently fallback to basic language
            }
        }
        return { domain: 'language', confidence: 0.65 };
    }
    /**
     * Extract a computable expression or formula from natural language.
     */
    extractFormula(input) {
        // Derivative request (MUST check BEFORE direct expression)
        const diffMatch = input.match(/d(?:erivative)?\s+(?:of\s+)?["']?([^'"]+?)["']?\s+with\s+respect\s+to\s+(\w+)/i) ||
            input.match(/differentiate\s+["']?([^'"]+?)["']?\s+(?:w\.r\.t\.|by|with respect to)\s+(\w+)/i);
        if (diffMatch) {
            return { formula: diffMatch[1].trim(), variable: diffMatch[2], operation: 'differentiate' };
        }
        // Direct expression: just the formula provided (after semantic checks)
        const directExpr = /^([A-Za-z0-9\s\+\-\*\/\^\(\)\.\%\_\,]+)$/.test(input.trim());
        if (directExpr && /[\+\-\*\/\^]/.test(input)) {
            return { formula: input.trim(), operation: 'evaluate' };
        }
        // Solve request
        const solveMatch = input.match(/solve\s+["']?([^'"]+?)["']?\s+for\s+(\w+)/i);
        if (solveMatch) {
            return { formula: solveMatch[1].trim(), variable: solveMatch[2], operation: 'solve' };
        }
        // Physics formula extraction (E=mc^2 style)
        const physicsAssign = input.match(/([A-Z])\s*=\s*([A-Za-z0-9\s\+\-\*\/\^\(\)\.\_\,\^]+)/);
        if (physicsAssign) {
            return { formula: physicsAssign[2].trim(), operation: 'physics_prove' };
        }
        // Calculate request
        const calcMatch = input.match(/(?:calculate|compute|evaluate|what is|find)\s+["']?([A-Za-z0-9\s\+\-\*\/\^\(\)\.\_\,]+)["']?/i);
        if (calcMatch) {
            return { formula: calcMatch[1].trim(), operation: 'evaluate' };
        }
        return { formula: input.trim(), operation: 'unknown' };
    }
    /**
     * Full intent parsing — the complete bridge decision.
     * Returns a routing instruction to the ASI's cognition core.
     */
    async parseIntent(input) {
        const { domain, confidence } = await this.classifyDomain(input);
        const { formula, variable, operation } = this.extractFormula(input);
        const requiresProof = domain === 'mathematics' || domain === 'physics' || domain === 'chemistry' || domain === 'logic';
        return {
            domain,
            operation: operation,
            parameters: {
                formula,
                variable,
                original_input: input,
            },
            requires_proof: requiresProof,
            security_level: domain === 'system' || domain === 'network' ? 'kernel' : 'compute',
        };
    }
    /**
     * The top-level routing decision:
     * Where should this input be sent for processing?
     */
    async route(input) {
        const { domain, confidence } = await this.classifyDomain(input);
        if (domain === 'mathematics' || domain === 'physics' || domain === 'chemistry') {
            return {
                route: 'symbolic_engine',
                confidence,
                reasoning: `Domain "${domain}" requires deterministic proof. Routing to SymbolicEngine.`,
                fallback: {
                    route: 'language_model',
                    confidence: 0.5,
                    reasoning: 'Fallback to LLM if symbolic engine cannot parse the expression.'
                }
            };
        }
        if (domain === 'system' || domain === 'network') {
            return {
                route: 'system_kernel',
                confidence,
                reasoning: `Domain "${domain}" requires OS-level access. Routing to KernelInterface.`,
            };
        }
        if (domain === 'memory') {
            return {
                route: 'memory_core',
                confidence,
                reasoning: 'Memory access request routed to MemoryCore.',
            };
        }
        return {
            route: 'language_model',
            confidence,
            reasoning: `Domain "${domain}" is language-based. Routing to LLM interface.`
        };
    }
}
