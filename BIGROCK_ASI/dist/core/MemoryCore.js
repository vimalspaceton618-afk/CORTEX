import { createHash } from 'crypto';
export class MemoryCore {
    cells = new Map();
    write_log = [];
    constructor() {
        // Seed permanent physical constants — these are NEVER mutable
        this.writeCell('CONST::c', 299792458, 'constant');
        this.writeCell('CONST::h', 6.62607015e-34, 'constant');
        this.writeCell('CONST::G', 6.67430e-11, 'constant');
        this.writeCell('CONST::e', 1.602176634e-19, 'constant');
        this.writeCell('CONST::Na', 6.02214076e23, 'constant');
        this.writeCell('CONST::k', 1.380649e-23, 'constant');
        this.writeCell('CONST::pi', Math.PI, 'constant');
        this.writeCell('CONST::phi', 1.6180339887, 'constant'); // Golden ratio
        this.writeCell('CONST::euler', 2.718281828, 'constant');
    }
    /**
     * Write a memory cell with integrity hash enforcement.
     * Constants can NEVER be overwritten.
     */
    writeCell(key, value, type = 'variable', ttl) {
        // IMMUTABILITY GUARD: Constants are write-once
        const existing = this.cells.get(key);
        if (existing?.type === 'constant') {
            this.write_log.push(`[MEMORY GUARD]: Attempt to overwrite constant "${key}" was BLOCKED.`);
            return false;
        }
        const write_time = Date.now();
        const integrity_hash = createHash('sha256')
            .update(key + JSON.stringify(value) + write_time)
            .digest('hex');
        this.cells.set(key, {
            key, value, type,
            write_time,
            ttl,
            encrypted: false,
            access_count: 0,
            integrity_hash
        });
        this.write_log.push(`[MEMORY WRITE]: "${key}" (type=${type})`);
        return true;
    }
    /**
     * Read a memory cell and validate its integrity hash on every access.
     * Detects if a cell was tampered with externally.
     */
    readCell(key) {
        const cell = this.cells.get(key);
        if (!cell)
            return undefined;
        // Enforce TTL expiry
        if (cell.ttl && (Date.now() - cell.write_time) > cell.ttl) {
            this.cells.delete(key);
            return undefined;
        }
        // Integrity validation — re-compute and compare hash
        const expected_hash = createHash('sha256')
            .update(cell.key + JSON.stringify(cell.value) + cell.write_time)
            .digest('hex');
        if (expected_hash !== cell.integrity_hash) {
            this.write_log.push(`[MEMORY CORRUPTION DETECTED]: Cell "${key}" integrity hash MISMATCH. Cell quarantined.`);
            this.cells.delete(key); // Quarantine corrupted cell
            return undefined;
        }
        cell.access_count++;
        return cell.value;
    }
    /** Returns all cells of a given type as a flat object (for symbolic scope injection) */
    getScope(type) {
        const scope = {};
        for (const [, cell] of this.cells) {
            if (!type || cell.type === type) {
                const val = this.readCell(cell.key);
                if (val !== undefined) {
                    // Strip the CONST:: prefix for clean expression evaluation
                    const clean_key = cell.key.replace(/^CONST::/, '');
                    scope[clean_key] = val;
                }
            }
        }
        return scope;
    }
    getAuditLog() { return this.write_log; }
    getCellCount() { return this.cells.size; }
}
