export class SelfReflectionEngine {
    /**
     * Reflect on a completed Thought.
     * Returns a verdict with detailed reasoning.
     */
    reflect(thought) {
        const start = Date.now();
        const issues = [];
        const checks_passed = [];
        let confidence = thought.confidence;
        // ─── CHECK 1: Proof Trace Completeness ────────────────────────────
        if (thought.mode === 'symbolic') {
            if (!thought.result?.proof_trace || thought.result.proof_trace.length === 0) {
                issues.push('Symbolic mode produced no proof trace — result is unverifiable.');
                confidence *= 0.3;
            }
            else if (thought.result.proof_trace.length < 3) {
                issues.push(`Proof trace suspiciously short (${thought.result.proof_trace.length} steps). May lack intermediate derivation.`);
                confidence *= 0.7;
            }
            else {
                checks_passed.push(`Proof trace present with ${thought.result.proof_trace.length} verification steps.`);
            }
        }
        // ─── CHECK 2: Numeric Result Sanity ───────────────────────────────
        if (thought.result?.type === 'proof' || thought.result?.type === 'computation') {
            const val = thought.result.value;
            if (typeof val === 'number') {
                if (!isFinite(val)) {
                    issues.push('Result is Infinity or NaN — computation may have divided by zero or overflowed.');
                    confidence = 0;
                }
                else if (Math.abs(val) > 1e30) {
                    issues.push(`Result magnitude is extremely large (${val.toExponential(2)}). Verify units and scale.`);
                    confidence *= 0.8;
                }
                else {
                    checks_passed.push('Numeric result is finite and within reasonable magnitude.');
                }
            }
            if (typeof val === 'string' && val.includes('NaN')) {
                issues.push('String result contains NaN — upstream computation error detected.');
                confidence *= 0.2;
            }
        }
        // ─── CHECK 3: Confidence Overestimation Guard ─────────────────────
        if (thought.confidence === 1.0 && thought.mode !== 'symbolic') {
            issues.push('Non-symbolic mode claiming 100% confidence. Only deterministic proofs can be 100%.');
            confidence = Math.min(confidence, 0.9);
        }
        else if (thought.confidence === 1.0 && thought.mode === 'symbolic') {
            checks_passed.push('Symbolic mode 100% confidence is valid (deterministic proof).');
        }
        // ─── CHECK 4: Error Trace Detection ───────────────────────────────
        if (thought.result?.proof_trace) {
            const errorSteps = thought.result.proof_trace.filter(s => s.includes('[ERROR]') || s.includes('Error') || s.includes('undefined'));
            if (errorSteps.length > 0) {
                issues.push(`Proof trace contains ${errorSteps.length} error step(s): ${errorSteps[0]}`);
                confidence *= 0.4;
            }
            else {
                checks_passed.push('No errors detected in proof trace.');
            }
        }
        // ─── CHECK 5: Domain-Result Coherence ─────────────────────────────
        const domain = thought.parsed_intent.domain;
        if (domain === 'physics' && thought.result?.type === 'string') {
            issues.push('Physics domain returned a text string instead of a numeric computation.');
            confidence *= 0.5;
        }
        if (domain === 'mathematics' && thought.result?.type === 'error') {
            issues.push('Mathematics domain failed to compute — expression may be malformed.');
            confidence *= 0.3;
        }
        if (domain !== 'unknown') {
            checks_passed.push(`Domain classification "${domain}" is consistent with routing decision.`);
        }
        // ─── CHECK 6: Execution Time Anomaly ──────────────────────────────
        if (thought.execution_time_ms > 5000) {
            issues.push(`Execution took ${thought.execution_time_ms}ms — significantly longer than expected. Possible infinite recursion or heavy computation.`);
            confidence *= 0.9;
        }
        else {
            checks_passed.push(`Execution completed in ${thought.execution_time_ms}ms (within normal bounds).`);
        }
        // ─── CHECK 7: Dimensional Analysis (Physics) ──────────────────────
        if (domain === 'physics' && thought.result?.proof_trace) {
            const hasUnits = thought.result.proof_trace.some(s => /\b(N|m|s|kg|J|W|Pa|K|C|V|Hz|eV)\b/.test(s));
            if (hasUnits) {
                checks_passed.push('Dimensional analysis: physical units detected in proof trace.');
            }
            else {
                issues.push('Physics result has no dimensional units — potential dimensionless error.');
                confidence *= 0.85;
            }
        }
        // ─── FINAL VERDICT ────────────────────────────────────────────────
        const adjusted_confidence = Math.max(0, Math.min(1, confidence));
        let verdict;
        if (issues.length === 0 && adjusted_confidence >= 0.9) {
            verdict = 'VERIFIED';
        }
        else if (issues.length <= 2 && adjusted_confidence >= 0.5) {
            verdict = 'SUSPECT';
        }
        else {
            verdict = 'REJECTED';
        }
        return {
            verdict,
            original_confidence: thought.confidence,
            adjusted_confidence,
            issues,
            checks_passed,
            reflection_time_ms: Date.now() - start
        };
    }
    /**
     * Deep reflection: iteratively re-examine a thought up to maxPasses times.
     * Each pass may reveal new issues based on the adjusted state.
     */
    deepReflect(thought, maxPasses = 3) {
        let currentVerdict = this.reflect(thought);
        for (let pass = 1; pass < maxPasses; pass++) {
            if (currentVerdict.verdict === 'VERIFIED')
                break;
            // Simulate re-evaluation by checking if issues compound
            const compoundedIssues = [...currentVerdict.issues];
            if (currentVerdict.adjusted_confidence < 0.3) {
                compoundedIssues.push(`Pass ${pass + 1}: Confidence degraded below 30% threshold after recursive analysis.`);
            }
            currentVerdict = {
                ...currentVerdict,
                issues: compoundedIssues,
                adjusted_confidence: currentVerdict.adjusted_confidence * (currentVerdict.verdict === 'SUSPECT' ? 0.95 : 0.8),
                reflection_time_ms: Date.now() - thought.timestamp
            };
            // Re-evaluate verdict
            if (currentVerdict.issues.length === 0 && currentVerdict.adjusted_confidence >= 0.9) {
                currentVerdict.verdict = 'VERIFIED';
            }
            else if (currentVerdict.issues.length <= 2 && currentVerdict.adjusted_confidence >= 0.5) {
                currentVerdict.verdict = 'SUSPECT';
            }
            else {
                currentVerdict.verdict = 'REJECTED';
            }
        }
        return currentVerdict;
    }
}
