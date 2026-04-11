import { BaseAgent } from '../core/agent/BaseAgent.js';
import { ShellTool } from '../tools/Shell.js';
import { ReadFileTool, WriteFileTool } from '../tools/FileSystem.js';
import { AnalyzeImageTool } from '../tools/Vision.js';
import puppeteer, { Browser, Page } from 'puppeteer';

export class BrowserAgent extends BaseAgent {
    private browser: Browser | null = null;
    private page: Page | null = null;

    constructor() {
        super(
            "BrowserAgent",
            "You are the Browser Agent. You can visually inspect web apps and take screenshots to verify UI. CRITICAL INSTRUCTION: If you write or generate any code (like HTML/CSS), you MUST use the `write_file` tool to save the code to the file system. DO NOT output massive raw code strings to the chat interface unless specifically asked."
        );
    }

    protected setupTools(): void {
        this.registry.register(new ShellTool());
        this.registry.register(new ReadFileTool());
        this.registry.register(new WriteFileTool());
        this.registry.register(new AnalyzeImageTool());
        // Custom browser tools could be added here later (e.g. `takeScreenshot`, `clickElement`)
    }

    public async launchBrowser() {
        this.browser = await puppeteer.launch({ headless: true });
        this.page = await this.browser.newPage();
    }

    public async takeScreenshot(url: string, path: string) {
        if (!this.page) throw new Error("Browser not launched");
        await this.page.goto(url);
        await this.page.screenshot({ path });
    }

    public async closeBrowser() {
        if (this.browser) await this.browser.close();
    }
}
