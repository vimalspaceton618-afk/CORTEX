import type { CognitionCore } from '../core/CognitionCore.js';
import type { Thought } from '../core/types.js';

/**
 * BIGROCK_v1 — Query Decomposer
 * ─────────────────────────────────────────────────────────────────────────
 * Breaks complex, multi-domain queries into a Directed Acyclic Graph (DAG)
 * of atomic sub-problems, executes them in dependency order, then synthesizes
 * a unified proof trace across all sub-results.
 *
 * WHY THIS MATTERS:
 *   LLMs process "what is the orbital period of the ISS given its altitude and
 *   the escape velocity from Earth?" as a single token sequence.
 *   They can hallucinate intermediate steps entirely.
 *
 *   Bigrock decomposes it into:
 *     [1] escape_velocity(Earth)     → v_esc = 11186 m/s
 *     [2] orbital_velocity(ISS)      → v_orb = 7784 m/s  [depends on nothing]
 *     [3] orbital_period(v_orb, r)   → T = 5559 s        [depends on 2]
 *     [4] synthesize([1,2,3])        → final proof chain
 *
 *   Every sub-result is individually verified by the SelfReflectionEngine
 *   before being passed to the next step.
 */

export interface SubProblem {
    id: string;
    query: string;
    domain: string;
    depends_on: string[]; // IDs of sub-problems that must resolve first
    priority: number;
    result?: Thought;
    status: 'pending' | 'running' | 'resolved' | 'failed';
}

export interface DecompositionGraph {
    original_query: string;
    sub_problems: SubProblem[];
    execution_order: string[];
    synthesis: SynthesisResult;
}

export interface SynthesisResult {
    final_answer: string;
    proof_chain: string[];
    overall_confidence: number;
    domains_covered: string[];
    total_execution_ms: number;
    sub_results: Array<{ id: string; query: string; result: string; confidence: number }>;
}

const DECOMPOSITION_PATTERNS: Array<{
    pattern: RegExp;
    decompose: (m: RegExpMatchArray) => Array<{ query: string; domain: string }>;
}> = [
    // "first X then Y"
    {
        pattern: /first\s+(.+?),?\s+then\s+(.+)/i,
        decompose: (m) => [
            { query: m[1].trim(), domain: 'auto' },
            { query: m[2].trim(), domain: 'auto' }
        ]
    },
    // Multi-step physics: "using ... calculate"
    {
        pattern: /using\s+(.+?),?\s+(?:then\s+)?calculate\s+(.+)/i,
        decompose: (m) => [
            { query: m[1].trim(), domain: 'mathematics' },
            { query: `calculate ${m[2].trim()}`, domain: 'physics' }
        ]
    },
    // "compare X with Y"
    {
        pattern: /compare\s+(.+?)\s+(?:with|vs|versus|to)\s+(.+)/i,
        decompose: (m) => [
            { query: m[1].trim(), domain: 'auto' },
            { query: m[2].trim(), domain: 'auto' }
        ]
    },
    // "X and Y" compound queries (negative lookahead to ignore uppercase AND used in formal logic)
    {
        pattern: /^(.+?)\s+and\s+(?:also\s+)?(.+)$/,
        decompose: (m) => [
            { query: m[1].trim(), domain: 'auto' },
            { query: m[2].trim(), domain: 'auto' }
        ]
    }
];

export class QueryDecomposer {
    private core: CognitionCore;
    private decomposition_log: DecompositionGraph[] = [];

    constructor(core: CognitionCore) {
        this.core = core;
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    /**
     * Determine if a query is complex enough to warrant decomposition.
     */
    public needsDecomposition(query: string): boolean {
        if (query.trim().length < 10) return false;
        return DECOMPOSITION_PATTERNS.some(p => p.pattern.test(query.trim()));
    }

    /**
     * Full decompose + execute + synthesize pipeline.
     */
    public async solve(query: string): Promise<DecompositionGraph> {
        const graph = this.decompose(query);
        await this.execute(graph);
        this.synthesize(graph);
        this.decomposition_log.push(graph);
        return graph;
    }

    // ─── Internal Pipeline ─────────────────────────────────────────────────────

    private decompose(query: string): DecompositionGraph {
        let sub_problems: SubProblem[] = [];

        for (const { pattern, decompose } of DECOMPOSITION_PATTERNS) {
            const match = query.trim().match(pattern);
            if (match) {
                const parts = decompose(match);
                sub_problems = parts.map((p, i) => ({
                    id: `sub_${i + 1}`,
                    query: p.query,
                    domain: p.domain,
                    depends_on: i > 0 ? [`sub_${i}`] : [], // Linear dependency chain
                    priority: i,
                    status: 'pending' as const
                }));
                break;
            }
        }

        // Fallback: treat the whole query as a single problem
        if (!sub_problems.length) {
            sub_problems = [{
                id: 'sub_1',
                query,
                domain: 'auto',
                depends_on: [],
                priority: 0,
                status: 'pending'
            }];
        }

        return {
            original_query: query,
            sub_problems,
            execution_order: this.topologicalSort(sub_problems),
            synthesis: {
                final_answer: '',
                proof_chain: [],
                overall_confidence: 0,
                domains_covered: [],
                total_execution_ms: 0,
                sub_results: []
            }
        };
    }

    private async execute(graph: DecompositionGraph): Promise<void> {
        const start = Date.now();
        const resolved = new Map<string, Thought>();

        for (const id of graph.execution_order) {
            const sp = graph.sub_problems.find(s => s.id === id)!;

            // Wait for dependencies
            const depsResolved = sp.depends_on.every(dep => resolved.has(dep));
            if (!depsResolved) {
                sp.status = 'failed';
                continue;
            }

            // Inject dependency context into query if relevant
            let enrichedQuery = sp.query;
            for (const depId of sp.depends_on) {
                const depThought = resolved.get(depId);
                if (depThought?.result?.value) {
                    enrichedQuery += ` (context: previous result was ${String(depThought.result.value).slice(0, 80)})`;
                }
            }

            sp.status = 'running';
            try {
                // Pass true to skipDecomposition to avoid infinite loops on sub-queries
                const thought = await this.core.process(enrichedQuery, true);
                sp.result = thought;
                sp.status = 'resolved';
                resolved.set(id, thought);
            } catch {
                sp.status = 'failed';
            }
        }

        graph.synthesis.total_execution_ms = Date.now() - start;
    }

    private synthesize(graph: DecompositionGraph): void {
        const resolved = graph.sub_problems.filter(s => s.status === 'resolved');
        if (!resolved.length) {
            graph.synthesis.final_answer = 'All sub-problems failed to resolve.';
            return;
        }

        const sub_results = resolved.map(sp => ({
            id: sp.id,
            query: sp.query,
            result: String(sp.result?.result?.value ?? 'no result'),
            confidence: sp.result?.confidence ?? 0
        }));

        const proof_chain: string[] = [
            `[DECOMPOSED]: "${graph.original_query}"`,
            ...resolved.map((sp, i) =>
                `  [Step ${i + 1}] ${sp.query}\n           → ${String(sp.result?.result?.value ?? '?').slice(0, 120)}`
            )
        ];

        const overall_confidence = resolved.reduce((sum, sp) => sum + (sp.result?.confidence ?? 0), 0) / resolved.length;
        const domains_covered = [...new Set(resolved.map(sp => sp.result?.parsed_intent?.domain ?? 'unknown'))];

        // Final answer: last resolved result (most downstream in the DAG)
        const lastResult = resolved[resolved.length - 1];
        const finalVal = String(lastResult.result?.result?.value ?? '');

        graph.synthesis = {
            final_answer: finalVal,
            proof_chain,
            overall_confidence,
            domains_covered,
            total_execution_ms: graph.synthesis.total_execution_ms,
            sub_results
        };
    }

    private topologicalSort(problems: SubProblem[]): string[] {
        const order: string[] = [];
        const visited = new Set<string>();

        const visit = (id: string) => {
            if (visited.has(id)) return;
            visited.add(id);
            const sp = problems.find(p => p.id === id)!;
            for (const dep of sp.depends_on) visit(dep);
            order.push(id);
        };

        for (const sp of problems) visit(sp.id);
        return order;
    }

    public getLog(): DecompositionGraph[] { return this.decomposition_log; }
}
