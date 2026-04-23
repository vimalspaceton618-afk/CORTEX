/**
 * CORTEX — Stream Parser
 * Intercepts raw agent stream chunks and classifies them into
 * clean UI events instead of dumping raw debug text to the user.
 */

export type StreamEventType =
    | 'text'          // Pure LLM response text to display
    | 'tool_start'    // Agent is executing a tool
    | 'tool_result'   // Tool returned a result (suppress or summarize)
    | 'routing'       // Handing off to a subagent
    | 'brain_route'   // Which brain/model is being used (suppress)
    | 'error_fixer'   // Fallback cascade (show minimal)
    | 'loop_stop'     // Budget hit
    | 'system_error'  // Fatal error
    | 'ignored';      // Noise to fully suppress

export interface StreamEvent {
    type: StreamEventType;
    raw: string;
    label?: string;    // e.g. "ExploreAgent", "list_directory"
    summary?: string;  // Human-readable one-liner
}

// Patterns to classify raw chunks
const PATTERNS: [RegExp, StreamEventType, (m: RegExpMatchArray) => Partial<StreamEvent>][] = [
    // [AgentName BRAIN ROUTE]: provider:model
    [
        /\[(.+?)\s+BRAIN ROUTE\]:\s*(.+)/,
        'brain_route',
        (m) => ({ label: m[1], summary: `Using ${m[2].split(':').slice(-1)[0]}` })
    ],
    // [AgentName TOOL]: Executing toolName...
    [
        /\[(.+?)\s+TOOL\]:\s*Executing\s+(.+?)\.\.\./,
        'tool_start',
        (m) => ({ label: m[1], summary: m[2].replace(/_/g, ' ') })
    ],
    // [AgentName TOOL RESULT]: ...
    [
        /\[(.+?)\s+TOOL RESULT\]:\s*([\s\S]*)/,
        'tool_result',
        (m) => ({ label: m[1], summary: m[2].trim().slice(0, 120) })
    ],
    // [ROUTING]: Handing off task to AgentName...
    [
        /\[ROUTING\]:\s*Handing off task to\s+(\w+)/,
        'routing',
        (m) => ({ label: m[1], summary: `Delegating to ${m[1]}` })
    ],
    // [ROUTING]: Auto-running verification
    [
        /\[ROUTING\]:\s*Auto-running verification/,
        'routing',
        (_m) => ({ label: 'QualityAgent', summary: 'Running quality verification' })
    ],
    // [AgentName ERROR FIXER]: ...
    [
        /\[(.+?)\s+ERROR FIXER\]:\s*(.*)/,
        'error_fixer',
        (m) => ({ label: m[1], summary: m[2].slice(0, 100) })
    ],
    // [AgentName LOOP STOP]: ...
    [
        /\[(.+?)\s+LOOP STOP\]:\s*(.*)/,
        'loop_stop',
        (m) => ({ label: m[1], summary: m[2].slice(0, 100) })
    ],
    // [AgentName SYSTEM ERROR]: ...
    [
        /\[(.+?)\s+SYSTEM ERROR\]:\s*(.*)/,
        'system_error',
        (m) => ({ label: m[1], summary: m[2].slice(0, 200) })
    ],
    // [AgentName BRAIN FALLBACK]: ...
    [
        /\[(.+?)\s+BRAIN FALLBACK\]:\s*(.*)/,
        'error_fixer',
        (m) => ({ label: m[1], summary: m[2].slice(0, 100) })
    ],
];

export function parseStreamChunk(chunk: string): StreamEvent {
    const trimmed = chunk.trim();

    for (const [pattern, type, extract] of PATTERNS) {
        const match = trimmed.match(pattern);
        if (match) {
            return { type, raw: chunk, ...extract(match) };
        }
    }

    // Pure text — show to user
    if (trimmed.length > 0) {
        return { type: 'text', raw: chunk };
    }

    return { type: 'ignored', raw: chunk };
}

// Friendly tool name map
const TOOL_LABELS: Record<string, string> = {
    list_directory: 'Listed directory',
    read_file: 'Read file',
    write_file: 'Wrote file',
    delete_file: 'Deleted file',
    search_files: 'Searched files',
    run_shell: 'Ran command',
    shell: 'Ran command',
    execute_shell: 'Ran command',
    web_search: 'Searched web',
    navigate_browser: 'Navigated browser',
    delegate_task: 'Delegated task',
    list_plugins: 'Listed plugins',
    git_command: 'Git operation',
};

export function getFriendlyToolLabel(toolName: string): string {
    return TOOL_LABELS[toolName] || toolName.replace(/_/g, ' ');
}

// Agent emoji map
export const AGENT_ICONS: Record<string, string> = {
    AgentManager: '◆',
    ExploreAgent: '◎',
    PlanAgent: '◈',
    DeveloperAgent: '◉',
    QualityAgent: '◍',
    DevOpsAgent: '◑',
    BrowserAgent: '◐',
    NetworkAgent: '◒',
    MythosAgent: '◆',
};

export function getAgentIcon(name: string): string {
    return AGENT_ICONS[name] || '●';
}
