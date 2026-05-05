import { BaseAgent } from '../core/agent/BaseAgent.js';
import { ReadFileTool, WriteFileTool, ListDirTool } from '../tools/FileSystem.js';
import { AnalyzeImageTool } from '../tools/Vision.js';
import puppeteer, { Browser, Page, LaunchOptions } from 'puppeteer';
import { Tool } from '../tools/Tool.js';
import { resolveInsideWorkspace } from '../tools/PathSecurity.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Advanced Browser Discovery Engine
 * Supports: Chrome, Brave, Firefox, Edge, and Tor.
 */
function getBrowserCandidates(): Record<string, string[]> {
    const candidates: Record<string, string[]> = {
        chrome: [
            process.env.PUPPETEER_EXECUTABLE_PATH || '',
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
        ],
        brave: [
            'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
            path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe')
        ],
        edge: [
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
        ],
        firefox: [
            'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
            path.join(process.env.LOCALAPPDATA || '', 'Mozilla Firefox\\firefox.exe')
        ],
        tor: [
            path.join(process.env.DESKTOP || path.join(process.env.USERPROFILE || '', 'Desktop'), 'Tor Browser\\Browser\\firefox.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Tor Browser\\Browser\\firefox.exe')
        ]
    };

    const found: Record<string, string[]> = {};
    for (const [key, paths] of Object.entries(candidates)) {
        found[key] = paths.filter(p => p && fs.existsSync(path.normalize(p)));
    }
    return found;
}

// ─── TOOLS ──────────────────────────────────────────────────────────────────

class BrowserNavigateTool extends Tool {
    name = 'browser_navigate';
    description = 'Navigate to a URL. Support for stealth mode and custom User-Agents.';
    schema = {
        type: 'object',
        properties: { 
            url: { type: 'string', description: 'Target URL.' },
            userAgent: { type: 'string', description: 'Optional custom User-Agent.' }
        },
        required: ['url'],
        additionalProperties: false
    };
    constructor(private readonly owner: BrowserAgent) { super(); }
    async execute(args: { url: string; userAgent?: string }): Promise<string> {
        const page = await this.owner.ensurePage();
        if (args.userAgent) await page.setUserAgent(args.userAgent);
        await page.goto(args.url, { waitUntil: 'networkidle2', timeout: 60000 });
        return `Navigated to ${args.url}\nTitle: ${await page.title()}`;
    }
}

class BrowserActionTool extends Tool {
    name = 'browser_action';
    description = 'Perform interactive actions: click, type, scroll, or press key.';
    schema = {
        type: 'object',
        properties: {
            action: { type: 'string', enum: ['click', 'type', 'press', 'scroll'] },
            selector: { type: 'string', description: 'CSS selector for the element.' },
            text: { type: 'string', description: 'Text to type or key to press.' },
            x: { type: 'number', description: 'Scroll X offset.' },
            y: { type: 'number', description: 'Scroll Y offset.' }
        },
        required: ['action'],
        additionalProperties: false
    };
    constructor(private readonly owner: BrowserAgent) { super(); }
    async execute(args: { action: string; selector?: string; text?: string; x?: number; y?: number }): Promise<string> {
        const page = await this.owner.ensurePage();
        switch (args.action) {
            case 'click':
                if (!args.selector) throw new Error('Selector required for click');
                await page.click(args.selector);
                return `Clicked ${args.selector}`;
            case 'type':
                if (!args.selector || !args.text) throw new Error('Selector and text required for type');
                await page.type(args.selector, args.text, { delay: 50 });
                return `Typed text into ${args.selector}`;
            case 'press':
                if (!args.text) throw new Error('Key text required for press');
                await page.keyboard.press(args.text as any);
                return `Pressed key: ${args.text}`;
            case 'scroll':
                await page.evaluate((x, y) => window.scrollBy(x || 0, y || 0), args.x, args.y);
                return `Scrolled by ${args.x || 0}, ${args.y || 0}`;
            default:
                throw new Error(`Unknown action: ${args.action}`);
        }
    }
}

class BrowserProxyTool extends Tool {
    name = 'browser_set_config';
    description = 'Set browser proxy (e.g. for Tor) or browser type (chrome, firefox, tor).';
    schema = {
        type: 'object',
        properties: {
            proxy: { type: 'string', description: 'Proxy server (e.g. socks5://127.0.0.1:9050)' },
            browserType: { type: 'string', enum: ['chrome', 'brave', 'firefox', 'edge', 'tor'] }
        },
        additionalProperties: false
    };
    constructor(private readonly owner: BrowserAgent) { super(); }
    async execute(args: { proxy?: string; browserType?: string }): Promise<string> {
        if (args.proxy) this.owner.setProxy(args.proxy);
        if (args.browserType) this.owner.setBrowserType(args.browserType);
        await this.owner.closeBrowser(); // Restart needed to apply launch args
        return `Browser config updated. Next navigation will use ${args.browserType || 'default'} browser ${args.proxy ? 'via ' + args.proxy : ''}.`;
    }
}

class BrowserScreenshotTool extends Tool {
    name = 'browser_screenshot';
    description = 'Capture high-resolution screenshot.';
    schema = {
        type: 'object',
        properties: { filePath: { type: 'string' } },
        required: ['filePath'],
        additionalProperties: false
    };
    constructor(private readonly owner: BrowserAgent) { super(); }
    async execute(args: { filePath: string }): Promise<string> {
        const page = await this.owner.ensurePage();
        const target = resolveInsideWorkspace(args.filePath);
        await page.screenshot({ path: target, fullPage: true });
        return `Screenshot saved to ${target}`;
    }
}

class BrowserGetContentTool extends Tool {
    name = 'browser_get_content';
    description = 'Extract text or HTML content.';
    schema = {
        type: 'object',
        properties: { format: { type: 'string', enum: ['text', 'html'] } },
        additionalProperties: false
    };
    constructor(private readonly owner: BrowserAgent) { super(); }
    async execute(args: { format?: 'text' | 'html' }): Promise<string> {
        const page = await this.owner.ensurePage();
        if (args.format === 'html') return await page.content();
        return await page.evaluate(() => document.body?.innerText || '');
    }
}

// ─── AGENT ──────────────────────────────────────────────────────────────────

export class BrowserAgent extends BaseAgent {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private proxy: string | null = null;
    private browserType: string = 'chrome';

    constructor() {
        super(
            "BrowserAgent",
            "Ultimate Unrestricted Browsing Agent. Capable of cross-browser execution (Chrome, Firefox, Tor, Brave) and interactive web automation. Use `browser_set_config` to switch to Tor or Firefox for privacy-sensitive research."
        );
    }

    protected setupTools(): void {
        this.registry.register(new ReadFileTool());
        this.registry.register(new WriteFileTool());
        this.registry.register(new ListDirTool());
        this.registry.register(new AnalyzeImageTool());
        this.registry.register(new BrowserNavigateTool(this));
        this.registry.register(new BrowserActionTool(this));
        this.registry.register(new BrowserProxyTool(this));
        this.registry.register(new BrowserScreenshotTool(this));
        this.registry.register(new BrowserGetContentTool(this));
    }

    public setProxy(proxy: string) { this.proxy = proxy; }
    public setBrowserType(type: string) { this.browserType = type; }

    public async ensurePage(): Promise<Page> {
        if (!this.browser) {
            const candidates = getBrowserCandidates();
            const typeList = this.browserType === 'tor' ? ['tor', 'firefox'] : [this.browserType, 'chrome', 'edge'];
            
            let executablePath: string | undefined;
            for (const type of typeList) {
                if (candidates[type] && candidates[type].length > 0) {
                    executablePath = candidates[type][0];
                    break;
                }
            }

            const launchArgs = [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-infobars',
                '--window-position=0,0',
                '--ignore-certifcate-errors',
                '--ignore-certifcate-errors-spki-list',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ];

            if (this.proxy) launchArgs.push(`--proxy-server=${this.proxy}`);

            const options: any = {
                headless: true,
                executablePath,
                args: launchArgs,
                ignoreHTTPSErrors: true
            };

            this.browser = await puppeteer.launch(options);
            this.browser.process()?.unref();
        }
        
        if (!this.page) {
            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1920, height: 1080 });
            // Stealth headers
            await this.page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
            });
        }
        return this.page;
    }

    public async closeBrowser() {
        if (this.browser) await this.browser.close();
        this.browser = null;
        this.page = null;
    }
}

