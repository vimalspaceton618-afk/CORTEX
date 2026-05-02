import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import { Tool } from '../tools/Tool.js';
import { checkToolPolicy, getPolicy, savePolicy } from './policy.js';
import { SharedContext } from '../core/agent/SharedContext.js';
const execAsync = promisify(exec);
const circuitBreakerState = new Map();
async function enforcePolicyAndConfirm(toolName, riskLevel, requestConfirmation, prompt) {
    const policy = checkToolPolicy(toolName, riskLevel);
    if (!policy.allowed) {
        return `[POLICY BLOCKED]: ${toolName} is disabled by plugin policy.`;
    }
    if (policy.requireConfirmation) {
        const approved = await requestConfirmation(prompt);
        if (!approved)
            return '[OPERATION CANCELLED BY USER]';
    }
    return null;
}
async function resilientFetch(url, options) {
    const circuitKey = options.circuitKey || new URL(url).host;
    const breaker = circuitBreakerState.get(circuitKey);
    const now = Date.now();
    if (breaker?.openUntil && breaker.openUntil > now) {
        throw new Error(`Circuit open for ${circuitKey} until ${new Date(breaker.openUntil).toISOString()}`);
    }
    const retry = Math.max(0, Math.min(options.retry ?? 2, 5));
    const backoffMs = Math.max(100, Math.min(options.backoffMs ?? 500, 5000));
    const timeoutMs = Math.max(1000, Math.min(options.timeoutMs ?? 15000, 120000));
    let lastError = null;
    for (let attempt = 0; attempt <= retry; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, {
                method: options.method || 'GET',
                headers: {
                    ...(options.headers || {}),
                    ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {})
                },
                body: options.body,
                signal: controller.signal
            });
            clearTimeout(timer);
            if (res.status >= 500 && attempt < retry) {
                await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
                continue;
            }
            if (res.ok) {
                circuitBreakerState.set(circuitKey, { failures: 0 });
            }
            else if (res.status >= 500) {
                const failures = (circuitBreakerState.get(circuitKey)?.failures || 0) + 1;
                circuitBreakerState.set(circuitKey, {
                    failures,
                    openUntil: failures >= 3 ? now + 15000 : undefined
                });
            }
            return res;
        }
        catch (error) {
            clearTimeout(timer);
            lastError = error;
            if (attempt < retry) {
                await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
                continue;
            }
        }
    }
    const failures = (circuitBreakerState.get(circuitKey)?.failures || 0) + 1;
    circuitBreakerState.set(circuitKey, {
        failures,
        openUntil: failures >= 3 ? now + 15000 : undefined
    });
    throw lastError || new Error(`Request failed for ${url}`);
}
function createIdempotencyKey(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
class ConnectorsStatusTool extends Tool {
    name = 'plugin_connector_status';
    description = 'Report readiness for core connector integrations (Gmail, Slack, GitHub, Notion, databases).';
    schema = { type: 'object', properties: {}, additionalProperties: false };
    async execute() {
        const checks = [
            ['GitHub', process.env.GITHUB_TOKEN],
            ['Slack', process.env.SLACK_BOT_TOKEN],
            ['Gmail', process.env.GMAIL_CLIENT_ID || process.env.GMAIL_REFRESH_TOKEN],
            ['Notion', process.env.NOTION_API_KEY],
            ['Database URL', process.env.DATABASE_URL]
        ];
        const lines = checks.map(([name, value]) => `- ${name}: ${value ? 'configured' : 'missing'}`);
        return `Connector readiness:\n${lines.join('\n')}`;
    }
}
class PluginPolicyGetTool extends Tool {
    name = 'plugin_policy_get';
    description = 'Return the current plugin policy JSON.';
    schema = { type: 'object', properties: {}, additionalProperties: false };
    async execute() {
        return JSON.stringify(getPolicy(), null, 2);
    }
}
class PluginPolicySetTool extends Tool {
    name = 'plugin_policy_set';
    description = 'Update policy for a specific plugin tool (allow/confirmation).';
    schema = {
        type: 'object',
        properties: {
            toolName: { type: 'string', description: 'Tool identifier (e.g., plugin_github_pr_merge).' },
            allowed: { type: 'boolean', description: 'Whether tool is allowed to run.' },
            requireConfirmation: { type: 'boolean', description: 'Whether confirmation is required.' },
            autonomyMode: { type: 'string', enum: ['semi_auto', 'full_auto_lab'], description: 'Global autonomy mode.' }
        },
        required: [],
        additionalProperties: false
    };
    async execute(args, requestConfirmation) {
        const current = getPolicy();
        const next = {
            autonomyMode: current.autonomyMode || 'semi_auto',
            riskDefaults: current.riskDefaults,
            defaultAllow: current.defaultAllow ?? true,
            tools: { ...(current.tools || {}) }
        };
        if (args.autonomyMode) {
            next.autonomyMode = args.autonomyMode;
        }
        if (args.toolName) {
            const currentRule = next.tools[args.toolName] || {};
            if (typeof args.allowed === 'boolean')
                currentRule.allowed = args.allowed;
            if (typeof args.requireConfirmation === 'boolean')
                currentRule.requireConfirmation = args.requireConfirmation;
            next.tools[args.toolName] = currentRule;
        }
        const target = args.toolName || 'global-policy';
        const approved = await requestConfirmation(`Allow updating plugin policy for ${target}?`);
        if (!approved)
            return '[OPERATION CANCELLED BY USER]';
        savePolicy(next);
        return `Policy updated: autonomyMode=${next.autonomyMode}, tool=${target}`;
    }
}
class GitHubIssuesTool extends Tool {
    name = 'plugin_github_issues';
    description = 'List or create GitHub issues using GITHUB_TOKEN and a repo identifier.';
    schema = {
        type: 'object',
        properties: {
            action: { type: 'string', enum: ['list', 'create'], description: 'List open issues or create a new issue.' },
            owner: { type: 'string', description: 'Repository owner or org.' },
            repo: { type: 'string', description: 'Repository name.' },
            title: { type: 'string', description: 'Issue title for create action.' },
            body: { type: 'string', description: 'Issue body for create action.' },
            limit: { type: 'number', description: 'Max issues to list.' }
        },
        required: ['action', 'owner', 'repo'],
        additionalProperties: false
    };
    async execute(args, requestConfirmation) {
        const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
        if (!token)
            return '[CONNECTOR ERROR]: Missing GITHUB_TOKEN or GH_TOKEN.';
        const apiBase = `https://api.github.com/repos/${args.owner}/${args.repo}/issues`;
        if (args.action === 'list') {
            const limit = Math.max(1, Math.min(Number(args.limit || 10), 50));
            const res = await fetch(`${apiBase}?state=open&per_page=${limit}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
            });
            if (!res.ok)
                return `[CONNECTOR ERROR]: GitHub list failed (${res.status}).`;
            const items = await res.json();
            if (!items.length)
                return 'No open issues.';
            return items
                .filter((x) => !x.pull_request)
                .map((x) => `#${x.number} ${x.title}`)
                .slice(0, limit)
                .join('\n');
        }
        if (!args.title?.trim())
            return '[CONNECTOR ERROR]: title is required for create action.';
        const policyBlock = await enforcePolicyAndConfirm(this.name, 'mutate', requestConfirmation, `Allow plugin to create GitHub issue "${args.title}" on ${args.owner}/${args.repo}?`);
        if (policyBlock)
            return policyBlock;
        const res = await resilientFetch(apiBase, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title: args.title, body: args.body || '' }),
            idempotencyKey: createIdempotencyKey('gh-issue'),
            circuitKey: 'github-api'
        });
        if (!res.ok)
            return `[CONNECTOR ERROR]: GitHub create failed (${res.status}).`;
        const created = await res.json();
        return `Created issue #${created.number}: ${created.html_url}`;
    }
}
class SlackWebhookPostTool extends Tool {
    name = 'plugin_slack_webhook_post';
    description = 'Post a message to Slack using SLACK_WEBHOOK_URL.';
    schema = {
        type: 'object',
        properties: {
            text: { type: 'string', description: 'Message body to send to Slack webhook.' }
        },
        required: ['text'],
        additionalProperties: false
    };
    async execute(args, requestConfirmation) {
        const webhook = process.env.SLACK_WEBHOOK_URL;
        if (!webhook)
            return '[CONNECTOR ERROR]: Missing SLACK_WEBHOOK_URL.';
        const policyBlock = await enforcePolicyAndConfirm(this.name, 'mutate', requestConfirmation, `Allow plugin to post this message to Slack?\n"${args.text.slice(0, 200)}"`);
        if (policyBlock)
            return policyBlock;
        const res = await resilientFetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: args.text }),
            idempotencyKey: createIdempotencyKey('slack-post'),
            circuitKey: 'slack-webhook'
        });
        if (!res.ok)
            return `[CONNECTOR ERROR]: Slack webhook failed (${res.status}).`;
        return 'Slack message posted successfully.';
    }
}
class SlackChannelHistoryTool extends Tool {
    name = 'plugin_slack_channel_history';
    description = 'Read Slack channel messages using SLACK_BOT_TOKEN and a channel ID.';
    schema = {
        type: 'object',
        properties: {
            channelId: { type: 'string', description: 'Slack channel ID (e.g., C12345).' },
            limit: { type: 'number', description: 'Max messages to return.' }
        },
        required: ['channelId'],
        additionalProperties: false
    };
    async execute(args) {
        const token = process.env.SLACK_BOT_TOKEN;
        if (!token)
            return '[CONNECTOR ERROR]: Missing SLACK_BOT_TOKEN.';
        const policy = checkToolPolicy(this.name, 'read');
        if (!policy.allowed)
            return `[POLICY BLOCKED]: ${this.name} is disabled by plugin policy.`;
        const limit = Math.max(1, Math.min(Number(args.limit || 15), 50));
        const res = await resilientFetch(`https://slack.com/api/conversations.history?channel=${encodeURIComponent(args.channelId)}&limit=${limit}`, {
            headers: { Authorization: `Bearer ${token}` },
            circuitKey: 'slack-api'
        });
        if (!res.ok)
            return `[CONNECTOR ERROR]: Slack history request failed (${res.status}).`;
        const data = await res.json();
        if (!data.ok)
            return `[CONNECTOR ERROR]: Slack API error (${data.error || 'unknown'}).`;
        const messages = Array.isArray(data.messages) ? data.messages : [];
        if (!messages.length)
            return 'No Slack messages found.';
        return messages
            .slice(0, limit)
            .map((m) => `- ${m.user || 'unknown'}: ${(m.text || '').replace(/\s+/g, ' ').slice(0, 200)}`)
            .join('\n');
    }
}
class GitHubPullRequestsTool extends Tool {
    name = 'plugin_github_prs';
    description = 'List pull requests from a GitHub repository.';
    schema = {
        type: 'object',
        properties: {
            owner: { type: 'string', description: 'Repository owner or org.' },
            repo: { type: 'string', description: 'Repository name.' },
            state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'PR state filter.' },
            limit: { type: 'number', description: 'Max pull requests to return.' }
        },
        required: ['owner', 'repo'],
        additionalProperties: false
    };
    async execute(args) {
        const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
        if (!token)
            return '[CONNECTOR ERROR]: Missing GITHUB_TOKEN or GH_TOKEN.';
        const policy = checkToolPolicy(this.name, 'read');
        if (!policy.allowed)
            return `[POLICY BLOCKED]: ${this.name} is disabled by plugin policy.`;
        const state = args.state || 'open';
        const limit = Math.max(1, Math.min(Number(args.limit || 10), 50));
        const res = await resilientFetch(`https://api.github.com/repos/${args.owner}/${args.repo}/pulls?state=${state}&per_page=${limit}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
            circuitKey: 'github-api'
        });
        if (!res.ok)
            return `[CONNECTOR ERROR]: GitHub PR list failed (${res.status}).`;
        const items = await res.json();
        if (!items.length)
            return 'No pull requests found.';
        return items
            .slice(0, limit)
            .map((x) => `#${x.number} [${x.state}] ${x.title}`)
            .join('\n');
    }
}
class GitHubPrCommentTool extends Tool {
    name = 'plugin_github_pr_comment';
    description = 'Create a comment on a GitHub pull request issue thread.';
    schema = {
        type: 'object',
        properties: {
            owner: { type: 'string', description: 'Repository owner or org.' },
            repo: { type: 'string', description: 'Repository name.' },
            prNumber: { type: 'number', description: 'Pull request number.' },
            body: { type: 'string', description: 'Comment body.' }
        },
        required: ['owner', 'repo', 'prNumber', 'body'],
        additionalProperties: false
    };
    async execute(args, requestConfirmation) {
        const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
        if (!token)
            return '[CONNECTOR ERROR]: Missing GITHUB_TOKEN or GH_TOKEN.';
        const policyBlock = await enforcePolicyAndConfirm(this.name, 'mutate', requestConfirmation, `Allow plugin to comment on PR #${args.prNumber} in ${args.owner}/${args.repo}?`);
        if (policyBlock)
            return policyBlock;
        const res = await resilientFetch(`https://api.github.com/repos/${args.owner}/${args.repo}/issues/${args.prNumber}/comments`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ body: args.body }),
            idempotencyKey: createIdempotencyKey('gh-pr-comment'),
            circuitKey: 'github-api'
        });
        if (!res.ok)
            return `[CONNECTOR ERROR]: GitHub PR comment failed (${res.status}).`;
        const body = await res.json();
        return `PR comment created: ${body.html_url}`;
    }
}
class GitHubPrMergeTool extends Tool {
    name = 'plugin_github_pr_merge';
    description = 'Merge a GitHub pull request with optional merge method.';
    schema = {
        type: 'object',
        properties: {
            owner: { type: 'string', description: 'Repository owner or org.' },
            repo: { type: 'string', description: 'Repository name.' },
            prNumber: { type: 'number', description: 'Pull request number.' },
            mergeMethod: { type: 'string', enum: ['merge', 'squash', 'rebase'], description: 'Merge method.' }
        },
        required: ['owner', 'repo', 'prNumber'],
        additionalProperties: false
    };
    async execute(args, requestConfirmation) {
        const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
        if (!token)
            return '[CONNECTOR ERROR]: Missing GITHUB_TOKEN or GH_TOKEN.';
        const method = args.mergeMethod || 'squash';
        const policyBlock = await enforcePolicyAndConfirm(this.name, 'destructive', requestConfirmation, `Allow plugin to merge PR #${args.prNumber} in ${args.owner}/${args.repo} using ${method}?`);
        if (policyBlock)
            return policyBlock;
        const res = await resilientFetch(`https://api.github.com/repos/${args.owner}/${args.repo}/pulls/${args.prNumber}/merge`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ merge_method: method }),
            idempotencyKey: createIdempotencyKey('gh-pr-merge'),
            circuitKey: 'github-api'
        });
        if (!res.ok)
            return `[CONNECTOR ERROR]: GitHub PR merge failed (${res.status}).`;
        const out = await res.json();
        return `Merge result: ${out.message || 'merged'}`;
    }
}
class NotionSearchTool extends Tool {
    name = 'plugin_notion_search';
    description = 'Search Notion pages/databases using NOTION_API_KEY.';
    schema = {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Search text.' },
            pageSize: { type: 'number', description: 'Maximum results.' }
        },
        required: ['query'],
        additionalProperties: false
    };
    async execute(args) {
        const token = process.env.NOTION_API_KEY;
        if (!token)
            return '[CONNECTOR ERROR]: Missing NOTION_API_KEY.';
        const pageSize = Math.max(1, Math.min(Number(args.pageSize || 10), 50));
        const res = await resilientFetch('https://api.notion.com/v1/search', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: args.query,
                page_size: pageSize
            }),
            circuitKey: 'notion-api'
        });
        if (!res.ok)
            return `[CONNECTOR ERROR]: Notion search failed (${res.status}).`;
        const body = await res.json();
        const results = Array.isArray(body.results) ? body.results : [];
        if (!results.length)
            return 'No Notion results found.';
        return results
            .slice(0, pageSize)
            .map((r) => {
            const title = r?.properties?.title?.title?.[0]?.plain_text
                || r?.title?.[0]?.plain_text
                || r?.id;
            return `- ${title} (${r.object})`;
        })
            .join('\n');
    }
}
class SqliteQueryTool extends Tool {
    name = 'plugin_sqlite_query';
    description = 'Run read-only SQLite queries against a local database file.';
    schema = {
        type: 'object',
        properties: {
            dbPath: { type: 'string', description: 'Path to sqlite database file.' },
            sql: { type: 'string', description: 'SQL query. SELECT only.' }
        },
        required: ['dbPath', 'sql'],
        additionalProperties: false
    };
    async execute(args) {
        const trimmed = args.sql.trim().toLowerCase();
        if (!trimmed.startsWith('select')) {
            return '[CONNECTOR ERROR]: Only SELECT queries are allowed.';
        }
        const dbPath = path.resolve(process.cwd(), args.dbPath);
        if (!fs.existsSync(dbPath))
            return `[CONNECTOR ERROR]: Database not found at ${dbPath}`;
        try {
            const { stdout, stderr } = await execAsync(`sqlite3 -header -csv "${dbPath}" "${args.sql.replace(/"/g, '""')}"`, {
                timeout: 30000,
                maxBuffer: 1024 * 1024
            });
            if (stderr?.trim())
                return `Query completed with warnings:\n${stderr.trim()}\n${stdout.trim()}`;
            return stdout.trim() || 'Query returned no rows.';
        }
        catch (error) {
            return `[CONNECTOR ERROR]: sqlite query failed (${error.message}). Ensure sqlite3 is installed.`;
        }
    }
}
class DevtoolsProjectDoctorTool extends Tool {
    name = 'plugin_devtools_project_doctor';
    description = 'Inspect local project scripts and TypeScript diagnostics readiness.';
    schema = { type: 'object', properties: {}, additionalProperties: false };
    async execute() {
        const pkgPath = path.join(process.cwd(), 'package.json');
        const tsPath = path.join(process.cwd(), 'tsconfig.json');
        let scripts = {};
        if (fs.existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                scripts = pkg.scripts || {};
            }
            catch {
                // ignore parse failure
            }
        }
        return [
            `TypeScript config: ${fs.existsSync(tsPath) ? 'found' : 'missing'}`,
            `Script lint: ${scripts.lint ? 'present' : 'missing'}`,
            `Script test: ${scripts.test ? 'present' : 'missing'}`,
            `Script build: ${scripts.build ? 'present' : 'missing'}`
        ].join('\n');
    }
}
class FrontendDesignGuideTool extends Tool {
    name = 'plugin_frontend_design_guide';
    description = 'Return production frontend scaffolding guidance for React/Tailwind/components.';
    schema = {
        type: 'object',
        properties: {
            stack: { type: 'string', description: 'Optional stack hint, e.g., react-tailwind-shadcn.' }
        },
        additionalProperties: false
    };
    async execute(args) {
        const stack = args?.stack || 'react-tailwind-shadcn';
        return [
            `Frontend production guide (${stack}):`,
            '- Define design tokens first (color, spacing, typography, radius).',
            '- Keep primitives in components/ui and app composites in features/*.',
            '- Enforce accessibility checks on interactive components.',
            '- Add visual regression snapshots in CI for core screens.'
        ].join('\n');
    }
}
class RagKnowledgeStatusTool extends Tool {
    context;
    name = 'plugin_rag_status';
    description = 'Report local RAG index/readiness status and retrieval entrypoints.';
    schema = { type: 'object', properties: {}, additionalProperties: false };
    constructor(context) {
        super();
        this.context = context;
    }
    async execute() {
        const indexPath = path.join(this.context.workspaceRoot, '.cortex', 'rag', 'index.json');
        const exists = fs.existsSync(indexPath);
        return [
            `RAG index path: ${indexPath}`,
            `RAG index status: ${exists ? 'present' : 'missing'}`,
            'Next step: implement embedding pipeline + retrieve_context tool backed by this index.'
        ].join('\n');
    }
}
function normalizeWorkflowStatus(status) {
    const valid = ['planned', 'pending', 'running', 'completed', 'failed', 'cancelled'];
    return valid.includes(status) ? status : 'pending';
}
function getWorkflowDir() {
    const root = process.env.CORTEX_WORKSPACE_ROOT || process.cwd();
    const dir = path.join(root, 'workflows');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}
function getMeshDir() {
    const root = process.env.CORTEX_WORKSPACE_ROOT || process.cwd();
    const dir = path.join(root, '.cortex_mesh');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}
function getMeshSigningKey() {
    return process.env.MESH_SIGNING_KEY || 'cortex-mesh-dev-key';
}
function signEnvelope(payload) {
    return crypto.createHmac('sha256', getMeshSigningKey()).update(payload).digest('hex');
}
class WorkflowValidateTool extends Tool {
    name = 'workflow_validate';
    description = 'Validate a workflow definition file (JSON).';
    schema = {
        type: 'object',
        properties: {
            file: { type: 'string', description: 'Workflow file name under workflows/, e.g., deploy.json' }
        },
        required: ['file'],
        additionalProperties: false
    };
    async execute(args) {
        const filePath = path.join(getWorkflowDir(), args.file);
        if (!fs.existsSync(filePath))
            return `[WORKFLOW ERROR]: Missing file ${filePath}`;
        try {
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (!parsed.id || !parsed.objective || !Array.isArray(parsed.steps)) {
                return '[WORKFLOW ERROR]: Missing required fields id/objective/steps.';
            }
            if (parsed.steps.length === 0)
                return '[WORKFLOW ERROR]: steps must not be empty.';
            return `Workflow valid: ${parsed.id} with ${parsed.steps.length} steps.`;
        }
        catch (error) {
            return `[WORKFLOW ERROR]: Invalid JSON (${error.message}).`;
        }
    }
}
class WorkflowRunTool extends Tool {
    name = 'workflow_run';
    description = 'Start a workflow run and persist step graph metadata.';
    schema = {
        type: 'object',
        properties: {
            file: { type: 'string', description: 'Workflow file name under workflows/, e.g., deploy.json' },
            dryRun: { type: 'boolean', description: 'If true, execute planning only.' }
        },
        required: ['file'],
        additionalProperties: false
    };
    async execute(args) {
        const filePath = path.join(getWorkflowDir(), args.file);
        if (!fs.existsSync(filePath))
            return `[WORKFLOW ERROR]: Missing file ${filePath}`;
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const workflowRun = {
            runId,
            workflowId: parsed.id,
            objective: parsed.objective,
            status: args.dryRun ? 'planned' : 'running',
            startedAt: new Date().toISOString(),
            steps: parsed.steps.map((s, idx) => ({
                stepIndex: idx,
                stepId: s.id,
                type: s.type,
                description: s.description,
                status: args.dryRun ? 'planned' : 'pending'
            }))
        };
        const runFile = path.join(getWorkflowDir(), `${runId}.state.json`);
        fs.writeFileSync(runFile, JSON.stringify(workflowRun, null, 2), 'utf-8');
        SharedContext.upsertWorkflowRun({
            runId,
            workflowId: parsed.id,
            status: args.dryRun ? 'planned' : 'running',
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            steps: workflowRun.steps.map((s) => ({
                stepId: s.stepId,
                status: normalizeWorkflowStatus(s.status),
                updatedAt: new Date().toISOString()
            }))
        });
        SharedContext.appendAudit({
            event: 'workflow_run_started',
            runId,
            workflowId: parsed.id,
            stepCount: parsed.steps.length
        });
        return `Workflow run created: ${runId}\nState file: ${runFile}`;
    }
}
class WorkflowResumeTool extends Tool {
    name = 'workflow_resume';
    description = 'Resume a workflow run state and mark next pending step as running.';
    schema = {
        type: 'object',
        properties: {
            runId: { type: 'string', description: 'Run id created by workflow_run.' }
        },
        required: ['runId'],
        additionalProperties: false
    };
    async execute(args) {
        const runFile = path.join(getWorkflowDir(), `${args.runId}.state.json`);
        if (!fs.existsSync(runFile))
            return `[WORKFLOW ERROR]: Missing run state for ${args.runId}`;
        const runState = JSON.parse(fs.readFileSync(runFile, 'utf-8'));
        const next = runState.steps.find((s) => s.status === 'pending' || s.status === 'planned');
        if (!next) {
            runState.status = 'completed';
            fs.writeFileSync(runFile, JSON.stringify(runState, null, 2), 'utf-8');
            SharedContext.upsertWorkflowRun({
                runId: args.runId,
                workflowId: runState.workflowId,
                status: 'completed',
                startedAt: runState.startedAt,
                updatedAt: new Date().toISOString(),
                steps: runState.steps.map((s) => ({
                    stepId: s.stepId,
                    status: normalizeWorkflowStatus(s.status),
                    updatedAt: new Date().toISOString()
                }))
            });
            SharedContext.appendAudit({ event: 'workflow_run_completed', runId: args.runId });
            return `Workflow ${args.runId} completed.`;
        }
        next.status = 'running';
        runState.status = 'running';
        runState.lastUpdatedAt = new Date().toISOString();
        fs.writeFileSync(runFile, JSON.stringify(runState, null, 2), 'utf-8');
        SharedContext.updateWorkflowStep(args.runId, {
            stepId: next.stepId,
            status: 'running',
            updatedAt: new Date().toISOString(),
            note: next.description
        });
        SharedContext.appendAudit({
            event: 'workflow_step_running',
            runId: args.runId,
            stepId: next.stepId
        });
        return `Workflow ${args.runId} resumed at step ${next.stepId}.`;
    }
}
class WorkflowCancelTool extends Tool {
    name = 'workflow_cancel';
    description = 'Cancel an active workflow run.';
    schema = {
        type: 'object',
        properties: {
            runId: { type: 'string', description: 'Run id created by workflow_run.' }
        },
        required: ['runId'],
        additionalProperties: false
    };
    async execute(args, requestConfirmation) {
        const policyBlock = await enforcePolicyAndConfirm(this.name, 'destructive', requestConfirmation, `Allow cancelling workflow run ${args.runId}?`);
        if (policyBlock)
            return policyBlock;
        const runFile = path.join(getWorkflowDir(), `${args.runId}.state.json`);
        if (!fs.existsSync(runFile))
            return `[WORKFLOW ERROR]: Missing run state for ${args.runId}`;
        const runState = JSON.parse(fs.readFileSync(runFile, 'utf-8'));
        runState.status = 'cancelled';
        runState.cancelledAt = new Date().toISOString();
        fs.writeFileSync(runFile, JSON.stringify(runState, null, 2), 'utf-8');
        SharedContext.upsertWorkflowRun({
            runId: args.runId,
            workflowId: runState.workflowId,
            status: 'cancelled',
            startedAt: runState.startedAt,
            updatedAt: new Date().toISOString(),
            steps: runState.steps.map((s) => ({
                stepId: s.stepId,
                status: normalizeWorkflowStatus(s.status),
                updatedAt: new Date().toISOString()
            }))
        });
        SharedContext.appendAudit({ event: 'workflow_run_cancelled', runId: args.runId });
        return `Workflow ${args.runId} cancelled.`;
    }
}
class MeshEnvelopeCreateTool extends Tool {
    name = 'mesh_envelope_create';
    description = 'Create a signed distributed-task envelope in local mesh queue.';
    schema = {
        type: 'object',
        properties: {
            taskType: { type: 'string', description: 'Task type for mesh workers.' },
            payload: { type: 'string', description: 'JSON string payload.' }
        },
        required: ['taskType', 'payload'],
        additionalProperties: false
    };
    async execute(args) {
        const envelope = {
            envelopeId: `env_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            taskType: args.taskType,
            payload: args.payload,
            createdAt: new Date().toISOString(),
            status: 'queued'
        };
        const raw = JSON.stringify(envelope);
        const signature = signEnvelope(raw);
        const wrapped = { ...envelope, signature };
        const file = path.join(getMeshDir(), `${envelope.envelopeId}.json`);
        fs.writeFileSync(file, JSON.stringify(wrapped, null, 2), 'utf-8');
        SharedContext.appendAudit({ event: 'mesh_envelope_created', envelopeId: envelope.envelopeId, taskType: args.taskType });
        return `Mesh envelope created: ${envelope.envelopeId}`;
    }
}
class MeshEnvelopeClaimTool extends Tool {
    name = 'mesh_envelope_claim';
    description = 'Claim next queued envelope for worker execution.';
    schema = {
        type: 'object',
        properties: {
            workerId: { type: 'string', description: 'Worker identifier.' }
        },
        required: ['workerId'],
        additionalProperties: false
    };
    async execute(args) {
        const dir = getMeshDir();
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
        for (const file of files) {
            const full = path.join(dir, file);
            const envelope = JSON.parse(fs.readFileSync(full, 'utf-8'));
            if (envelope.status !== 'queued')
                continue;
            const unsigned = { ...envelope };
            delete unsigned.signature;
            const expected = signEnvelope(JSON.stringify(unsigned));
            if (expected !== envelope.signature)
                continue;
            envelope.status = 'claimed';
            envelope.claimedBy = args.workerId;
            envelope.claimedAt = new Date().toISOString();
            fs.writeFileSync(full, JSON.stringify(envelope, null, 2), 'utf-8');
            SharedContext.appendAudit({ event: 'mesh_envelope_claimed', envelopeId: envelope.envelopeId, workerId: args.workerId });
            return `Claimed envelope ${envelope.envelopeId}`;
        }
        return 'No queued envelope found.';
    }
}
class MeshEnvelopeCompleteTool extends Tool {
    name = 'mesh_envelope_complete';
    description = 'Complete a claimed envelope with result.';
    schema = {
        type: 'object',
        properties: {
            envelopeId: { type: 'string', description: 'Envelope id.' },
            result: { type: 'string', description: 'Result summary.' }
        },
        required: ['envelopeId', 'result'],
        additionalProperties: false
    };
    async execute(args) {
        const full = path.join(getMeshDir(), `${args.envelopeId}.json`);
        if (!fs.existsSync(full))
            return `[MESH ERROR]: Envelope not found ${args.envelopeId}`;
        const envelope = JSON.parse(fs.readFileSync(full, 'utf-8'));
        envelope.status = 'completed';
        envelope.completedAt = new Date().toISOString();
        envelope.result = args.result;
        fs.writeFileSync(full, JSON.stringify(envelope, null, 2), 'utf-8');
        SharedContext.appendAudit({ event: 'mesh_envelope_completed', envelopeId: args.envelopeId });
        return `Envelope ${args.envelopeId} completed.`;
    }
}
class AutomationLoopPlannerTool extends Tool {
    name = 'plugin_automation_loop_plan';
    description = 'Generate an autonomous loop plan for multi-step task execution.';
    schema = {
        type: 'object',
        properties: {
            objective: { type: 'string', description: 'Primary objective for the loop.' },
            maxIterations: { type: 'number', description: 'Optional upper bound for loop iterations.' }
        },
        required: ['objective'],
        additionalProperties: false
    };
    async execute(args) {
        const maxIterations = Math.max(1, Math.min(Number(args.maxIterations || 6), 20));
        return [
            `Automation loop objective: ${args.objective}`,
            `Iteration budget: ${maxIterations}`,
            'Loop phases: Observe -> Plan -> Execute -> Verify -> Reflect -> Continue/Stop.',
            'Stop conditions: tests pass, acceptance criteria met, or iteration budget exhausted.'
        ].join('\n');
    }
}
export const BUILTIN_TOOLSET_FACTORIES = {
    connectors: () => [
        new PluginPolicyGetTool(),
        new PluginPolicySetTool(),
        new ConnectorsStatusTool(),
        new GitHubIssuesTool(),
        new GitHubPullRequestsTool(),
        new GitHubPrCommentTool(),
        new GitHubPrMergeTool(),
        new SlackWebhookPostTool(),
        new SlackChannelHistoryTool(),
        new NotionSearchTool(),
        new SqliteQueryTool()
    ],
    devtools: () => [new DevtoolsProjectDoctorTool()],
    frontend: () => [new FrontendDesignGuideTool()],
    rag: (context) => [new RagKnowledgeStatusTool(context)],
    automation: () => [
        new AutomationLoopPlannerTool(),
        new WorkflowValidateTool(),
        new WorkflowRunTool(),
        new WorkflowResumeTool(),
        new WorkflowCancelTool(),
        new MeshEnvelopeCreateTool(),
        new MeshEnvelopeClaimTool(),
        new MeshEnvelopeCompleteTool()
    ]
};
