import { loadConfig } from "../src/configuration/config.ts";
import { ConversationProcessor } from "../src/conversation/processor.ts";
import { RxNormDrugProvider } from "../src/knowledge/providers/rxnorm-drug-provider.ts";
import { SyntheticDrugInformationProvider } from "../tests/fixtures/synthetic-drug-information-provider.ts";
import { MockTranslator } from "../src/translation/providers/mock-translator.ts";

async function createProcessor() {
  const config = loadConfig({});
  let provider: any = new RxNormDrugProvider();
  try {
    await provider.resolveMedicine({ medicine_name: "aspirin", language: "en" });
  } catch {
    provider = new SyntheticDrugInformationProvider();
  }
  return new ConversationProcessor({ config, drugInformationProvider: provider, translator: new MockTranslator() });
}

async function run() {
  const proc = await createProcessor();
  const tests = [
    { id: "t1", message: "Where can I find Augmentin?", language: "en" },
    { id: "t2", message: "Tell me about AlphaMed.", language: "en" },
    { id: "t3", message: "Nibo ni MO ti le ri Augmentin?", language: "yo" },
    { id: "t4", message: "I've taken it.", language: "en", context: { current_medicine: "Paracetamol" } }
  ];

  for (const t of tests) {
    const req = {
      conversation_id: `demo-${t.id}`,
      user_id: `demo-user`,
      message: t.message,
      message_type: "text",
      language: t.language,
      context: t.context ?? {}
    };

    const res = await proc.process(req as any);
    console.log(`--- ${t.id} ---`);
    console.log(`Message: ${t.message} (lang=${t.language})`);
    console.log(`Intent: ${res.intent}  Safety: ${res.safety_status}`);
    console.log(`Response:\n${res.response}\n`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
