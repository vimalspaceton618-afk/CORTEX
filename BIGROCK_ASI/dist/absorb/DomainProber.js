/**
 * BIGROCK_v1 — Domain Prober (Self-Absorbing Subsystem)
 * ─────────────────────────────────────────────────────────────────────────
 * The "taste buds" of the LLM Devourer.
 *
 * When Bigrock encounters a new LLM (GGUF file), it needs to understand
 * WHAT that model is good at. This module sends diagnostic probes across
 * 8+ cognitive domains and scores the responses using deterministic
 * pattern matching — no external API needed.
 *
 * Each probe is a question with known-good answer patterns.
 * The model's response is graded 0.0–1.0 based on how many
 * expected markers appear in its output.
 *
 * This is how Bigrock "tastes" an LLM before absorbing it.
 */
// ─── Probe Bank ────────────────────────────────────────────────────────────────
const PROBE_BANK = [
    // ═══ REASONING ═══════════════════════════════════════════════════════════════
    {
        id: 'reason_01', domain: 'reasoning', weight: 1.0,
        question: 'If all cats are animals, and all animals need water, what can we conclude about cats?',
        expected_markers: ['cats need water', 'water', 'need', 'conclude', 'therefore'],
    },
    {
        id: 'reason_02', domain: 'reasoning', weight: 1.0,
        question: 'A is taller than B. B is taller than C. Who is the shortest?',
        expected_markers: ['C', 'shortest', 'C is the shortest'],
    },
    {
        id: 'reason_03', domain: 'reasoning', weight: 1.2,
        question: 'If it rains, the ground gets wet. The ground is wet. Can we conclude it rained?',
        expected_markers: [/no|cannot|not necessarily|fallacy|affirming the consequent/i],
        negative_markers: [/yes.*it rained/i],
    },
    {
        id: 'reason_04', domain: 'reasoning', weight: 1.0,
        question: 'There are 3 boxes. One has a prize. You pick Box 1. The host opens Box 3 (empty). Should you switch to Box 2?',
        expected_markers: [/switch|yes|2\/3|monty hall|better odds|higher probability/i],
    },
    {
        id: 'reason_05', domain: 'reasoning', weight: 1.0,
        question: 'Complete the pattern: 2, 6, 12, 20, ?',
        expected_markers: ['30'],
    },
    // ═══ MATHEMATICS ═════════════════════════════════════════════════════════════
    {
        id: 'math_01', domain: 'mathematics', weight: 1.0,
        question: 'What is the derivative of x^3 + 2x with respect to x?',
        expected_markers: ['3x^2', '3x²', '3*x^2', '+ 2', '3x^2 + 2'],
    },
    {
        id: 'math_02', domain: 'mathematics', weight: 1.0,
        question: 'Solve for x: 2x + 5 = 15',
        expected_markers: ['5', 'x = 5', 'x=5'],
    },
    {
        id: 'math_03', domain: 'mathematics', weight: 1.0,
        question: 'What is the integral of 2x dx?',
        expected_markers: ['x^2', 'x²', 'x**2', '+ C', 'constant'],
    },
    {
        id: 'math_04', domain: 'mathematics', weight: 1.2,
        question: 'What is the value of the limit as x approaches 0 of sin(x)/x?',
        expected_markers: ['1', 'one', 'equals 1'],
    },
    {
        id: 'math_05', domain: 'mathematics', weight: 1.0,
        question: 'What is 17 * 23?',
        expected_markers: ['391'],
    },
    // ═══ CYBERSECURITY ═══════════════════════════════════════════════════════════
    {
        id: 'cyber_01', domain: 'cybersecurity', weight: 1.0,
        question: 'Explain what a SQL injection attack is and how to prevent it.',
        expected_markers: [/sql/i, /inject/i, /parameterized|prepared|sanitiz/i, /input.*valid/i],
    },
    {
        id: 'cyber_02', domain: 'cybersecurity', weight: 1.0,
        question: 'What is a zero-day vulnerability?',
        expected_markers: [/zero.?day/i, /unknown|undisclosed|unpatched/i, /exploit/i],
    },
    {
        id: 'cyber_03', domain: 'cybersecurity', weight: 1.0,
        question: 'Explain the difference between symmetric and asymmetric encryption.',
        expected_markers: [/symmetric/i, /asymmetric/i, /key/i, /public|private/i],
    },
    {
        id: 'cyber_04', domain: 'cybersecurity', weight: 1.2,
        question: 'What is a buffer overflow attack and how does ASLR help prevent it?',
        expected_markers: [/buffer/i, /overflow/i, /ASLR|address.*space.*layout.*randomiz/i, /memory/i],
    },
    {
        id: 'cyber_05', domain: 'cybersecurity', weight: 1.0,
        question: 'What are the main differences between a virus, worm, and trojan?',
        expected_markers: [/virus/i, /worm/i, /trojan/i, /self.*replicat|spread|disguise|host/i],
    },
    // ═══ CODE ════════════════════════════════════════════════════════════════════
    {
        id: 'code_01', domain: 'code', weight: 1.0,
        question: 'Write a Python function to check if a number is prime.',
        expected_markers: [/def\s+\w+/i, /prime/i, /return/i, /for|while/i, /%|mod/i],
    },
    {
        id: 'code_02', domain: 'code', weight: 1.0,
        question: 'What is the time complexity of binary search?',
        expected_markers: [/O\(log\s*n\)|O\(log n\)|logarithmic/i, /log/i],
    },
    {
        id: 'code_03', domain: 'code', weight: 1.0,
        question: 'Explain the difference between a stack and a queue.',
        expected_markers: [/stack/i, /queue/i, /LIFO|FIFO|last.*in.*first.*out|first.*in.*first.*out/i],
    },
    {
        id: 'code_04', domain: 'code', weight: 1.2,
        question: 'Write a JavaScript function to reverse a string without using built-in reverse.',
        expected_markers: [/function/i, /return/i, /for|while|split|reduce/i, /reverse/i],
    },
    {
        id: 'code_05', domain: 'code', weight: 1.0,
        question: 'What is a closure in JavaScript?',
        expected_markers: [/closure/i, /scope|variable|function|inner|outer|lexical/i],
    },
    // ═══ LOGIC ═══════════════════════════════════════════════════════════════════
    {
        id: 'logic_01', domain: 'logic', weight: 1.0,
        question: 'Is the statement "All A are B, all B are C, therefore all A are C" valid?',
        expected_markers: [/valid|yes|correct|syllogism|transitive/i],
    },
    {
        id: 'logic_02', domain: 'logic', weight: 1.2,
        question: 'Evaluate: "If P then Q. Not Q. Therefore, Not P." Is this valid?',
        expected_markers: [/valid|modus.*tollens|correct|yes/i],
    },
    {
        id: 'logic_03', domain: 'logic', weight: 1.0,
        question: 'What is the truth value of "P AND NOT P"?',
        expected_markers: [/false|contradiction|always false|never true/i],
    },
    {
        id: 'logic_04', domain: 'logic', weight: 1.0,
        question: 'What is a tautology? Give an example.',
        expected_markers: [/tautology/i, /always.*true|true.*every|every.*case/i, /P.*OR.*NOT.*P|example/i],
    },
    // ═══ SCIENCE ═════════════════════════════════════════════════════════════════
    {
        id: 'sci_01', domain: 'science', weight: 1.0,
        question: 'What is the speed of light in meters per second?',
        expected_markers: [/299\s*,?\s*792\s*,?\s*458|3\s*[×x*]\s*10\^?8|approximately 3|300.*million/i],
    },
    {
        id: 'sci_02', domain: 'science', weight: 1.0,
        question: 'Explain Newton\'s three laws of motion briefly.',
        expected_markers: [/first|inertia/i, /second|F\s*=\s*m\s*a|force.*mass.*accel/i, /third|action.*reaction|equal.*opposite/i],
    },
    {
        id: 'sci_03', domain: 'science', weight: 1.0,
        question: 'What is the chemical formula for water?',
        expected_markers: ['H2O', 'h2o'],
    },
    {
        id: 'sci_04', domain: 'science', weight: 1.0,
        question: 'What is DNA and what does it stand for?',
        expected_markers: [/deoxyribonucleic/i, /acid/i, /genetic|gene|heredit/i],
    },
    // ═══ LANGUAGE ════════════════════════════════════════════════════════════════
    {
        id: 'lang_01', domain: 'language', weight: 1.0,
        question: 'Summarize the following in one sentence: "Machine learning is a subset of artificial intelligence that allows systems to learn and improve from experience without being explicitly programmed."',
        expected_markers: [/machine learning/i, /AI|artificial intelligence/i, /learn/i],
    },
    {
        id: 'lang_02', domain: 'language', weight: 1.0,
        question: 'What is the opposite of "ephemeral"?',
        expected_markers: [/permanent|lasting|enduring|eternal|perpetual/i],
    },
    {
        id: 'lang_03', domain: 'language', weight: 1.0,
        question: 'Fix the grammar in: "Him and me went to the store yesterday"',
        expected_markers: [/He and I/i, /he/i],
    },
    // ═══ CREATIVE ════════════════════════════════════════════════════════════════
    {
        id: 'creative_01', domain: 'creative', weight: 1.0,
        question: 'Write a four-line poem about the ocean.',
        expected_markers: [/ocean|sea|wave|water|tide|shore|deep|blue/i],
    },
    {
        id: 'creative_02', domain: 'creative', weight: 1.0,
        question: 'Create a short metaphor for the concept of time.',
        expected_markers: [/time/i, /like|as|is a/i],
    },
];
// ─── Prober Class ──────────────────────────────────────────────────────────────
export class DomainProber {
    probes = PROBE_BANK;
    /**
     * Get all probes for a specific domain.
     */
    getProbesForDomain(domain) {
        return this.probes.filter(p => p.domain === domain);
    }
    /**
     * Get all unique domains covered by the probe bank.
     */
    getDomains() {
        return [...new Set(this.probes.map(p => p.domain))];
    }
    /**
     * Score a model's response against a single probe.
     * Returns 0.0–1.0 based on how many expected markers were found.
     */
    scoreResponse(probe, response) {
        const lower = response.toLowerCase();
        const markers_hit = [];
        const markers_missed = [];
        for (const marker of probe.expected_markers) {
            const pattern = typeof marker === 'string'
                ? new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
                : marker;
            if (pattern.test(response)) {
                markers_hit.push(typeof marker === 'string' ? marker : marker.source);
            }
            else {
                markers_missed.push(typeof marker === 'string' ? marker : marker.source);
            }
        }
        // Negative markers reduce score
        let negative_hits = 0;
        if (probe.negative_markers) {
            for (const marker of probe.negative_markers) {
                const pattern = typeof marker === 'string'
                    ? new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
                    : marker;
                if (pattern.test(response))
                    negative_hits++;
            }
        }
        const total_expected = probe.expected_markers.length;
        let raw_score = total_expected > 0 ? markers_hit.length / total_expected : 0;
        // Penalize for negative markers
        raw_score = Math.max(0, raw_score - (negative_hits * 0.3));
        // Bonus for longer, substantive answers (up to 10% boost)
        const length_bonus = Math.min(response.length / 500, 0.1);
        const final_score = Math.min(1.0, raw_score + length_bonus);
        return {
            probe_id: probe.id,
            domain: probe.domain,
            score: parseFloat(final_score.toFixed(3)),
            response_length: response.length,
            markers_hit,
            markers_missed,
            latency_ms: 0, // filled in by caller
        };
    }
    /**
     * Aggregate individual probe results into a DomainScore.
     */
    aggregateDomainScores(results) {
        const byDomain = new Map();
        for (const r of results) {
            if (!byDomain.has(r.domain))
                byDomain.set(r.domain, []);
            byDomain.get(r.domain).push(r);
        }
        const scores = [];
        for (const [domain, probeResults] of byDomain) {
            const probes = this.getProbesForDomain(domain);
            let weighted_sum = 0;
            let weight_total = 0;
            for (const pr of probeResults) {
                const probe = probes.find(p => p.id === pr.probe_id);
                const weight = probe?.weight ?? 1.0;
                weighted_sum += pr.score * weight;
                weight_total += weight;
            }
            const aggregate = weight_total > 0 ? weighted_sum / weight_total : 0;
            scores.push({
                domain,
                score: parseFloat(aggregate.toFixed(3)),
                probes_run: probeResults.length,
                probes_passed: probeResults.filter(r => r.score >= 0.5).length,
                probe_results: probeResults,
            });
        }
        return scores.sort((a, b) => b.score - a.score);
    }
    /** Total probe count */
    getProbeCount() { return this.probes.length; }
}
