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
