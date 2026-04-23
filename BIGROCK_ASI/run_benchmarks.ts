import { CognitionCore } from './src/core/CognitionCore.js';
import { BenchmarkSuite } from './src/benchmark/BenchmarkSuite.js';

async function main() {
    console.log("Initializing Bigrock ASI Cognition Core...");
    const core = new CognitionCore();
    const suite = new BenchmarkSuite(core);
    
    console.log("Triggering Quantum-Logic Benchmark Suite...");
    await suite.run(true);
}

main().catch(console.error);
