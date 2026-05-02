import { Tool } from './Tool.js';
import * as fs from 'fs/promises';
import ts from 'typescript';
import { resolveInsideWorkspace } from './PathSecurity.js';
export class ASTMutatorTool extends Tool {
    name = "ast_mutate";
    description = "Surgically replaces an entire function or class declaration using AST parsing. Highly reliable, ignores whitespace drift.";
    schema = {
        type: "object",
        properties: {
            filePath: { type: "string" },
            targetName: { type: "string", description: "The exact name of the function or class to replace." },
            replacementCode: { type: "string", description: "The complete new code block (e.g. 'function foo() { ... }')" }
        },
        required: ["filePath", "targetName", "replacementCode"],
        additionalProperties: false
    };
    async execute(args, requestConfirmation) {
        const resolvedPath = resolveInsideWorkspace(args.filePath);
        const approved = await requestConfirmation(`Allow AST mutation of ${args.targetName} in ${resolvedPath}?`);
        if (!approved)
            return "[OPERATION CANCELLED BY USER]";
        try {
            const sourceText = await fs.readFile(resolvedPath, 'utf-8');
            const sourceFile = ts.createSourceFile(resolvedPath, sourceText, ts.ScriptTarget.Latest, true);
            let targetNode = null;
            // Simple AST walk to find the named declaration
            function visit(node) {
                if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isMethodDeclaration(node)) && node.name && node.name.getText() === args.targetName) {
                    targetNode = node;
                }
                ts.forEachChild(node, visit);
            }
            visit(sourceFile);
            if (!targetNode) {
                return `[AST ERROR]: Could not find function or class named '${args.targetName}' in the AST.`;
            }
            const node = targetNode;
            const start = node.getStart(sourceFile);
            const end = node.getEnd();
            const newContent = sourceText.slice(0, start) + args.replacementCode + sourceText.slice(end);
            await fs.writeFile(resolvedPath, newContent, 'utf-8');
            return `✅ AST Mutation Successful: Replaced ${args.targetName} (${end - start} chars) with new code.`;
        }
        catch (error) {
            return `[AST ERROR]: ${error.message}`;
        }
    }
}
