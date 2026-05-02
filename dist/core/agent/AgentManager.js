import { BaseAgent } from './BaseAgent.js';
import * as subagents from '../../agents/index.js';
import { SharedContext } from './SharedContext.js';
import { getPluginManager } from '../../plugins/index.js';
class DelegateTaskTool {
    name = "delegate_task";
    description = "Delegate a task to a specialized subagent with strict handoff context. The subagents available are: DeveloperAgent, ExploreAgent, PlanAgent, QualityAgent, DevOpsAgent, BrowserAgent, NetworkAgent, BigrockAgent.";
    schema = {
        type: "object",
        properties: {
            agentName: {
                type: "string",
                enum: ["DeveloperAgent", "ExploreAgent", "PlanAgent", "QualityAgent", "DevOpsAgent", "BrowserAgent", "NetworkAgent", "BigrockAgent"],
                description: "The name of the specialized agent to route to"
            },
            prompt: {
                type: "string",
                description: "The highly descriptive prompt and context passing all necessary detail down to the subagent."
            },
            goal: {
                type: "string",
                description: "A concise objective for the delegated task."
            },
            constraints: {
                type: "array",
                items: { type: "string" },
                description: "Hard constraints to follow."
            },
            absolutePaths: {
                type: "array",
                items: { type: "string" },
                description: "Absolute file paths relevant to the task."
            },
            doneDefinition: {
                type: "string",
                description: "What complete and successful outcome means."
            },
            contextSummary: {
                type: "string",
                description: "Compact context from the parent reasoning loop."
            },
            requiresVerification: {
                type: "boolean",
                description: "Whether to auto-run quality verification after task completion."
            },
            maxIterations: {
                type: "number",
                description: "Optional loop budget for delegated run."
            },
            maxDurationMs: {
                type: "number",
                description: "Optional time budget for delegated run."
            }
        },
        required: ["agentName"]
    };
    async *execute(args, requestConfirmation) {
        const { agentName, prompt = "", goal = "", constraints = [], absolutePaths = [], doneDefinition = "", contextSummary = "", requiresVerification, maxIterations, maxDurationMs } = args;
        const AgentClass = subagents[agentName];
        if (!AgentClass) {
            return `[ERROR]: Failed to delegate to ${agentName}. Agent not found.`;
        }
        const memoryBlock = SharedContext.buildMemoryBlock();
        const handoffPrompt = [
            "DELEGATED TASK HANDOFF",
            goal ? `Goal:\n${goal}` : "",
            contextSummary ? `Context Summary:\n${contextSummary}` : "",
            constraints.length ? `Constraints:\n- ${constraints.join('\n- ')}` : "",
            absolutePaths.length ? `Absolute Paths:\n- ${absolutePaths.join('\n- ')}` : "",
            doneDefinition ? `Done Definition:\n${doneDefinition}` : "",
            maxIterations ? `Execution Budget Max Iterations:\n${maxIterations}` : "",
            maxDurationMs ? `Execution Budget Max Duration Ms:\n${maxDurationMs}` : "",
            prompt ? `Additional Instructions:\n${prompt}` : "",
            memoryBlock ? memoryBlock.trim() : ""
        ].filter(Boolean).join('\n\n');
        const agent = new AgentClass();
        yield `\n[ROUTING]: Handing off task to ${agentName}...\n`;
        const stream = agent.run(handoffPrompt, requestConfirmation);
        let subOutput = "";
        for await (const chunk of stream) {
            yield chunk;
            subOutput += chunk;
        }
        SharedContext.appendAudit({
            event: "delegate_task",
            agentName,
            goal: goal || prompt?.slice(0, 200),
            requiresVerification: Boolean(requiresVerification),
            maxIterations: typeof maxIterations === 'number' ? maxIterations : null,
            maxDurationMs: typeof maxDurationMs === 'number' ? maxDurationMs : null
        });
        const shouldVerify = agentName === "DeveloperAgent" && requiresVerification !== false;
        if (shouldVerify) {
            const QualityAgent = subagents.QualityAgent;
            if (QualityAgent) {
                yield `\n[ROUTING]: Auto-running verification via QualityAgent...\n`;
                const verifier = new QualityAgent();
                const verifyPrompt = [
                    "Run a bounded quality verification pass.",
                    "1) Inspect package scripts and use lint/test scripts if present.",
                    "2) If scripts are missing, use a safe fallback check.",
                    "3) Report concrete failures and likely fixes.",
                    `Developer output excerpt:\n${subOutput.slice(0, 6000)}`
                ].join('\n');
                const verifyStream = verifier.run(verifyPrompt, requestConfirmation);
                let verifyOutput = "";
                for await (const chunk of verifyStream) {
                    yield chunk;
                    verifyOutput += chunk;
                }
                SharedContext.appendAudit({
                    event: "quality_verification",
                    sourceAgent: agentName,
                    verifier: "QualityAgent"
                });
                subOutput += `\n\n[VERIFICATION]\n${verifyOutput}`;
            }
        }
        return "Task finished. Subagent output: " + subOutput;
    }
}
class ListPluginsTool {
    name = "list_plugins";
    description = "List available plugin manifests and categories.";
    schema = {
        type: "object",
        properties: {},
        additionalProperties: false
    };
    async execute() {
        const manifests = getPluginManager().list();
        if (!manifests.length)
            return "No plugins discovered.";
        return manifests
            .map((m) => `- ${m.id} [${m.category}] v${m.version} (${m.source || 'builtin'})`)
            .join('\n');
    }
}
export class AgentManager extends BaseAgent {
    constructor() {
        super("AgentManager", `You are CORTEX, a sovereign AI infrastructure system and expert software engineering orchestrator. You run securely on the local host with full authorization to read, write, execute, and delegate tasks.

## Your Role
Understand what the user needs and route it intelligently to the best specialized subagent, or handle it directly if trivial.

## Available Subagents
- **ExploreAgent**: Reading files, understanding codebases, gathering context
- **PlanAgent**: Breaking down complex tasks, writing specs and implementation plans
- **DeveloperAgent**: Writing, editing, and refactoring code — the primary builder
- **QualityAgent**: Testing, reviewing, and verifying completed work
- **DevOpsAgent**: Infrastructure, CI/CD, environment setup, deployments
- **BrowserAgent**: Web browsing, scraping, and online research
- **NetworkAgent**: Network diagnostics and API testing
- **BigrockAgent**: Local sovereign AI for deterministic logic, math, and high-security reasoning

## Output Guidelines
- Be concise and professional. No fluff.
- ALWAYS provide subagents with FULL absolute file paths.
- Instruct subagents to use their tools (write_file, delete_file) to execute changes — never just print code.
- Do NOT mention internal system paths (e.g. E:\\CORTEX\\...) in replies unless the user explicitly asks.
- If the user wants to exit, simply say 'Goodbye.'
- Format responses in clean markdown where appropriate.

## Workspace
Current working directory: ${process.env.CORTEX_WORKSPACE_ROOT || process.cwd()}`);
        SharedContext.init();
    }
    setupTools() {
        this.registry.register(new DelegateTaskTool());
        this.registry.register(new ListPluginsTool());
    }
    async *delegateTask(input, requestConfirmation) {
        const memoryBlock = SharedContext.buildMemoryBlock();
        const enrichedInput = memoryBlock
            ? `${input}\n\nUse available session memory when relevant.\n${memoryBlock}`
            : input;
        SharedContext.updateSession({ lastUserInput: input });
        yield* this.run(enrichedInput, requestConfirmation);
    }
    recordTurn(userInput, assistantOutput) {
        const conciseSummary = `${userInput.slice(0, 160)} -> ${assistantOutput.slice(0, 220)}`;
        SharedContext.updateSession({
            lastUserInput: userInput,
            lastAssistantOutput: assistantOutput,
            rollingSummary: conciseSummary
        });
        SharedContext.appendAudit({
            event: "turn_completed",
            userInputPreview: userInput.slice(0, 120)
        });
    }
}
