import { Tool } from './Tool.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ReadFileTool extends Tool {
    name = "read_file";
    description = "Reads the contents of a local file.";
    schema = {
        type: "object",
        properties: {
            filePath: { type: "string", description: "Absolute or relative path to the file" }
        },
        required: ["filePath"],
        additionalProperties: false
    };

    async execute(args: { filePath: string }): Promise<string> {
        try {
            const resolvedPath = path.resolve(process.cwd(), args.filePath);
            const data = await fs.readFile(resolvedPath, 'utf-8');
            return data;
        } catch (error: any) {
            return `[FILE READ ERROR]: ${error.message}`;
        }
    }
}

export class WriteFileTool extends Tool {
    name = "write_file";
    description = "Create or overwrite a file with provided content.";
    schema = {
        type: "object",
        properties: {
            filePath: { type: "string", description: "Absolute or relative path to the file" },
            content: { type: "string", description: "The content to write into the file" }
        },
        required: ["filePath", "content"],
        additionalProperties: false
    };

    async execute(args: { filePath: string, content: string }, requestConfirmation: (msg: string) => Promise<boolean>): Promise<string> {
        try {
            const resolvedPath = path.resolve(process.cwd(), args.filePath);
            const approved = await requestConfirmation(`Allow CORTEX to write to ${resolvedPath}?`);
            if (!approved) return "[OPERATION CANCELLED BY USER]";
            
            // Ensure directory exists
            await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
            
            await fs.writeFile(resolvedPath, args.content, 'utf-8');
            return `Successfully written to ${args.filePath}`;
        } catch (error: any) {
            return `[FILE WRITE ERROR]: ${error.message}`;
        }
    }
}

export class DeleteTool extends Tool {
    name = "delete_file_or_dir";
    description = "Deletes a file or directory permanently from the host system.";
    schema = {
        type: "object",
        properties: {
            targetPath: { type: "string", description: "Absolute or relative path to the file or directory" }
        },
        required: ["targetPath"],
        additionalProperties: false
    };

    async execute(args: { targetPath: string }, requestConfirmation: (msg: string) => Promise<boolean>): Promise<string> {
        try {
            const resolvedPath = path.resolve(process.cwd(), args.targetPath);
            const approved = await requestConfirmation(`[DANGER] Allow CORTEX to permanently DELETE ${resolvedPath}?`);
            if (!approved) return "[OPERATION CANCELLED BY USER]";
            
            await fs.rm(resolvedPath, { recursive: true, force: true });
            return `Successfully deleted ${args.targetPath}`;
        } catch (error: any) {
            return `[DELETE ERROR]: ${error.message}`;
        }
    }
}

export class ListDirTool extends Tool {
    name = "list_directory";
    description = "Lists files and folders inside a given directory. Helps you navigate the system.";
    schema = {
        type: "object",
        properties: {
            dirPath: { type: "string", description: "Absolute or relative path to the directory" }
        },
        required: ["dirPath"],
        additionalProperties: false
    };

    async execute(args: { dirPath: string }): Promise<string> {
        try {
            const resolvedPath = path.resolve(process.cwd(), args.dirPath);
            const files = await fs.readdir(resolvedPath);
            return `Contents of ${args.dirPath}:\n${files.join('\n')}`;
        } catch (error: any) {
            return `[LIST DIR ERROR]: ${error.message}`;
        }
    }
}
