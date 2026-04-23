import { CognitionCore } from './src/core/CognitionCore.js';

async function verifyMythos() {
    console.log("Initializing BIGROCK Cognition Core with Mythos Engine...\n");
    const core = new CognitionCore();
    const mythos = core.getMythos();

    const targetArchitecture = `
        This is a legacy backend architecture. We have a Node.js API endpoint running in a Docker container.
        The data is saved to a public S3 storage bucket.
    `;

    console.log(`[TARGET ARCHITECTURE]:\n${targetArchitecture.trim()}\n`);
    console.log("Running Mythos Gap Discovery...\n");

    const gaps = mythos.analyzeArchitecture(targetArchitecture);

    if (gaps.length === 0) {
        console.log("No Myth Gaps found.");
    } else {
        gaps.forEach(gap => {
            console.log(`[MYTH GAP DETECTED]: ${gap.threat.name} (${Math.round(gap.confidence * 100)}% Match)`);
            console.log(`   Domain: ${gap.threat.domain} | Category: ${gap.threat.category}`);
            console.log(`   Reasoning: ${gap.reasoning}`);
            console.log(`   Required Mitigations:`);
            gap.threat.mitigations.forEach(m => console.log(`      - ${m}`));
            console.log("--------------------------------------------------");
        });
    }
}

verifyMythos().catch(console.error);
