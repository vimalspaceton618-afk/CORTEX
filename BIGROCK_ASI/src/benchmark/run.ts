import { CognitionCore } from '../core/CognitionCore.js';
import { BenchmarkSuite } from './BenchmarkSuite.js';

async function main() {
    const core = new CognitionCore();
    const suite = new BenchmarkSuite(core);
    await suite.run(true);
}

main().catch(console.error);
