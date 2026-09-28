import { resolveDrugInformationProvider } from "../src/knowledge/factory.ts";
import { resolveLlmProvider } from "../src/llm/factory.ts";
import { ConversationProcessor } from "../src/conversation/processor.ts";
import { loadConfig } from "../src/configuration/config.ts";

async function main() {
  const config = loadConfig(process.env);
  const drugProvider = resolveDrugInformationProvider(config);
  const llmProvider = resolveLlmProvider(config);

  const processor = new ConversationProcessor({
    config,
    drugInformationProvider: drugProvider,
    llmProvider
  });

  console.log("Testing medicine lookup for Acetaminophen...");
  const res1 = await processor.process({
    conversation_id: "c1",
    user_id: "u1",
    message: "What is Acetaminophen?",
    message_type: "text",
    language: "en"
  });

  console.log("Result 1:");
  console.log(JSON.stringify(res1, null, 2));
}

main().catch(console.error);
