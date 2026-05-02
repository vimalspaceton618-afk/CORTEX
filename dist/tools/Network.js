import { Tool } from './Tool.js';
class HttpRequestTool extends Tool {
    name = 'http_request';
    description = 'Perform HTTP requests for network operations and API integrations.';
    schema = {
        type: 'object',
        properties: {
            method: { type: 'string', description: 'HTTP method (GET, POST, PUT, PATCH, DELETE).' },
            url: { type: 'string', description: 'Target URL.' },
            headers: { type: 'object', description: 'Optional headers map.' },
            body: { type: 'string', description: 'Optional request body as string.' },
            maxChars: { type: 'number', description: 'Maximum response size to return.' }
        },
        required: ['method', 'url'],
        additionalProperties: false
    };
    async execute(args, requestConfirmation) {
        const method = args.method.toUpperCase();
        const isMutating = method !== 'GET' && method !== 'HEAD';
        if (isMutating) {
            const approved = await requestConfirmation(`Allow network ${method} request to ${args.url}?`);
            if (!approved)
                return '[OPERATION CANCELLED BY USER]';
        }
        try {
            const response = await fetch(args.url, {
                method,
                headers: args.headers,
                body: args.body
            });
            const text = await response.text();
            const maxChars = Math.max(200, Math.min(Number(args.maxChars || 6000), 50000));
            const clipped = text.length > maxChars ? `${text.slice(0, maxChars)}\n...[truncated]` : text;
            return [
                `status=${response.status}`,
                `ok=${response.ok}`,
                `url=${response.url}`,
                clipped
            ].join('\n');
        }
        catch (error) {
            return `[NETWORK ERROR]: ${error.message}`;
        }
    }
}
class ServiceProbeTool extends Tool {
    name = 'probe_services';
    description = 'Probe network service endpoints and report availability.';
    schema = {
        type: 'object',
        properties: {
            urls: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of URLs to probe.'
            }
        },
        required: ['urls'],
        additionalProperties: false
    };
    async execute(args) {
        const targets = Array.isArray(args.urls) ? args.urls.slice(0, 20) : [];
        const lines = [];
        for (const url of targets) {
            try {
                const res = await fetch(url, { method: 'GET' });
                lines.push(`- ${url} -> ${res.status}`);
            }
            catch (error) {
                lines.push(`- ${url} -> ERROR (${error.message})`);
            }
        }
        return lines.join('\n') || 'No endpoints supplied.';
    }
}
export { HttpRequestTool, ServiceProbeTool };
