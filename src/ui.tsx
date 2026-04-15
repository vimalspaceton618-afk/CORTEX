import React, { useState, useRef, useEffect } from 'react';

const Spinner = () => {
    const frames = ['·', '✦', '★', '✦'];
    const [frame, setFrame] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setFrame((current) => (current + 1) % frames.length);
        }, 150);
        return () => clearInterval(timer);
    }, []);

    return <Text color="magentaBright"> {frames[frame]} </Text>;
};
import { Box, Text, useInput, useApp } from 'ink';
import { AgentManager } from './core/agent/AgentManager.js';
import { collectHealthStatus, formatHealthReport } from './core/health.js';

const App = () => {
  const { exit } = useApp();
  const [isTrusted, setIsTrusted] = useState(false);
  const [trustCursor, setTrustCursor] = useState(1);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<{role: string, content: string}[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [confirmPrompt, setConfirmPrompt] = useState<{message: string, resolve: (val: boolean) => void} | null>(null);
  
  const orchestrator = useRef(new AgentManager()).current;

  useInput((char, key) => {
    if (!isTrusted) {
      if (char === '1' || (key.return && trustCursor === 1)) {
        process.env.CORTEX_WORKSPACE_ROOT = process.cwd();
        setIsTrusted(true);
      } else if (char === '2' || (key.return && trustCursor === 2) || key.escape) {
        exit();
      } else if (key.upArrow) {
        setTrustCursor(1);
      } else if (key.downArrow) {
        setTrustCursor(2);
      }
      return;
    }

    // If we are showing a confirmation prompt, intercept keys for Y/N only
    if (confirmPrompt) {
      const lower = char?.toLowerCase();
      if (lower === 'y') {
        confirmPrompt.resolve(true);
        setConfirmPrompt(null);
      } else if (lower === 'n') {
        confirmPrompt.resolve(false);
        setConfirmPrompt(null);
      } else if (key.return) {
        confirmPrompt.resolve(true);
        setConfirmPrompt(null);
      }
      return; // exit early
    }

    if (key.return && !isStreaming) {
      if (input.trim().length > 0) {
        const query = input.trim();
        
        // Intercept local commands
        const lowerQuery = query.toLowerCase();
        if (lowerQuery === 'exit' || lowerQuery === 'quit' || lowerQuery === '/exit' || lowerQuery === '/quit') {
            exit();
            return;
        }

        if (lowerQuery === 'help' || lowerQuery === '/help') {
            setInput('');
            const helpText = "CORTEX System Commands:\n" +
              "  /help      - Show this help message\n" +
              "  /health    - Show runtime readiness checks\n" +
              "  /plugins   - Show plugin catalog\n" +
              "  /dashboard - Toggle live system monitoring\n" +
              "  /exit      - Quit the application\n\n" +
              "Agents Available:\n" +
              "  - ExploreAgent   : Research and file exploration\n" +
              "  - PlanAgent      : Task planning\n" +
              "  - DeveloperAgent : Code writing\n" +
              "  - QualityAgent   : Testing and linting\n" +
              "  - DevOpsAgent    : Deployment and infra\n" +
              "  - BrowserAgent   : Web interaction\n\n" +
              "Note: To use the AI capabilities, ensure you have set OPENAI_API_KEY in your .env file.";
            setHistory(prev => [...prev, { role: 'user', content: query }, { role: 'assistant', content: helpText }]);
            return;
        }

        if (lowerQuery === '/health') {
            setInput('');
            const status = collectHealthStatus();
            setHistory(prev => [...prev, { role: 'user', content: query }, { role: 'assistant', content: formatHealthReport(status) }]);
            return;
        }

        if (lowerQuery === '/plugins') {
            setInput('');
            setHistory(prev => [...prev, { role: 'user', content: query }, { role: 'assistant', content: 'Run: "list all plugins and categories" to invoke the plugin catalog via AgentManager.' }]);
            return;
        }

        if (lowerQuery === '/dashboard') {
            setInput('');
            setHistory(prev => [...prev, { role: 'user', content: query }, { role: 'assistant', content: 'Dashboard feature is currently under development.' }]);
            return;
        }

        setInput('');
        setHistory(prev => [...prev, { role: 'user', content: query }, { role: 'assistant', content: '' }]);
        setIsStreaming(true);

        const runStream = async () => {
             const askConfirm = (msg: string) => {
                 return new Promise<boolean>((resolve) => {
                     setConfirmPrompt({ message: msg, resolve: (val) => { console.clear(); resolve(val); } });
                 });
             };

             const stream = orchestrator.delegateTask(query, askConfirm);
             let fullText = "";
             for await (const chunk of stream) {
                 fullText += chunk;
                 setHistory(prev => {
                     const updated = [...prev];
                     updated[updated.length - 1] = { role: 'assistant', content: fullText };
                     return updated;
                 });
             }
             orchestrator.recordTurn(query, fullText);
             setIsStreaming(false);
        };
        runStream();
      }
    } else if (key.backspace || key.delete) {
      if (!isStreaming) setInput((prev) => prev.slice(0, -1));
    } else {
      if (!isStreaming && char && !key.upArrow && !key.downArrow && !key.leftArrow && !key.rightArrow && !key.ctrl && !key.meta) {
        setInput((prev) => prev + char);
      }
    }
  });

  if (!isTrusted) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color="yellowBright" bold>Accessing workspace:</Text>
        <Box marginY={1}>
          <Text>{process.cwd()}</Text>
        </Box>
        <Text>Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source</Text>
        <Text>project, or work from your team). If not, take a moment to review what's in this folder first.</Text>
        <Box marginY={1}>
          <Text>CORTEX System'll be able to read, edit, and execute files here.</Text>
        </Box>
        <Text color="gray">Security guide</Text>
        <Box flexDirection="column" marginY={1}>
          <Text color={trustCursor === 1 ? "blueBright" : "white"}>{trustCursor === 1 ? '❯ 1. Yes, I trust this folder' : '  1. Yes, I trust this folder'}</Text>
          <Text color={trustCursor === 2 ? "blueBright" : "white"}>{trustCursor === 2 ? '❯ 2. No, exit' : '  2. No, exit'}</Text>
        </Box>
        <Text color="gray">Enter to confirm · Esc to cancel</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={100}>
      <Box marginBottom={1}>
        <Text color="cyanBright" bold>CORTEX System v3.0 </Text>
        <Text color="gray">{'─'.repeat(81)}</Text>
      </Box>

      <Box borderStyle="round" borderColor="gray" paddingX={4} paddingY={2} justifyContent="space-between">
        <Box flexDirection="column" alignItems="center" width="40%">
          <Text bold color="white">Welcome back!</Text>
          <Box marginY={1} flexDirection="column" alignItems="center">
            <Text color="#F13E93">{'    ██████    '}</Text>
            <Text color="#F13E93">{'  ██████████  '}</Text>
            <Text color="#F13E93">{'██████████████'}</Text>
            <Text color="#F13E93">{'██  ██████  ██'}</Text>
            <Text color="#F13E93">{'██████████████'}</Text>
            <Text color="#F13E93">{'  ██      ██  '}</Text>
          </Box>
          <Text color="gray">CORTEX Multi-Agent OS · 13 Tools</Text>
          <Text color="gray">E:\CORTEX</Text>
        </Box>

        <Box flexDirection="column" width="55%">
          <Text color="gray">Tips for getting started</Text>
          <Text color="gray">Run /help to see all available commands and agents.</Text>
          <Text color="gray">Run /dashboard to toggle live system monitoring.</Text>
          <Box marginY={1}></Box>
          <Text color="gray">Recent activity</Text>
          <Text color="gray">Model weights loaded cleanly</Text>
          <Text color="gray">No missed memory syncs</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1} marginBottom={1} width="100%">
        {history.map((msg, index) => (
          <Box 
            key={index} 
            flexDirection="column" 
            marginBottom={1}
            paddingX={2}
            paddingY={1}
            borderStyle="round"
            borderColor={msg.role === 'user' ? 'green' : 'cyan'}
            alignSelf={msg.role === 'user' ? 'flex-end' : 'flex-start'}
            width="80%"
          >
            <Text color={msg.role === 'user' ? 'greenBright' : 'cyanBright'} bold>
              {msg.role === 'user' ? 'User' : 'CORTEX'}
            </Text>
            <Text>{msg.content}</Text>
          </Box>
        ))}
      </Box>

      {confirmPrompt && (
        <Box borderStyle="bold" borderColor="yellow" padding={1} flexDirection="column" marginY={1}>
          <Text color="yellowBright" bold>⚡ SECURE APPROVAL REQUIRED ⚡</Text>
          <Text>{confirmPrompt.message}</Text>
        </Box>
      )}

      {!confirmPrompt && (
        <Box marginTop={1} paddingX={2} paddingY={1} borderStyle="round" borderColor="magenta">
          <Text color="cyanBright" bold>cortex&gt; </Text>
          <Text>{input}</Text>
          {isStreaming ? <Spinner /> : <Text color="gray">{'|'}</Text>}
        </Box>
      )}
    </Box>
  );
};

export default App;
