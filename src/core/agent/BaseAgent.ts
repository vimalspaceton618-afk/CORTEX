import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { ToolRegistry } from '../../tools/registry.js';
import { Message } from '../llm.js';

dotenv.config();

let clientInstance: OpenAI | null = null;
function getClient(): OpenAI {
  if (!clientInstance) {
    clientInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "dummy-key",
      baseURL: process.env.OPENAI_BASE_URL,
    });
  }
  return clientInstance;
}

export abstract class BaseAgent {
    protected history: Message[] = [];
    protected registry = new ToolRegistry();
    public name: string;
    
    constructor(name: string, systemPrompt: string) {
        this.name = name;
        this.history.push({
            role: 'system',
            content: systemPrompt
        });
        this.setupTools();
    }

    protected abstract setupTools(): void;

    public async *run(input: string, requestConfirmation: (msg: string) => Promise<boolean>): AsyncGenerator<string> {
        this.history.push({ role: 'user', content: input });

        let keepRunning = true;
        
        while (keepRunning) {
            let currentResponse = "";
            let currentToolCalls: Record<number, any> = {};

            try {
                // If there are no tools registered for this agent, don't pass 'tools' key to OpenAI
                const toolsConfig = this.registry.getToolsSchema().length > 0 
                  ? { tools: this.registry.getToolsSchema() as any } 
                  : {};

                const stream = await getClient().chat.completions.create({
                    model: process.env.AI_MODEL || 'gpt-4o',
                    messages: this.history as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                    stream: true,
                    ...toolsConfig
                });

                for await (const chunk of stream) {
                    const delta = chunk.choices[0]?.delta;
                    
                    if (delta?.content) {
                        currentResponse += delta.content;
                        // Yield agent specific prefix
                        yield delta.content;
                    }
                    
                    if (delta?.tool_calls) {
                        for (const toolCall of delta.tool_calls) {
                            const index = toolCall.index;
                            if (!currentToolCalls[index]) {
                                currentToolCalls[index] = { id: toolCall.id, type: 'function', function: { name: toolCall.function?.name, arguments: '' }};
                            }
                            if (toolCall.function?.arguments) {
                                currentToolCalls[index].function.arguments += toolCall.function.arguments;
                            }
                        }
                    }
                }

                const toolCallsArray = Object.values(currentToolCalls);
                
                if (toolCallsArray.length > 0) {
                    this.history.push({ role: 'assistant', content: currentResponse || null, tool_calls: toolCallsArray });
                    
                    for (const toolCall of toolCallsArray) {
                        const toolName = toolCall.function.name;
                        const tool = this.registry.getTool(toolName);
                        
                        yield `\n\n[${this.name} TOOL]: Executing ${toolName}...`;
                        
                        let resultStr = "";
                        if (tool) {
                            try {
                                const args = JSON.parse(toolCall.function.arguments);
                                const executionResult = await tool.execute(args, requestConfirmation);
                                if (executionResult && typeof (executionResult as any)[Symbol.asyncIterator] === 'function') {
                                    for await (const chunk of executionResult as any) {
                                        yield chunk;
                                        resultStr += chunk;
                                    }
                                } else {
                                    resultStr = executionResult as string;
                                }
                            } catch (e: any) {
                                resultStr = `[TOOL PARSE OR EXECUTION ERROR]: ${e.message}`;
                            }
                        } else {
                            resultStr = `[ERROR]: Tool ${toolName} not found.`;
                        }
                        
                        this.history.push({ role: 'tool', tool_call_id: toolCall.id, name: toolName, content: resultStr });
                        yield `\n[${this.name} TOOL RESULT]: ${resultStr.substring(0, 100)}...\n`;
                    }
                } else {
                    this.history.push({ role: 'assistant', content: currentResponse });
                    keepRunning = false;
                }

            } catch (error: any) {
                const errorMessage = `\n[${this.name} SYSTEM ERROR]: ${error.message}`;
                yield errorMessage;
                this.history.push({ role: 'assistant', content: errorMessage });
                keepRunning = false;
            }
        }
    }
}
