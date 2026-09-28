import { loadConfig } from "../src/configuration/config.ts";
import { DrugInteractionService } from "../src/medical/drug-interaction-service.ts";
import { SyntheticDrugInformationProvider } from "../tests/fixtures/synthetic-drug-information-provider.ts";

async function run() {
  const svc = new DrugInteractionService(loadConfig({}), new SyntheticDrugInformationProvider());
  try {
    const res = await svc.answer({
      ai_request: {
        conversation_id: "x",
        user_id: "u",
        message: "Can I take AlphaMed with BetaMed?",
        message_type: "text",
        language: "en",
        context: {}
      },
      medicine_candidates: ["AlphaMed", "BetaMed"]
    });

    console.log("response:\n", res.response);
    console.log("knowledge_source:", res.knowledge_source);
    console.log("safety_status:", res.safety_status);
    console.log("confidence:", res.confidence);
  } catch (e) {
    console.error("error:", e);
    process.exit(1);
  }
}

run();
