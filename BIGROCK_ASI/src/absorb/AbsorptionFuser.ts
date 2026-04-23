import type { DomainScore } from './DomainProber.js';
import type { ThoughtResult } from '../core/types.js';

/**
 * BIGROCK_v1 — Absorption Fuser (Self-Absorbing Subsystem)
 * ─────────────────────────────────────────────────────────────────────────
 * The "digestive system" — when multiple absorbed LLMs generate responses,
 * this module fuses them into a single, superior answer.
 *
 * Three fusion strategies:
 *   1. CHAMPION SELECT — Pick the single best model's output (fastest)
 *   2. WEIGHTED BLEND  — Combine top-2 outputs weighted by domain score
 *   3. CONSENSUS VOTE  — 3+ models agree → high confidence
 */

export type FusionStrategy = 'champion' | 'weighted_blend' | 'consensus';

export interface ModelResponse {
    model_name: string;
    response: string;
    domain_score: number;    // this model's score for the queried domain
    latency_ms: number;
}

export interface FusedResult {
    strategy_used: FusionStrategy;
    winning_model: string;
    fused_response: string;
    composite_confidence: number;
    models_consulted: number;
    fusion_trace: string[];
}

export class AbsorptionFuser {

    /**
     * Fuse multiple model responses into a single superior output.
     * Automatically selects the best strategy based on response count.
     */
    public fuse(responses: ModelResponse[], preferred_strategy?: FusionStrategy): FusedResult {
        if (responses.length === 0) {
            return {
                strategy_used: 'champion',
                winning_model: 'none',
                fused_response: '[AbsorptionFuser]: No model responses to fuse.',
                composite_confidence: 0,
                models_consulted: 0,
                fusion_trace: ['No responses provided'],
            };
        }

        // Sort by domain score (best model first)
        const sorted = [...responses].sort((a, b) => b.domain_score - a.domain_score);

        // Auto-select strategy
        const strategy = preferred_strategy
            ?? (sorted.length >= 3 ? 'consensus' : sorted.length === 2 ? 'weighted_blend' : 'champion');

        switch (strategy) {
            case 'champion':
                return this.championSelect(sorted);
            case 'weighted_blend':
                return this.weightedBlend(sorted);
            case 'consensus':
                return this.consensusVote(sorted);
            default:
                return this.championSelect(sorted);
        }
    }

    /**
     * Strategy 1: Champion Select
     * Simply pick the model with the highest domain score.
     * Fastest — single model, zero fusion overhead.
     */
    private championSelect(sorted: ModelResponse[]): FusedResult {
        const champion = sorted[0];
        return {
            strategy_used: 'champion',
            winning_model: champion.model_name,
            fused_response: champion.response,
            composite_confidence: this.scoreQuality(champion.response) * champion.domain_score,
            models_consulted: 1,
            fusion_trace: [
                `[Champion]: ${champion.model_name} (domain score: ${champion.domain_score.toFixed(3)})`,
                `[Latency]: ${champion.latency_ms}ms`,
                `[Response quality]: ${this.scoreQuality(champion.response).toFixed(3)}`,
            ],
        };
    }

    /**
     * Strategy 2: Weighted Blend
     * Take top-2 models. Champion gets 70% weight, runner-up 30%.
     * Merges responses by selecting the longer, more substantive one
     * but enriches it with unique facts from the secondary.
     */
    private weightedBlend(sorted: ModelResponse[]): FusedResult {
        const champion = sorted[0];
        const runnerUp = sorted[1] ?? champion;

        const q1 = this.scoreQuality(champion.response);
        const q2 = this.scoreQuality(runnerUp.response);

        // If champion is clearly better, just use it
        if (q1 > q2 * 1.5 || sorted.length < 2) {
            const result = this.championSelect(sorted);
            result.strategy_used = 'weighted_blend';
            result.fusion_trace.push('[Blend]: Champion dominant — skipped fusion');
            return result;
        }

        // Extract unique sentences from runner-up not in champion
        const champion_sentences = new Set(this.extractSentences(champion.response));
        const unique_additions = this.extractSentences(runnerUp.response)
            .filter(s => !champion_sentences.has(s) && s.length > 20)
            .slice(0, 3); // max 3 enrichment sentences

        const blended = unique_additions.length > 0
            ? champion.response.trimEnd() + '\n\n' + unique_additions.join(' ')
            : champion.response;

        const compositeScore = (champion.domain_score * 0.7 + runnerUp.domain_score * 0.3)
            * this.scoreQuality(blended);

        return {
            strategy_used: 'weighted_blend',
            winning_model: champion.model_name,
            fused_response: blended,
            composite_confidence: Math.min(1.0, compositeScore),
            models_consulted: 2,
            fusion_trace: [
                `[Champion]: ${champion.model_name} (score: ${champion.domain_score.toFixed(3)}, quality: ${q1.toFixed(3)})`,
                `[Runner-up]: ${runnerUp.model_name} (score: ${runnerUp.domain_score.toFixed(3)}, quality: ${q2.toFixed(3)})`,
                `[Enrichment]: ${unique_additions.length} unique sentences added from runner-up`,
                `[Composite confidence]: ${compositeScore.toFixed(3)}`,
            ],
        };
    }

    /**
     * Strategy 3: Consensus Vote
     * Send to 3+ models. If majority agree on key facts, high confidence.
     * Uses keyword overlap to detect agreement.
     */
    private consensusVote(sorted: ModelResponse[]): FusedResult {
        const top3 = sorted.slice(0, 3);
        const keyword_sets = top3.map(r => new Set(this.extractKeywords(r.response)));

        // Find consensus keywords (appear in 2+ responses)
        const all_keywords = new Set<string>();
        for (const ks of keyword_sets) for (const k of ks) all_keywords.add(k);

        let consensus_count = 0;
        for (const kw of all_keywords) {
            const appears_in = keyword_sets.filter(ks => ks.has(kw)).length;
            if (appears_in >= 2) consensus_count++;
        }

        const consensus_ratio = all_keywords.size > 0 ? consensus_count / all_keywords.size : 0;

        // Pick the champion response but boost confidence if consensus is high
        const champion = top3[0];
        const confidence_boost = consensus_ratio > 0.3 ? 0.15 : 0;

        return {
            strategy_used: 'consensus',
            winning_model: champion.model_name,
            fused_response: champion.response,
            composite_confidence: Math.min(1.0, this.scoreQuality(champion.response) * champion.domain_score + confidence_boost),
            models_consulted: top3.length,
            fusion_trace: [
                ...top3.map((r, i) => `[Model ${i + 1}]: ${r.model_name} (score: ${r.domain_score.toFixed(3)})`),
                `[Consensus keywords]: ${consensus_count}/${all_keywords.size} (ratio: ${consensus_ratio.toFixed(3)})`,
                `[Confidence boost]: +${(confidence_boost * 100).toFixed(0)}% from consensus`,
            ],
        };
    }

    // ─── Quality Scoring Heuristics ────────────────────────────────────────────

    /**
     * Score the quality of a raw text response (0.0–1.0).
     * Uses length, structure, and coherence heuristics.
     */
    private scoreQuality(text: string): number {
        if (!text || text.length < 10) return 0.05;

        let score = 0;

        // Length score (diminishing returns)
        score += Math.min(text.length / 800, 0.3);

        // Has structured content (lists, code blocks, punctuation)
        if (/\d+\.|[-•●]/.test(text)) score += 0.1;      // lists
        if (/```|`[^`]+`/.test(text)) score += 0.1;       // code
        if (/[.!?]/.test(text)) score += 0.1;              // proper sentences

        // Substance: keyword density (more unique words = more substantive)
        const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const unique = new Set(words);
        const diversity = words.length > 0 ? unique.size / words.length : 0;
        score += diversity * 0.3;

        // Penalty for obvious garbage
        if (/^[\s\n]*$/.test(text)) return 0;
        if (text.includes('[SLM Empty Response]')) return 0.05;

        return Math.min(1.0, score);
    }

    private extractSentences(text: string): string[] {
        return text.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 5);
    }

    private extractKeywords(text: string): string[] {
        return text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    }

    /**
     * Convert a FusedResult into a standard ThoughtResult.
     */
    public toThoughtResult(fused: FusedResult): ThoughtResult {
        return {
            type: 'string',
            value: fused.fused_response,
            proof_trace: fused.fusion_trace,
            confidence: fused.composite_confidence,
        };
    }
}

const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'it', 'of', 'in', 'at', 'to', 'for', 'on',
    'with', 'as', 'by', 'from', 'that', 'this', 'and', 'or', 'not', 'be',
    'was', 'are', 'were', 'been', 'has', 'have', 'had', 'will', 'would',
    'could', 'should', 'can', 'may', 'might', 'shall', 'must', 'does',
    'did', 'done', 'being', 'they', 'them', 'their', 'than', 'then',
    'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'while',
    'also', 'very', 'just', 'more', 'most', 'some', 'such', 'only',
]);
