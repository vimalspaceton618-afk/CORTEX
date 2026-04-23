import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { CognitionCore } from '../core/CognitionCore.js';
import { CortexBridge } from '../cortex-bridge/CortexBridge.js';

/**
 * BIGROCK_v1 — REST API Server
 * ─────────────────────────────────────────────────────────────────────────
 * Exposes all Bigrock engines as HTTP endpoints.
 *
 * This lets CORTEX (or any external system) call Bigrock over HTTP,
 * exactly like calling the OpenAI or Anthropic APIs — but locally,
 * with zero API cost, zero latency to a cloud, and zero data leakage.
 *
 * Endpoints:
 *   POST /v1/chat/completions     — OpenAI-compatible chat (CORTEX primary)
 *   POST /v1/math/evaluate        — Direct symbolic math expression
 *   POST /v1/physics/simulate     — Named physics simulation
 *   POST /v1/logic/prove          — Formal propositional logic proof
 *   GET  /v1/system/telemetry     — Live OS telemetry
 *   GET  /v1/system/status        — Full ASI status report
 *   GET  /v1/security/audit       — Security audit log
 *   GET  /v1/neural/metrics       — LNN neural metrics
 *   GET  /v1/hypervisor/chain     — Integrity chain status
 */

interface ApiRequest {
    method: string;
    url: string;
    body: any;
}

function readBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => {
            try { resolve(data ? JSON.parse(data) : {}); }
            catch { reject(new Error('Invalid JSON body')); }
        });
        req.on('error', reject);
    });
}

function send(res: ServerResponse, status: number, body: any): void {
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
    private core: CognitionCore;
    private bridge: CortexBridge;
    private port: number;
    private request_log: { time: number; method: string; path: string; status: number; ms: number }[] = [];

    constructor(port: number = 11500) {
        this.core = new CognitionCore();
        this.bridge = new CortexBridge(this.core);
        this.port = port;
    }

    public start(): void {
        const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
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
            } catch (e: any) {
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
            console.log(`  System:         GET  /v1/system/status`);
        });
    }

    private async route(req: ApiRequest, res: ServerResponse): Promise<void> {
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
            if (!body.expression) return send(res, 400, { error: 'expression required' });
            const sym = this.core['symbolic'] as any; // internal access
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
            if (!body.expression) return send(res, 400, { error: 'expression required' });
            const result = this.core.getLogic().prove(body.expression);
            return send(res, 200, { engine: 'Bigrock FormalLogicProver', ...result });
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
