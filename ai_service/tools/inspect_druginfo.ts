import { loadConfig } from "../src/configuration/config.ts";
import { DrugInformationService } from "../src/medical/drug-information-service.ts";
import { SyntheticDrugInformationProvider } from "../tests/fixtures/synthetic-drug-information-provider.ts";

async function run() {
  const svc = new DrugInformationService(loadConfig({}), new SyntheticDrugInformationProvider());
  const res = await svc.answer({
    ai_request: {
      conversation_id: "x",
      user_id: "u",
      message: "What are the side effects of AlphaMed?",
      message_type: "text",
      language: "en",
      context: {}
    },
    intent: "side_effects",
    medicine_candidates: ["AlphaMed"]
  });

  console.log("knowledge_source:", res.knowledge_source);
  console.log("safety_status:", res.safety_status);
  console.log("confidence:", res.confidence);
  console.log("response:\n", res.response);
}

run().catch(e => { console.error(e); process.exit(1); });
