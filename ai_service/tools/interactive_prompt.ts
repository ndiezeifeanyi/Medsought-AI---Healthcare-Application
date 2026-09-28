import readline from "node:readline";
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
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("Interactive prompt runner — type a message and press Enter. Ctrl+C to exit.");

  rl.on("line", async (line: string) => {
    try {
      const req = {
        conversation_id: "interactive",
        user_id: "interactive",
        message: line.trim(),
        message_type: "text",
        language: "en",
        context: {}
      };
      const res = await proc.process(req as any);
      console.log("== Response ==");
      console.log(JSON.stringify(res, null, 2));
    } catch (e) {
      console.error(e);
    }
    process.stdout.write('\n> ');
  });

  process.stdout.write('> ');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
