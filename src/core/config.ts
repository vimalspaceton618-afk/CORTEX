import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

export class ConfigManager {
    static globalConfigPath = path.join(os.homedir(), '.cortexcli', 'config.json');

    static init() {
        // 1. Load local .env if the user is explicitly developing CORTEX
        dotenv.config();

        // 2. Ensure global OS directory securely exists
        const dir = path.dirname(this.globalConfigPath);
        if (!fs.existsSync(dir)) {
            // mode 0o700 ensures ONLY the current user can read/write this directory
            fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); 
        }
        
        // 3. Initialize config.json if it doesn't exist
        if (!fs.existsSync(this.globalConfigPath)) {
            fs.writeFileSync(this.globalConfigPath, JSON.stringify({
                OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
                OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || ""
            }, null, 2), { mode: 0o600 }); // strict permissions
        }

        // 4. Overwrite run-time environment variables with global config state
        try {
            const data = JSON.parse(fs.readFileSync(this.globalConfigPath, 'utf-8'));
            if (data.OPENAI_API_KEY && data.OPENAI_API_KEY.trim() !== '') {
                process.env.OPENAI_API_KEY = data.OPENAI_API_KEY;
            }
            if (data.OPENAI_BASE_URL && data.OPENAI_BASE_URL.trim() !== '') {
                process.env.OPENAI_BASE_URL = data.OPENAI_BASE_URL;
            }
        } catch (e) {
            // Silently fallback to standard env
        }
    }
}
