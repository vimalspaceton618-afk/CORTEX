import { createServer } from 'http';
import { CognitionCore } from '../core/CognitionCore.js';
import { CortexBridge } from '../cortex-bridge/CortexBridge.js';
function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => {
            try {
                resolve(data ? JSON.parse(data) : {});
            }
            catch {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}
function send(res, status, body) {
    const json = JSON.stringify(body, null, 2);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'X-Powered-By': 'Bigrock-v1-ASI'
    });
    res.end(json);
}
export class BigrockServer {
    core;
    bridge;
    port;
    request_log = [];
    constructor(port = 11500) {
        this.core = new CognitionCore();
        this.bridge = new CortexBridge(this.core);
        this.port = port;
    }
    start() {
        const server = createServer(async (req, res) => {
            const start = Date.now();
            const method = req.method || 'GET';
            const url = req.url || '/';
            // CORS preflight
            if (method === 'OPTIONS') {
                res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
                res.end();
                return;
            }
            let status = 200;
            try {
                const body = method === 'POST' ? await readBody(req) : {};
                await this.route({ method, url, body }, res);
            }
            catch (e) {
                status = 500;
                send(res, 500, { error: e.message });
            }
            const ms = Date.now() - start;
            this.request_log.push({ time: Date.now(), method, path: url, status, ms });
            console.log(`[API] ${method} ${url} → ${status} (${ms}ms)`);
        });
        server.listen(this.port, () => {
            console.log(`\n[BIGROCK API SERVER]: Running on http://localhost:${this.port}`);
            console.log(`  Primary Brain:  POST /v1/chat/completions`);
            console.log(`  Math Engine:    POST /v1/math/evaluate`);
            console.log(`  Physics Engine: POST /v1/physics/simulate`);
            console.log(`  Logic Prover:   POST /v1/logic/prove`);
            console.log(`  Model Absorb:   POST /v1/models/absorb`);
            console.log(`  System:         GET  /v1/system/status`);
        });
    }
    async route(req, res) {
        const { method, url, body } = req;
        // ── POST /v1/chat/completions ──────────────────────────────────────
        if (method === 'POST' && url === '/v1/chat/completions') {
            if (!body.messages || !Array.isArray(body.messages)) {
                return send(res, 400, { error: 'messages array required' });
            }
            const response = await this.bridge.chat(body.messages);
            return send(res, 200, response);
        }
        // ── POST /v1/math/evaluate ─────────────────────────────────────────
        if (method === 'POST' && url === '/v1/math/evaluate') {
            if (!body.expression)
                return send(res, 400, { error: 'expression required' });
            const sym = this.core['symbolic']; // internal access
            const result = sym.evaluate(body.expression);
            return send(res, 200, { engine: 'Bigrock SymbolicEngine', ...result });
        }
        // ── POST /v1/physics/simulate ──────────────────────────────────────
        if (method === 'POST' && url === '/v1/physics/simulate') {
            const thought = await this.core.process(body.query || '');
            return send(res, 200, {
                engine: 'Bigrock PhysicsEngine',
                result: thought.result?.value,
                proof_trace: thought.result?.proof_trace,
                confidence: thought.confidence
            });
        }
        // ── POST /v1/logic/prove ───────────────────────────────────────────
        if (method === 'POST' && url === '/v1/logic/prove') {
            if (!body.expression)
                return send(res, 400, { error: 'expression required' });
            const result = this.core.getLogic().prove(body.expression);
            return send(res, 200, { engine: 'Bigrock FormalLogicProver', ...result });
        }
        // ── POST /v1/models/absorb ─────────────────────────────────────────
        if (method === 'POST' && url === '/v1/models/absorb') {
            const force = !!body.force;
            try {
                const report = await this.core.getAbsorber().absorbAll(force);
                return send(res, 200, { engine: 'Bigrock LLMDevourer', status: 'success', report });
            }
            catch (e) {
                return send(res, 500, { error: e.message });
            }
        }
        // ── GET /v1/models/hive ────────────────────────────────────────────
        if (method === 'GET' && url === '/v1/models/hive') {
            const hive = this.core.getBrain().getHive();
            return send(res, 200, {
                engine: 'Bigrock ModelHive',
                total_models: hive.size(),
                total_power: hive.getTotalPower(),
                champions: Object.fromEntries(hive.getAllChampions()),
            });
        }
        // ── GET /v1/models/fusion ──────────────────────────────────────────
        if (method === 'GET' && url === '/v1/models/fusion') {
            const fusion = this.core.getBrain().getFusion();
            return send(res, 200, {
                engine: 'Bigrock NeuralFusionCore',
                status: fusion.getStatus()
            });
        }
        // ── GET /v1/system/telemetry ───────────────────────────────────────
        if (method === 'GET' && url === '/v1/system/telemetry') {
            return send(res, 200, this.core.getKernel().getTelemetry());
        }
        // ── GET /v1/system/status ──────────────────────────────────────────
        if (method === 'GET' && url === '/v1/system/status') {
            const chain = this.core.getHypervisor().verifyChain();
            const neural = this.core.getLearning().getMetrics();
            const mem = this.core.getMemory();
            return send(res, 200, {
                system: 'Bigrock_v1 ASI',
                version: '2.0.0',
                status: 'operational',
                integrity_chain: { valid: chain.valid, links: this.core.getHypervisor().getChainLength() },
                memory: { cells: mem.getCellCount(), constants: Object.keys(mem.getScope('constant')).length },
                neural: neural,
                security: { threats_blocked: this.core.getSecurity().getThreatCount() },
                api_requests: this.request_log.length,
                uptime_ms: Date.now() - (this.request_log[0]?.time || Date.now())
            });
        }
        // ── GET /v1/security/audit ─────────────────────────────────────────
        if (method === 'GET' && url === '/v1/security/audit') {
            return send(res, 200, {
                threats: this.core.getSecurity().getAuditLog(),
                hypervisor_violations: this.core.getHypervisor().getFailedAccessLog()
            });
        }
        // ── GET /v1/neural/metrics ─────────────────────────────────────────
        if (method === 'GET' && url === '/v1/neural/metrics') {
            return send(res, 200, this.core.getLearning().getMetrics());
        }
        // ── GET /v1/hypervisor/chain ───────────────────────────────────────
        if (method === 'GET' && url === '/v1/hypervisor/chain') {
            const chain = this.core.getHypervisor().getChain();
            const validity = this.core.getHypervisor().verifyChain();
            return send(res, 200, { valid: validity.valid, length: chain.length, recent: chain.slice(-10) });
        }
        // ── GET / (health check) ───────────────────────────────────────────
        if (url === '/' || url === '/health') {
            return send(res, 200, { status: 'alive', model: 'bigrock-v1', timestamp: Date.now() });
        }
        send(res, 404, { error: `Route ${method} ${url} not found` });
    }
}
