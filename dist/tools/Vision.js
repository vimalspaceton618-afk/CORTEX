import { Tool } from './Tool.js';
import * as fs from 'fs/promises';
import { getClient } from '../core/llm.js';
export class AnalyzeImageTool extends Tool {
    name = "analyze_image";
    description = "Capable of visual perception. Reads an image from the local file system and returns a detailed visual description answering the provided prompt.";
    schema = {
        type: "object",
        properties: {
            imagePath: { type: "string", description: "Absolute path to the image file (png, jpeg, webp, gif)" },
            prompt: { type: "string", description: "What to look for or analyze in the image" }
        },
        required: ["imagePath", "prompt"],
        additionalProperties: false
    };
    async execute(args) {
        try {
            // Read the image file
            const fileBuffer = await fs.readFile(args.imagePath);
            // Determine mime type from extension
            const ext = args.imagePath.split('.').pop()?.toLowerCase();
            let mimeType = 'image/jpeg';
            if (ext === 'png')
                mimeType = 'image/png';
            if (ext === 'webp')
                mimeType = 'image/webp';
            if (ext === 'gif')
                mimeType = 'image/gif';
            const base64Image = fileBuffer.toString('base64');
            const dataUrl = `data:${mimeType};base64,${base64Image}`;
            const client = getClient();
            // Using gpt-4o as default fallback for vision since many text models don't support it
            const activeModel = process.env.VISION_MODEL || process.env.AI_MODEL || 'gpt-4o';
            const response = await client.chat.completions.create({
                model: activeModel,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: args.prompt },
                            {
                                type: "image_url",
                                image_url: {
                                    url: dataUrl,
                                },
                            },
                        ],
                    },
                ],
                max_tokens: 1000,
            });
            return response.choices[0]?.message?.content || "[VISION API RETURNED NO CONTENT]";
        }
        catch (error) {
            // Check for model compatibility errors smoothly
            if (error.message?.includes("does not support image") || error.message?.includes("vision")) {
                return `[VISION ERROR]: The currently configured AI_MODEL (${process.env.AI_MODEL}) does not support multimodal image input. Please set VISION_MODEL in .env to a vision-capable endpoint (e.g. gpt-4o, claude-3.5-sonnet). Error Details: ${error.message}`;
            }
            return `[VISION ERROR]: ${error.message}`;
        }
    }
}
