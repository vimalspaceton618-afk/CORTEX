import { BaseAgent } from '../core/agent/BaseAgent.js';
import { ReadFileTool, WriteFileTool } from '../tools/FileSystem.js';
import { ShellTool } from '../tools/Shell.js';
/**
 * MythosAgent
 * The autonomous cybersecurity researcher that uses the BIGROCK Mythos Engine
 * to map architectures and find "Myth Gaps".
 */
export class MythosAgent extends BaseAgent {
    constructor() {
        super("MythosAgent", "You are the Mythos Threat Intelligence Agent. You use the Mythos ontological graph to scan architectures, find missing defensive capabilities ('Myth Gaps'), and orchestrate the CORTEX swarm to patch them.");
    }
    setupTools() {
        this.registry.register(new ReadFileTool());
        this.registry.register(new WriteFileTool());
        this.registry.register(new ShellTool());
    }
}
