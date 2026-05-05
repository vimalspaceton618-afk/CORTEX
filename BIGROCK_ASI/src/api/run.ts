import { BigrockServer } from './BigrockServer.js';

async function main() {
    const port = parseInt(process.env.PORT || '11500', 10);
    const server = new BigrockServer(port);
    server.start();

    // Auto-trigger model absorption to ensure the Hive is hydrated on boot
    console.log(`\n[BIGROCK BOOT]: Triggering auto-absorption of local models...`);
    try {
        // Wait a brief moment to ensure the server is fully listening
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const response = await fetch(`http://localhost:${port}/v1/models/absorb`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: false })
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log(`[BIGROCK BOOT]: Absorption cycle finished. Devoured ${data.report?.total_models_absorbed ?? 0} model(s).`);
        } else {
            const error = await response.json();
            console.log(`[BIGROCK BOOT]: Auto-absorption encountered an error: ${error.error}`);
        }
    } catch (e: any) {
        console.error(`[BIGROCK BOOT]: Failed to trigger auto-absorption - ${e.message}`);
    }
}

main().catch(console.error);
