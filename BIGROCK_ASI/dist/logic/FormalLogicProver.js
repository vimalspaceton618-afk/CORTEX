/**
 * BIGROCK_v1 — Formal Logic Prover
 * ─────────────────────────────────────────────────────────────────────────
 * A propositional logic truth table generator and tautology verifier.
 *
 * LLMs fail at formal logic because they use probabilistic text generation
 * to "guess" truth values. Bigrock evaluates logical propositions
 * exhaustively using truth table enumeration.
 *
 * Supported operations:
 *   AND (∧)    →  p AND q     / p & q
 *   OR  (∨)    →  p OR q      / p | q
 *   NOT (¬)    →  NOT p       / !p
 *   IMPLIES (→)→  p IMPLIES q / p -> q / p => q
 *   IFF (↔)    →  p IFF q     / p <-> q / p <=> q
 *   XOR        →  p XOR q
 */
export class FormalLogicProver {
    /**
     * Extract variable names from a logical expression.
     */
    extractVariables(expr) {
        const cleaned = expr
            .replace(/\b(AND|OR|NOT|IMPLIES|IFF|XOR|TRUE|FALSE)\b/gi, '')
            .replace(/[&|!()^<>=\-\s]/g, ' ');
        const vars = new Set();
        for (const token of cleaned.split(/\s+/)) {
            if (token.match(/^[a-zA-Z][a-zA-Z0-9]*$/) && token.length <= 3) {
                vars.add(token.toLowerCase());
            }
        }
        return Array.from(vars).sort();
    }
    /**
     * Normalize a logical expression into an evaluable JS form.
     */
    normalize(expr) {
        return expr
            .replace(/\bAND\b/gi, '&&')
            .replace(/\bOR\b/gi, '||')
            .replace(/\bNOT\b/gi, '!')
            .replace(/\bIMPLIES\b/gi, '=>')
            .replace(/\bIFF\b/gi, '<=>')
            .replace(/\bXOR\b/gi, '^')
            .replace(/\bTRUE\b/gi, 'true')
            .replace(/\bFALSE\b/gi, 'false')
            .replace(/\s*=>\s*/g, ' IMPL ')
            .replace(/\s*<=>\s*/g, ' BICON ')
            .replace(/\s*->\s*/g, ' IMPL ')
            .replace(/\s*<->\s*/g, ' BICON ')
            .trim();
    }
    /**
     * Evaluate a normalized logical expression with given variable bindings.
     */
    evaluate(normalized, bindings) {
        let expr = normalized;
        // Replace variables with their truth values
        for (const [variable, value] of Object.entries(bindings)) {
            const regex = new RegExp(`\\b${variable}\\b`, 'g');
            expr = expr.replace(regex, value ? 'true' : 'false');
        }
        // Iteratively reduce the expression until only true/false remains
        let safety = 0;
        while (expr !== 'true' && expr !== 'false' && safety < 200) {
            safety++;
            const before = expr;
            // Step 1: Resolve innermost parentheses first
            expr = expr.replace(/\(\s*(true|false)\s*\)/g, '$1');
            // Step 2: NOT (highest precedence unary)
            expr = expr.replace(/!\s*(true|false)/g, (_, v) => v === 'true' ? 'false' : 'true');
            // Step 3: AND
            expr = expr.replace(/(true|false)\s*&&\s*(true|false)/, (_, a, b) => (a === 'true' && b === 'true') ? 'true' : 'false');
            // Step 4: OR
            expr = expr.replace(/(true|false)\s*\|\|\s*(true|false)/, (_, a, b) => (a === 'true' || b === 'true') ? 'true' : 'false');
            // Step 5: XOR
            expr = expr.replace(/(true|false)\s*\^\s*(true|false)/, (_, a, b) => (a === 'true') !== (b === 'true') ? 'true' : 'false');
            // Step 6: IMPLICATION
            expr = expr.replace(/(true|false)\s+IMPL\s+(true|false)/, (_, a, b) => (a !== 'true' || b === 'true') ? 'true' : 'false');
            // Step 7: BICONDITIONAL
            expr = expr.replace(/(true|false)\s+BICON\s+(true|false)/, (_, a, b) => (a === b) ? 'true' : 'false');
            // Clean up whitespace
            expr = expr.replace(/\s+/g, ' ').trim();
            // If nothing changed, break to avoid infinite loop
            if (expr === before)
                break;
        }
        return expr.trim() === 'true';
    }
    /**
     * Generate a complete truth table and classify the expression.
     */
    prove(expression) {
        const variables = this.extractVariables(expression);
        const normalized = this.normalize(expression);
        const totalRows = Math.pow(2, variables.length);
        const truth_table = [];
        let satisfiable_count = 0;
        for (let i = 0; i < totalRows; i++) {
            const bindings = {};
            for (let v = 0; v < variables.length; v++) {
                bindings[variables[v]] = Boolean((i >> (variables.length - 1 - v)) & 1);
            }
            const result = this.evaluate(normalized, bindings);
            truth_table.push({ variables: { ...bindings }, result });
            if (result)
                satisfiable_count++;
        }
        return {
            expression,
            variables,
            truth_table,
            is_tautology: satisfiable_count === totalRows,
            is_contradiction: satisfiable_count === 0,
            is_contingent: satisfiable_count > 0 && satisfiable_count < totalRows,
            satisfiable_count,
            total_rows: totalRows
        };
    }
    /**
     * Check if two expressions are logically equivalent.
     */
    areEquivalent(expr1, expr2) {
        const r1 = this.prove(expr1);
        const r2 = this.prove(expr2);
        const differences = [];
        if (r1.total_rows !== r2.total_rows) {
            return { equivalent: false, differences: [-1] };
        }
        for (let i = 0; i < r1.truth_table.length; i++) {
            if (r1.truth_table[i].result !== r2.truth_table[i].result) {
                differences.push(i);
            }
        }
        return { equivalent: differences.length === 0, differences };
    }
}
