/**
 * BIGROCK_v2 — CognitiveRouter (Intelligent Multi-Model Routing)
 * ─────────────────────────────────────────────────────────────────────────
 * Goes beyond "pick one champion". Routes queries to the OPTIMAL combination
 * of absorbed models based on query complexity, domain, and available models.
 *
 * FIVE ROUTING STRATEGIES:
 *   SINGLE_CHAMPION  — One model, highest domain score. Fastest (<200ms).
 *   DUAL_BLEND       — Top-2 models fused. Used for ambiguous domains.
 *   CONSENSUS_PANEL  — 3+ models vote. Max confidence for critical queries.
 *   SPECIALIST_CHAIN — Sequential: model A reasons → model B refines.
 *   ADAPTIVE         — Auto-selects strategy based on query complexity score.
 *
 * QUERY COMPLEXITY CLASSIFIER:
 *   Scores query on 8 dimensions (length, multi-domain, logical operators,
 *   uncertainty markers, code presence, math symbols, depth keywords, negation).
 *   Produces a 0–100 complexity score that drives strategy selection.
 *
 * DOMAIN DETECTION:
 *   Maps keywords → domains using a weighted trie-style lookup.
 *   Handles MULTI-DOMAIN queries (e.g., "secure cryptography code" →
 *   cybersecurity + code + mathematics).
 */
// ─── Domain Keyword Maps ────────────────────────────────────────────────────────
const DOMAIN_KEYWORDS = {
    reasoning: [
        'reason', 'conclude', 'therefore', 'infer', 'deduce', 'argument',
        'premise', 'hypothesis', 'evidence', 'proof', 'because', 'thus',
        'implies', 'fallacy', 'syllogism', 'analogy', 'compare', 'contrast',
        'evaluate', 'assess', 'critique', 'judge', 'determine',
    ],
    mathematics: [
        'calculate', 'compute', 'equation', 'formula', 'derivative', 'integral',
        'limit', 'matrix', 'vector', 'probability', 'statistics', 'algebra',
        'geometry', 'calculus', 'differential', 'solve', 'simplify', 'factor',
        'polynomial', 'function', 'graph', 'eigenvalue', 'fourier', 'laplace',
        'sin', 'cos', 'tan', 'log', 'ln', 'sqrt', 'sum', 'product',
    ],
    code: [
        'code', 'program', 'function', 'algorithm', 'implement', 'debug',
        'class', 'object', 'method', 'variable', 'loop', 'array', 'string',
        'python', 'javascript', 'typescript', 'java', 'rust', 'go', 'c++',
        'api', 'library', 'framework', 'database', 'sql', 'query', 'async',
        'thread', 'recursion', 'complexity', 'runtime', 'compile', 'deploy',
        'git', 'docker', 'kubernetes', 'test', 'lint', 'refactor',
    ],
    cybersecurity: [
        'security', 'vulnerability', 'exploit', 'attack', 'threat', 'risk',
        'penetration', 'malware', 'ransomware', 'phishing', 'injection',
        'xss', 'csrf', 'sql injection', 'buffer overflow', 'zero-day',
        'encryption', 'decryption', 'hash', 'cipher', 'certificate', 'tls',
        'firewall', 'intrusion', 'detection', 'forensic', 'audit', 'compliance',
        'authentication', 'authorization', 'privilege', 'escalation', 'payload',
    ],
    logic: [
        'logic', 'boolean', 'true', 'false', 'and', 'or', 'not', 'implies',
        'iff', 'xor', 'nor', 'nand', 'tautology', 'contradiction', 'valid',
        'sound', 'propositional', 'predicate', 'quantifier', 'forall', 'exists',
        'truth table', 'modus ponens', 'modus tollens', 'contrapositive',
    ],
    science: [
        'physics', 'chemistry', 'biology', 'quantum', 'relativity', 'energy',
        'force', 'mass', 'velocity', 'acceleration', 'momentum', 'entropy',
        'thermodynamics', 'electron', 'proton', 'neutron', 'atom', 'molecule',
        'dna', 'protein', 'cell', 'evolution', 'gravity', 'electromagnetic',
        'photon', 'wavelength', 'frequency', 'temperature', 'pressure',
    ],
    language: [
        'summarize', 'explain', 'describe', 'write', 'translate', 'paraphrase',
        'grammar', 'syntax', 'semantics', 'vocabulary', 'essay', 'paragraph',
        'sentence', 'word', 'meaning', 'definition', 'synonym', 'antonym',
        'metaphor', 'simile', 'rhetoric', 'narrative', 'dialogue', 'prose',
    ],
    creative: [
        'poem', 'story', 'creative', 'imagine', 'design', 'invent', 'brainstorm',
        'idea', 'concept', 'fiction', 'fantasy', 'metaphor', 'art', 'music',
        'generate', 'create', 'compose', 'craft', 'build', 'dream', 'novel',
        'character', 'plot', 'theme', 'setting', 'narrative', 'rhyme',
    ],
    system: [
        'system', 'process', 'memory', 'cpu', 'disk', 'network', 'port',
        'service', 'daemon', 'kernel', 'os', 'linux', 'windows', 'shell',
        'command', 'terminal', 'script', 'performance', 'monitor', 'log',
        'status', 'uptime', 'resource', 'thread', 'socket', 'file system',
    ],
    unknown: [],
};
// High-confidence requirement markers
const HIGH_CONFIDENCE_MARKERS = [
    'exactly', 'precisely', 'accurate', 'correct', 'certain', 'definitive',
    'must', 'critical', 'important', 'security', 'production', 'financial',
    'medical', 'legal', 'prove', 'verify', 'validate', 'guarantee',
];
// Depth indicators (require more thorough reasoning)
const DEPTH_KEYWORDS = [
    'explain', 'analyze', 'compare', 'contrast', 'evaluate', 'design',
    'architect', 'optimize', 'tradeoff', 'difference between', 'pros and cons',
    'how does', 'why does', 'what happens', 'detailed', 'comprehensive', 'thorough',
];
// ─── CognitiveRouter ────────────────────────────────────────────────────────────
export class CognitiveRouter {
    // ═══════════════════════════════════════════════════════════════════════════
    //  QUERY ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Analyse a query and return a full QueryAnalysis including recommended strategy.
     */
    analyseQuery(query) {
        const lower = query.toLowerCase();
        const words = lower.split(/\s+/);
        // ── Domain Detection ──────────────────────────────────────────────────
        const domain_hits = new Map();
        for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
            let hits = 0;
            for (const kw of keywords) {
                if (lower.includes(kw))
                    hits++;
            }
            if (hits > 0)
                domain_hits.set(domain, hits);
        }
        // Sort domains by hit count
        const sorted_domains = [...domain_hits.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([d]) => d);
        const primary_domain = sorted_domains.length > 0 ? sorted_domains[0] : 'unknown';
        const all_domains = sorted_domains.length > 0 ? sorted_domains : ['unknown'];
        const is_multi_domain = all_domains.length >= 2;
        // ── Complexity Scoring ────────────────────────────────────────────────
        const breakdown = this.computeComplexity(lower, words, all_domains);
        const complexity_score = Object.values(breakdown).reduce((s, v) => s + v, 0);
        // ── High-confidence detection ─────────────────────────────────────────
        const requires_high_confidence = HIGH_CONFIDENCE_MARKERS.some(m => lower.includes(m)) ||
            primary_domain === 'cybersecurity' ||
            primary_domain === 'mathematics';
        // ── Strategy Selection ────────────────────────────────────────────────
        const { strategy, reason } = this.selectStrategy(complexity_score, is_multi_domain, requires_high_confidence, all_domains);
        return {
            primary_domain,
            all_domains,
            complexity_score: parseFloat(complexity_score.toFixed(1)),
            recommended_strategy: strategy,
            strategy_reason: reason,
            is_multi_domain,
            requires_high_confidence,
            complexity_breakdown: breakdown,
        };
    }
    computeComplexity(lower, words, domains) {
        // Length score (0–15): penalise very short queries, reward substantive ones
        const length_score = Math.min(15, (lower.length / 50) * 5);
        // Multi-domain score (0–20)
        const multi_domain_score = Math.min(20, (domains.length - 1) * 7);
        // Logical operators (0–15)
        const logical_ops = ['and ', 'or ', 'not ', 'implies', 'iff', 'if ', 'then ', 'else ', 'unless'];
        const logical_ops_score = Math.min(15, logical_ops.filter(op => lower.includes(op)).length * 3);
        // Uncertainty markers (0–10)
        const uncertainty_words = ['might', 'could', 'would', 'perhaps', 'maybe', 'likely', 'possibly'];
        const uncertainty_score = Math.min(10, uncertainty_words.filter(w => words.includes(w)).length * 3);
        // Code presence (0–15)
        const code_markers = ['```', '()', '=>', '==', '!==', '===', 'function', 'class ', 'def ', 'import ', 'return'];
        const code_presence_score = Math.min(15, code_markers.filter(m => lower.includes(m)).length * 4);
        // Math symbols (0–10)
        const math_markers = ['=', '+', '-', '×', '÷', '^', '∫', '∑', 'π', 'σ', 'dx', 'dy'];
        const math_symbols_score = Math.min(10, math_markers.filter(m => lower.includes(m)).length * 2);
        // Depth keywords (0–10)
        const depth_keywords_score = Math.min(10, DEPTH_KEYWORDS.filter(kw => lower.includes(kw)).length * 3);
        // Negation (0–5)
        const negation_words = ['not', 'never', 'cannot', "can't", "doesn't", 'no ', 'none', 'without'];
        const negation_score = Math.min(5, negation_words.filter(w => lower.includes(w)).length * 1.5);
        return {
            length_score: parseFloat(length_score.toFixed(1)),
            multi_domain_score: parseFloat(multi_domain_score.toFixed(1)),
            logical_ops_score: parseFloat(logical_ops_score.toFixed(1)),
            uncertainty_score: parseFloat(uncertainty_score.toFixed(1)),
            code_presence_score: parseFloat(code_presence_score.toFixed(1)),
            math_symbols_score: parseFloat(math_symbols_score.toFixed(1)),
            depth_keywords_score: parseFloat(depth_keywords_score.toFixed(1)),
            negation_score: parseFloat(negation_score.toFixed(1)),
        };
    }
    selectStrategy(complexity, is_multi_domain, requires_high_confidence, domains) {
        // Very simple queries → single champion (speed)
        if (complexity <= 15 && !is_multi_domain && !requires_high_confidence) {
            return {
                strategy: 'single_champion',
                reason: `Low complexity (${complexity.toFixed(0)}/100), single domain — fastest path`,
            };
        }
        // Security/math proofs with high confidence needed → consensus
        if (requires_high_confidence && complexity >= 40) {
            return {
                strategy: 'consensus_panel',
                reason: `High-stakes domain (${domains[0]}) + complexity ${complexity.toFixed(0)}/100 — consensus for max accuracy`,
            };
        }
        // Multi-domain moderate complexity → dual blend
        if (is_multi_domain && complexity >= 20 && complexity < 60) {
            return {
                strategy: 'dual_blend',
                reason: `Multi-domain (${domains.slice(0, 2).join(' + ')}) — dual blend for cross-domain coverage`,
            };
        }
        // Multi-step complex tasks → specialist chain
        if (complexity >= 60 && domains.includes('code')) {
            return {
                strategy: 'specialist_chain',
                reason: `Complex coding task (${complexity.toFixed(0)}/100) — chain: reasoner → coder`,
            };
        }
        // High complexity, multi-domain → consensus
        if (complexity >= 50 && is_multi_domain) {
            return {
                strategy: 'consensus_panel',
                reason: `High complexity multi-domain (${complexity.toFixed(0)}/100) — consensus panel`,
            };
        }
        // Moderate complexity → adaptive
        if (complexity >= 25) {
            return {
                strategy: 'dual_blend',
                reason: `Moderate complexity (${complexity.toFixed(0)}/100) — dual blend`,
            };
        }
        return {
            strategy: 'single_champion',
            reason: `Default — single champion for ${domains[0]}`,
        };
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  ROUTING DECISION
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Make a concrete routing decision given a query and available model entries.
     * Returns which models to use and in what configuration.
     */
    route(query, available_models, override_strategy) {
        const analysis = this.analyseQuery(query);
        const strategy = override_strategy ?? analysis.recommended_strategy;
        const trace = [];
        trace.push(`[Router]: Query domain → ${analysis.primary_domain.toUpperCase()}`);
        trace.push(`[Router]: Complexity score → ${analysis.complexity_score}/100`);
        trace.push(`[Router]: Strategy → ${strategy.toUpperCase()} (${analysis.strategy_reason})`);
        if (available_models.length === 0) {
            throw new Error('[CognitiveRouter]: No absorbed models available for routing.');
        }
        // Rank models for the primary domain
        const domain = analysis.primary_domain;
        const ranked = this.rankModelsForDomain(available_models, domain);
        trace.push(`[Router]: Ranked ${ranked.length} model(s) for domain "${domain}"`);
        for (const m of ranked.slice(0, 3)) {
            const score = m.profile.domain_scores.find(d => d.domain === domain)?.score ?? 0;
            trace.push(`  → ${m.filename} (score: ${score.toFixed(3)}, tier: ${m.tier})`);
        }
        let primary_model = ranked[0];
        let secondary_models = [];
        let routing_confidence = 0;
        switch (strategy) {
            case 'single_champion': {
                const score = primary_model.profile.domain_scores.find(d => d.domain === domain)?.score ?? 0;
                routing_confidence = score;
                trace.push(`[Router]: Single champion → ${primary_model.filename}`);
                break;
            }
            case 'dual_blend': {
                secondary_models = ranked.slice(1, 2);
                // For multi-domain, find the best model for the secondary domain
                if (analysis.is_multi_domain && analysis.all_domains[1]) {
                    const secondary_domain = analysis.all_domains[1];
                    const secondary_ranked = this.rankModelsForDomain(available_models, secondary_domain);
                    // Use the secondary domain champion if it's different from primary
                    if (secondary_ranked[0]?.filename !== primary_model.filename) {
                        secondary_models = [secondary_ranked[0]];
                    }
                }
                const score1 = primary_model.profile.domain_scores.find(d => d.domain === domain)?.score ?? 0;
                const score2 = secondary_models[0]?.profile.domain_scores.find(d => d.domain === domain)?.score ?? 0;
                routing_confidence = (score1 * 0.7 + score2 * 0.3);
                trace.push(`[Router]: Dual blend → ${primary_model.filename} + ${secondary_models[0]?.filename ?? 'none'}`);
                break;
            }
            case 'consensus_panel': {
                secondary_models = ranked.slice(1, 3);
                const scores = [primary_model, ...secondary_models].map(m => m.profile.domain_scores.find(d => d.domain === domain)?.score ?? 0);
                routing_confidence = scores.reduce((s, v) => s + v, 0) / scores.length;
                trace.push(`[Router]: Consensus panel → ${[primary_model, ...secondary_models].map(m => m.filename).join(' | ')}`);
                break;
            }
            case 'specialist_chain': {
                // For chain: find best REASONING model first, then best CODE/domain model
                const reasoning_ranked = this.rankModelsForDomain(available_models, 'reasoning');
                const domain_ranked = this.rankModelsForDomain(available_models, domain);
                // Assign: primary = reasoner (step 1), secondary = specialist (step 2)
                if (reasoning_ranked[0].filename !== domain_ranked[0].filename) {
                    primary_model = reasoning_ranked[0];
                    secondary_models = [domain_ranked[0]];
                }
                else {
                    // Same model is best for both — use it alone
                    secondary_models = [];
                }
                routing_confidence = 0.85; // chains tend to be high confidence
                trace.push(`[Router]: Specialist chain → ${primary_model.filename} → ${secondary_models[0]?.filename ?? 'solo'}`);
                break;
            }
            case 'adaptive': {
                // Adaptive: choose based on how many models we have
                if (ranked.length >= 3 && analysis.requires_high_confidence) {
                    secondary_models = ranked.slice(1, 3);
                    routing_confidence = 0.9;
                    trace.push('[Router]: Adaptive → consensus (high confidence required)');
                }
                else if (ranked.length >= 2) {
                    secondary_models = ranked.slice(1, 2);
                    routing_confidence = 0.75;
                    trace.push('[Router]: Adaptive → dual blend');
                }
                else {
                    routing_confidence = 0.6;
                    trace.push('[Router]: Adaptive → single champion (only one model)');
                }
                break;
            }
        }
        return {
            strategy,
            query_analysis: analysis,
            primary_model,
            secondary_models,
            all_models: [primary_model, ...secondary_models],
            routing_confidence: parseFloat(Math.min(1.0, routing_confidence).toFixed(3)),
            trace,
        };
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Rank models by their score for a specific domain.
     * Falls back to overall_power if domain score is unavailable.
     */
    rankModelsForDomain(models, domain) {
        return [...models].sort((a, b) => {
            const sa = a.profile.domain_scores.find(d => d.domain === domain)?.score ?? (a.profile.overall_power * 0.5);
            const sb = b.profile.domain_scores.find(d => d.domain === domain)?.score ?? (b.profile.overall_power * 0.5);
            return sb - sa;
        });
    }
    /**
     * Quick domain detection (no full analysis — for fast routing).
     */
    quickDomain(query) {
        const lower = query.toLowerCase();
        let best = 'unknown';
        let best_hits = 0;
        for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
            const hits = keywords.filter(kw => lower.includes(kw)).length;
            if (hits > best_hits) {
                best_hits = hits;
                best = domain;
            }
        }
        return best;
    }
    /**
     * Get all domains sorted by detection confidence for a query.
     */
    detectAllDomains(query) {
        const lower = query.toLowerCase();
        const results = [];
        for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
            const hits = keywords.filter(kw => lower.includes(kw)).length;
            if (hits > 0) {
                const confidence = Math.min(1.0, hits / Math.max(keywords.length * 0.3, 1));
                results.push({ domain, confidence: parseFloat(confidence.toFixed(3)) });
            }
        }
        return results.sort((a, b) => b.confidence - a.confidence);
    }
}
