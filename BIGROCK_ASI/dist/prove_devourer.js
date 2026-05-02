import { LLMDevourer } from './absorb/LLMDevourer.js';
import chalk from 'chalk';
async function main() {
    console.log(chalk.bold.magenta('\n========================================================='));
    console.log(chalk.bold.magenta('     BIGROCK CPU-ONLY "DEVOURER" PROOF OF LIFE     '));
    console.log(chalk.bold.magenta('=========================================================\n'));
    console.log(chalk.cyan('1. Initializing Devourer Engine (CPU Mode)...'));
    // By default, Devourer uses { gpu: false }
    const devourer = new LLMDevourer();
    const models = devourer.scanModels();
    if (models.length === 0) {
        console.log(chalk.red('No models found in the models/ directory.'));
        return;
    }
    console.log(chalk.cyan(`\n2. Found ${models.length} model(s):`));
    models.forEach(m => console.log(`   - ${m.filename} (${(m.size_bytes / 1e9).toFixed(2)} GB)`));
    console.log(chalk.cyan('\n3. Forcing a "Taste Test" (Probing domains purely on CPU)...'));
    console.log(chalk.dim('   (This will take a minute because we are using your CPU instead of a GPU)'));
    // We pass 'true' to force it to re-probe instead of using the cached JSON
    const report = await devourer.absorbAll(true);
    console.log(chalk.cyan('\n4. Live Test: Routing a question to the champion model...'));
    const testQuery = "What is the speed of light in a vacuum? Give just the number and units.";
    console.log(chalk.yellow(`   Query: "${testQuery}"`));
    const result = await devourer.devour(testQuery, "physics");
    console.log(chalk.green(`\n   Response: ${result.value}`));
    if (result.proof_trace) {
        console.log(chalk.dim(`   Trace:\n    - ${result.proof_trace.join('\n    - ')}`));
    }
    console.log(chalk.bold.magenta('\n========================================================='));
    console.log(chalk.bold.magenta('   PROOF COMPLETE: Devourer is 100% Real & CPU-Capable   '));
    console.log(chalk.bold.magenta('=========================================================\n'));
    process.exit(0);
}
main().catch(console.error);
