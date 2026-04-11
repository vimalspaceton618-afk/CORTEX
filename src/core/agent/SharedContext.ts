import * as fs from 'fs';
import * as path from 'path';

const CONTEXT_FILE = path.join(process.cwd(), '.cortex');

export class SharedContext {
    static init() {
        if (!fs.existsSync(CONTEXT_FILE)) {
            fs.writeFileSync(CONTEXT_FILE, JSON.stringify({}, null, 2));
        }
    }

    static get(key: string): any {
        if (!fs.existsSync(CONTEXT_FILE)) return null;
        try {
            const data = JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf-8'));
            return data[key];
        } catch (e) {
            return null;
        }
    }

    static set(key: string, value: any) {
        let data: Record<string, any> = {};
        if (fs.existsSync(CONTEXT_FILE)) {
            try {
                data = JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf-8'));
            } catch (e) {
                // Ignore parse errors, rewrite
            }
        }
        data[key] = value;
        fs.writeFileSync(CONTEXT_FILE, JSON.stringify(data, null, 2));
    }
}
