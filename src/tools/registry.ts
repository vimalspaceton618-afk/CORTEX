import { Tool } from './Tool.js';
import { ShellTool } from './Shell.js';
import { ReadFileTool } from './FileSystem.js';

export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();

    constructor() {
        this.register(new ShellTool());
        this.register(new ReadFileTool());
    }

    register(tool: Tool) {
        this.tools.set(tool.name, tool);
    }

    getTool(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    getToolsSchema() {
        return Array.from(this.tools.values()).map(tool => ({
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.schema
            }
        }));
    }
}
