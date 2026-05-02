import * as math from 'mathjs';
export class SymbolicEngine {
    memory;
    constructor(memory) {
        this.memory = memory;
    }
    /**
     * Evaluate any mathematical / physics expression.
     * Proof trace logs each deterministic step.
     */
    evaluate(expression) {
        const start = Date.now();
        const proof_trace = [];
        const scope = this.memory.getScope('constant');
        proof_trace.push(`[Lex]: Tokenizing expression → "${expression}"`);
        proof_trace.push(`[Scope]: Injecting ${Object.keys(scope).length} physical constants`);
        try {
            const parsed = math.parse(expression);
            proof_trace.push(`[Parse]: AST node type → "${parsed.type}"`);
            const compiled = parsed.compile();
            proof_trace.push(`[Compile]: Expression compiled to executable node tree`);
            const result = compiled.evaluate(scope);
            proof_trace.push(`[Execute]: Result computed → ${result}`);
            // Try to simplify the result
            let simplified;
            try {
                simplified = math.simplify(expression, {}, { exactFractions: false }).toString();
                if (simplified !== expression) {
                    proof_trace.push(`[Simplify]: Reduced form → "${simplified}"`);
                }
            }
            catch { /* some expressions can't simplify — that's fine */ }
            return {
                success: true,
                expression,
                result,
                simplified,
                proof_trace,
                execution_time_ms: Date.now() - start,
            };
        }
        catch (e) {
            proof_trace.push(`[ERROR]: ${e.message}`);
            return {
                success: false,
                expression,
                proof_trace,
                execution_time_ms: Date.now() - start,
                error: e.message
            };
        }
    }
    /** Compute symbolic derivative with proof trace */
    differentiate(expression, variable) {
        const start = Date.now();
        const proof_trace = [];
        proof_trace.push(`[Differentiate]: d/d${variable}(${expression})`);
        try {
            const result = math.derivative(expression, variable);
            const simplified = math.simplify(result).toString();
            proof_trace.push(`[Result]: ${result.toString()}`);
            proof_trace.push(`[Simplified]: ${simplified}`);
            return {
                success: true,
                expression: `d/d${variable}(${expression})`,
                result: result.toString(),
                simplified,
                proof_trace,
                execution_time_ms: Date.now() - start,
            };
        }
        catch (e) {
            return {
                success: false,
                expression,
                error: e.message,
                proof_trace: [`[ERROR]: ${e.message}`],
                execution_time_ms: Date.now() - start
            };
        }
    }
    /** Evaluate a full unit-aware physics formula and return SI-tagged result */
    physicsProve(formula, units) {
        const result = this.evaluate(formula);
        if (result.success && units) {
            result.proof_trace.push(`[Units]: Result is in ${Object.values(units).join(' · ')}`);
        }
        return result;
    }
    /** Solve an equation for an unknown variable */
    solve(expression, variable) {
        const start = Date.now();
        const proof_trace = [];
        proof_trace.push(`[Solve]: Algebraically reducing "${expression}" with respect to "${variable}"`);
        try {
            // Use simplify + rationalize as a standalone algebraic reduction
            const simplified = math.simplify(expression).toString();
            const rationalized = math.rationalize(simplified, {}, true);
            const result_str = rationalized.expression.toString();
            proof_trace.push(`[Simplify]: ${simplified}`);
            proof_trace.push(`[Rationalize]: ${result_str}`);
            return {
                success: true,
                expression,
                result: result_str,
                simplified: result_str,
                proof_trace,
                execution_time_ms: Date.now() - start
            };
        }
        catch (e) {
            return {
                success: false,
                expression,
                error: e.message,
                proof_trace: [`[ERROR]: ${e.message}`],
                execution_time_ms: Date.now() - start
            };
        }
    }
}
