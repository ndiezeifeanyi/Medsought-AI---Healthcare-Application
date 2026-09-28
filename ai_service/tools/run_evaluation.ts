import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../src/configuration/config.ts";
import { ConversationProcessor } from "../src/conversation/processor.ts";
import { SyntheticDrugInformationProvider } from "../tests/fixtures/synthetic-drug-information-provider.ts";
import { RxNormDrugProvider } from "../src/knowledge/providers/rxnorm-drug-provider.ts";
import { MockTranslator } from "../src/translation/providers/mock-translator.ts";

type EvalExample = {
  id: string;
  request: any;
  expected: any;
};

async function run() {
  const path = resolve("ai_service/evals/whatsapp-eval.json");
  const raw = readFileSync(path, "utf8");
  const examples: EvalExample[] = JSON.parse(raw);

  const config = loadConfig({});
  let drugProvider: any = new RxNormDrugProvider();
  // if network or RxNorm fails, fall back to synthetic provider for reproducible results
  try {
    // quick connectivity check
    await drugProvider.resolveMedicine({ medicine_name: "aspirin", language: "en" });
  } catch (e) {
    console.warn("RxNorm provider unavailable, falling back to synthetic provider:", String((e as any)?.message ?? e));
    drugProvider = new SyntheticDrugInformationProvider();
  }

  const processor = new ConversationProcessor({ config, drugInformationProvider: drugProvider, translator: new MockTranslator() });

  let intentCorrect = 0;
  let medicineCorrect = 0;
  let total = 0;
  let safetyBlocked = 0;

  for (const ex of examples) {
    total++;
    const res = await processor.process(ex.request);
    const expectedIntent = ex.expected.intent;
    if (res.intent === expectedIntent) intentCorrect++;

    // check medicine extraction either in actions or updated_context
    const expectedMed = ex.expected.medicine || (ex.expected.medicines ? ex.expected.medicines[0] : undefined);
    let extractedMed: string | undefined;
    if (res.actions && res.actions.length > 0) {
      const a = res.actions.find((x: any) => x.type === "medicine_search" || x.type === "reminder_event");
      if (a) extractedMed = a.payload?.medicine;
    }
    if (!extractedMed && res.metadata?.updated_context) extractedMed = res.metadata.updated_context.current_medicine as string | undefined;

    if (expectedMed && extractedMed && extractedMed.toLowerCase() === expectedMed.toLowerCase()) medicineCorrect++;

    if (res.safety_status === "blocked") safetyBlocked++;

    console.log(`EX ${ex.id}: intent=${res.intent} safety=${res.safety_status} med=${extractedMed ?? null}`);
  }

  console.log("\nEVALUATION SUMMARY");
  console.log(`examples: ${total}`);
  console.log(`intent_accuracy: ${(intentCorrect / total * 100).toFixed(1)}%`);
  console.log(`medicine_extraction_accuracy (where expected): ${(medicineCorrect / total * 100).toFixed(1)}%`);
  console.log(`safety_blocked_count: ${safetyBlocked}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
