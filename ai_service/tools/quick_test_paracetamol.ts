import { loadConfig } from "../src/configuration/config.ts";
import { ConversationProcessor } from "../src/conversation/processor.ts";
import { RxNormDrugProvider } from "../src/knowledge/providers/rxnorm-drug-provider.ts";
import { SyntheticDrugInformationProvider } from "../tests/fixtures/synthetic-drug-information-provider.ts";
import { MockTranslator } from "../src/translation/providers/mock-translator.ts";

async function run() {
  const config = loadConfig({});
  let provider: any = new RxNormDrugProvider();
  try {
    await provider.resolveMedicine({ medicine_name: "aspirin", language: "en" });
  } catch {
    provider = new SyntheticDrugInformationProvider();
  }
  const proc = new ConversationProcessor({ config, drugInformationProvider: provider, translator: new MockTranslator() });

  const req = {
    conversation_id: "q1",
    user_id: "u1",
    message: "what is paracetamol",
    message_type: "text",
    language: "en",
    context: {}
  };

  const res = await proc.process(req as any);
  console.log(JSON.stringify(res, null, 2));
}

run().catch((e) => { console.error(e); process.exit(1); });
