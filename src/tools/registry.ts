import { Tool } from './Tool.js';
import { ShellTool } from './Shell.js';
import { ReadFileTool } from './FileSystem.js';

export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();

    constructor() {
        // Automatically assigned global tools have been removed. 
        // Agents must register their own explicit capabilities in setupTools()
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
