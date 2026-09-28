import { loadConfig } from "../src/configuration/config.ts";
import { ConversationProcessor } from "../src/conversation/processor.ts";
import { SyntheticDrugInformationProvider } from "../tests/fixtures/synthetic-drug-information-provider.ts";

async function run() {
  const processor = new ConversationProcessor({ config: loadConfig({}), drugInformationProvider: new SyntheticDrugInformationProvider() });

  const result = await processor.process({
    conversation_id: "conv-followup",
    user_id: "user-1",
    message: "Tell me about AlphaMed.",
    message_type: "text",
    language: "en",
    context: {}
  });

  console.log(JSON.stringify(result, null, 2));
}

run().catch(e => { console.error(e); process.exit(1); });
