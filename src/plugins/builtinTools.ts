import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool } from '../tools/Tool.js';
import { PluginToolContext, PluginToolFactory } from './types.js';
import { checkToolPolicy, getPolicy, savePolicy } from './policy.js';

const execAsync = promisify(exec);

async function enforcePolicyAndConfirm(
    toolName: string,
    isMutating: boolean,
    requestConfirmation: (promptMessage: string) => Promise<boolean>,
    prompt: string
): Promise<string | null> {
    const policy = checkToolPolicy(toolName, isMutating);
    if (!policy.allowed) {
        return `[POLICY BLOCKED]: ${toolName} is disabled by plugin policy.`;
    }
    if (policy.requireConfirmation) {
        const approved = await requestConfirmation(prompt);
        if (!approved) return '[OPERATION CANCELLED BY USER]';
    }
    return null;
}

class ConnectorsStatusTool extends Tool {
    name = 'plugin_connector_status';
    description = 'Report readiness for core connector integrations (Gmail, Slack, GitHub, Notion, databases).';
    schema = { type: 'object', properties: {}, additionalProperties: false };

    async execute(): Promise<string> {
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

    async execute(): Promise<string> {
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
            requireConfirmation: { type: 'boolean', description: 'Whether confirmation is required.' }
        },
        required: ['toolName'],
        additionalProperties: false
    };

    async execute(
        args: { toolName: string; allowed?: boolean; requireConfirmation?: boolean },
        requestConfirmation: (promptMessage: string) => Promise<boolean>
    ): Promise<string> {
        const current = getPolicy();
        const next = {
            defaultAllow: current.defaultAllow ?? true,
            tools: { ...(current.tools || {}) }
        };
        const currentRule = next.tools[args.toolName] || {};
        if (typeof args.allowed === 'boolean') currentRule.allowed = args.allowed;
        if (typeof args.requireConfirmation === 'boolean') currentRule.requireConfirmation = args.requireConfirmation;
        next.tools[args.toolName] = currentRule;
        const approved = await requestConfirmation(`Allow updating plugin policy for ${args.toolName}?`);
        if (!approved) return '[OPERATION CANCELLED BY USER]';
        savePolicy(next);
        return `Policy updated for ${args.toolName}: ${JSON.stringify(currentRule)}`;
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

    async execute(
        args: { action: 'list' | 'create'; owner: string; repo: string; title?: string; body?: string; limit?: number },
        requestConfirmation: (promptMessage: string) => Promise<boolean>
    ): Promise<string> {
        const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
        if (!token) return '[CONNECTOR ERROR]: Missing GITHUB_TOKEN or GH_TOKEN.';
        const apiBase = `https://api.github.com/repos/${args.owner}/${args.repo}/issues`;
        if (args.action === 'list') {
            const limit = Math.max(1, Math.min(Number(args.limit || 10), 50));
            const res = await fetch(`${apiBase}?state=open&per_page=${limit}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
            });
            if (!res.ok) return `[CONNECTOR ERROR]: GitHub list failed (${res.status}).`;
            const items = await res.json() as any[];
            if (!items.length) return 'No open issues.';
            return items
                .filter((x) => !x.pull_request)
                .map((x) => `#${x.number} ${x.title}`)
                .slice(0, limit)
                .join('\n');
        }
        if (!args.title?.trim()) return '[CONNECTOR ERROR]: title is required for create action.';
        const policyBlock = await enforcePolicyAndConfirm(
            this.name,
            true,
            requestConfirmation,
            `Allow plugin to create GitHub issue "${args.title}" on ${args.owner}/${args.repo}?`
        );
        if (policyBlock) return policyBlock;
        const res = await fetch(apiBase, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title: args.title, body: args.body || '' })
        });
        if (!res.ok) return `[CONNECTOR ERROR]: GitHub create failed (${res.status}).`;
        const created = await res.json() as any;
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

    async execute(args: { text: string }, requestConfirmation: (promptMessage: string) => Promise<boolean>): Promise<string> {
        const webhook = process.env.SLACK_WEBHOOK_URL;
        if (!webhook) return '[CONNECTOR ERROR]: Missing SLACK_WEBHOOK_URL.';
        const policyBlock = await enforcePolicyAndConfirm(
            this.name,
            true,
            requestConfirmation,
            `Allow plugin to post this message to Slack?\n"${args.text.slice(0, 200)}"`
        );
        if (policyBlock) return policyBlock;
        const res = await fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: args.text })
        });
        if (!res.ok) return `[CONNECTOR ERROR]: Slack webhook failed (${res.status}).`;
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

    async execute(args: { channelId: string; limit?: number }): Promise<string> {
        const token = process.env.SLACK_BOT_TOKEN;
        if (!token) return '[CONNECTOR ERROR]: Missing SLACK_BOT_TOKEN.';
        const policy = checkToolPolicy(this.name, false);
        if (!policy.allowed) return `[POLICY BLOCKED]: ${this.name} is disabled by plugin policy.`;
        const limit = Math.max(1, Math.min(Number(args.limit || 15), 50));
        const res = await fetch(`https://slack.com/api/conversations.history?channel=${encodeURIComponent(args.channelId)}&limit=${limit}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return `[CONNECTOR ERROR]: Slack history request failed (${res.status}).`;
        const data = await res.json() as any;
        if (!data.ok) return `[CONNECTOR ERROR]: Slack API error (${data.error || 'unknown'}).`;
        const messages = Array.isArray(data.messages) ? data.messages : [];
        if (!messages.length) return 'No Slack messages found.';
        return messages
            .slice(0, limit)
            .map((m: any) => `- ${m.user || 'unknown'}: ${(m.text || '').replace(/\s+/g, ' ').slice(0, 200)}`)
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

    async execute(args: { owner: string; repo: string; state?: 'open' | 'closed' | 'all'; limit?: number }): Promise<string> {
        const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
        if (!token) return '[CONNECTOR ERROR]: Missing GITHUB_TOKEN or GH_TOKEN.';
        const policy = checkToolPolicy(this.name, false);
        if (!policy.allowed) return `[POLICY BLOCKED]: ${this.name} is disabled by plugin policy.`;
        const state = args.state || 'open';
        const limit = Math.max(1, Math.min(Number(args.limit || 10), 50));
        const res = await fetch(`https://api.github.com/repos/${args.owner}/${args.repo}/pulls?state=${state}&per_page=${limit}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
        });
        if (!res.ok) return `[CONNECTOR ERROR]: GitHub PR list failed (${res.status}).`;
        const items = await res.json() as any[];
        if (!items.length) return 'No pull requests found.';
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

    async execute(
        args: { owner: string; repo: string; prNumber: number; body: string },
        requestConfirmation: (promptMessage: string) => Promise<boolean>
    ): Promise<string> {
        const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
        if (!token) return '[CONNECTOR ERROR]: Missing GITHUB_TOKEN or GH_TOKEN.';
        const policyBlock = await enforcePolicyAndConfirm(
            this.name,
            true,
            requestConfirmation,
            `Allow plugin to comment on PR #${args.prNumber} in ${args.owner}/${args.repo}?`
        );
        if (policyBlock) return policyBlock;
        const res = await fetch(`https://api.github.com/repos/${args.owner}/${args.repo}/issues/${args.prNumber}/comments`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ body: args.body })
        });
        if (!res.ok) return `[CONNECTOR ERROR]: GitHub PR comment failed (${res.status}).`;
        const body = await res.json() as any;
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

    async execute(
        args: { owner: string; repo: string; prNumber: number; mergeMethod?: 'merge' | 'squash' | 'rebase' },
        requestConfirmation: (promptMessage: string) => Promise<boolean>
    ): Promise<string> {
        const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
        if (!token) return '[CONNECTOR ERROR]: Missing GITHUB_TOKEN or GH_TOKEN.';
        const method = args.mergeMethod || 'squash';
        const policyBlock = await enforcePolicyAndConfirm(
            this.name,
            true,
            requestConfirmation,
            `Allow plugin to merge PR #${args.prNumber} in ${args.owner}/${args.repo} using ${method}?`
        );
        if (policyBlock) return policyBlock;
        const res = await fetch(`https://api.github.com/repos/${args.owner}/${args.repo}/pulls/${args.prNumber}/merge`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ merge_method: method })
        });
        if (!res.ok) return `[CONNECTOR ERROR]: GitHub PR merge failed (${res.status}).`;
        const out = await res.json() as any;
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

    async execute(args: { query: string; pageSize?: number }): Promise<string> {
        const token = process.env.NOTION_API_KEY;
        if (!token) return '[CONNECTOR ERROR]: Missing NOTION_API_KEY.';
        const pageSize = Math.max(1, Math.min(Number(args.pageSize || 10), 50));
        const res = await fetch('https://api.notion.com/v1/search', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: args.query,
                page_size: pageSize
            })
        });
        if (!res.ok) return `[CONNECTOR ERROR]: Notion search failed (${res.status}).`;
        const body = await res.json() as any;
        const results = Array.isArray(body.results) ? body.results : [];
        if (!results.length) return 'No Notion results found.';
        return results
            .slice(0, pageSize)
            .map((r: any) => {
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

    async execute(args: { dbPath: string; sql: string }): Promise<string> {
        const trimmed = args.sql.trim().toLowerCase();
        if (!trimmed.startsWith('select')) {
            return '[CONNECTOR ERROR]: Only SELECT queries are allowed.';
        }
        const dbPath = path.resolve(process.cwd(), args.dbPath);
        if (!fs.existsSync(dbPath)) return `[CONNECTOR ERROR]: Database not found at ${dbPath}`;
        try {
            const { stdout, stderr } = await execAsync(`sqlite3 -header -csv "${dbPath}" "${args.sql.replace(/"/g, '""')}"`, {
                timeout: 30000,
                maxBuffer: 1024 * 1024
            });
            if (stderr?.trim()) return `Query completed with warnings:\n${stderr.trim()}\n${stdout.trim()}`;
            return stdout.trim() || 'Query returned no rows.';
        } catch (error: any) {
            return `[CONNECTOR ERROR]: sqlite query failed (${error.message}). Ensure sqlite3 is installed.`;
        }
    }
}

class DevtoolsProjectDoctorTool extends Tool {
    name = 'plugin_devtools_project_doctor';
    description = 'Inspect local project scripts and TypeScript diagnostics readiness.';
    schema = { type: 'object', properties: {}, additionalProperties: false };

    async execute(): Promise<string> {
        const pkgPath = path.join(process.cwd(), 'package.json');
        const tsPath = path.join(process.cwd(), 'tsconfig.json');
        let scripts: Record<string, string> = {};
        if (fs.existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                scripts = pkg.scripts || {};
            } catch {
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

    async execute(args: { stack?: string }): Promise<string> {
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
    name = 'plugin_rag_status';
    description = 'Report local RAG index/readiness status and retrieval entrypoints.';
    schema = { type: 'object', properties: {}, additionalProperties: false };

    constructor(private readonly context: PluginToolContext) {
        super();
    }

    async execute(): Promise<string> {
        const indexPath = path.join(this.context.workspaceRoot, '.cortex', 'rag', 'index.json');
        const exists = fs.existsSync(indexPath);
        return [
            `RAG index path: ${indexPath}`,
            `RAG index status: ${exists ? 'present' : 'missing'}`,
            'Next step: implement embedding pipeline + retrieve_context tool backed by this index.'
        ].join('\n');
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

    async execute(args: { objective: string; maxIterations?: number }): Promise<string> {
        const maxIterations = Math.max(1, Math.min(Number(args.maxIterations || 6), 20));
        return [
            `Automation loop objective: ${args.objective}`,
            `Iteration budget: ${maxIterations}`,
            'Loop phases: Observe -> Plan -> Execute -> Verify -> Reflect -> Continue/Stop.',
            'Stop conditions: tests pass, acceptance criteria met, or iteration budget exhausted.'
        ].join('\n');
    }
}

export const BUILTIN_TOOLSET_FACTORIES: Record<string, PluginToolFactory> = {
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
    automation: () => [new AutomationLoopPlannerTool()]
};
