import { CognitionCore } from '../core/CognitionCore.js';
import { BenchmarkSuite } from './BenchmarkSuite.js';
async function main() {
    const core = new CognitionCore();
    const suite = new BenchmarkSuite(core);
    console.log(`\n[BIGROCK BENCHMARK]: Initializing ASI Cognitive Core...`);
    const report = await suite.run(true);
    // Strict CI/CD enforcement
    if (report.failed > 0) {
        console.error(`\n[BIGROCK BENCHMARK]: ❌ FAILED (${report.failed} test(s) failed). Aborting CI/CD pipeline.`);
        process.exit(1);
    }
    else {
        console.log(`\n[BIGROCK BENCHMARK]: ✅ PASSED ALL (${report.passed} test(s)). Core is deterministic and stable.`);
        process.exit(0);
    }
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
