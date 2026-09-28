import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../src/configuration/config.ts";
import { ConversationProcessor } from "../src/conversation/processor.ts";
import { RxNormDrugProvider } from "../src/knowledge/providers/rxnorm-drug-provider.ts";
import { SyntheticDrugInformationProvider } from "../tests/fixtures/synthetic-drug-information-provider.ts";
import { MockTranslator } from "../src/translation/providers/mock-translator.ts";

type EvalExample = { id: string; request: any; expected: any };

async function run() {
  const path = resolve("ai_service/evals/whatsapp-eval.json");
  const raw = readFileSync(path, "utf8");
  const examples: EvalExample[] = JSON.parse(raw);

  const config = loadConfig({});
  let drugProvider: any = new RxNormDrugProvider();
  try {
    await drugProvider.resolveMedicine({ medicine_name: "aspirin", language: "en" });
  } catch {
    drugProvider = new SyntheticDrugInformationProvider();
  }

  const processor = new ConversationProcessor({ config, drugInformationProvider: drugProvider, translator: new MockTranslator() });

  const results: any[] = [];

  for (const ex of examples) {
    const res = await processor.process(ex.request);
    results.push({ id: ex.id, request: ex.request, expected: ex.expected, response: res });
    console.log(`${ex.id}: intent=${res.intent} safety=${res.safety_status}`);
  }

  const outPath = resolve("ai_service/evals/prompt_test_results.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`Wrote results to ${outPath}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
