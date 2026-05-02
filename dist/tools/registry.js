export class ToolRegistry {
    tools = new Map();
    constructor() {
        // Automatically assigned global tools have been removed. 
        // Agents must register their own explicit capabilities in setupTools()
    }
    register(tool) {
        this.tools.set(tool.name, tool);
    }
    getTool(name) {
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
