import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/configuration/config.ts";
import { ConversationProcessor } from "../src/conversation/processor.ts";
import { DrugInformationService } from "../src/medical/drug-information-service.ts";
import { topicsForIntent } from "../src/medical/topic-selection.ts";
import { SyntheticDrugInformationProvider } from "./fixtures/synthetic-drug-information-provider.ts";

function requestFor(message: string) {
  return {
    conversation_id: "conv-side-effects",
    user_id: "user-side-effects",
    message,
    message_type: "text" as const,
    language: "en" as const,
    context: {}
  };
}

test("selects contraindication topic when requested", () => {
  assert.deepEqual(topicsForIntent("drug_information", "What are AlphaMed contraindications?"), [
    "contraindications"
  ]);
});

test("answers contraindication lookup where supported by provider", async () => {
  const processor = new ConversationProcessor({
    config: loadConfig({}),
    drugInformationProvider: new SyntheticDrugInformationProvider()
  });

  const result = await processor.process(requestFor("What are AlphaMed contraindications?"));

  assert.equal(result.intent, "drug_information");
  assert.equal(result.safety_status, "passed");
  assert.match(result.response, /Synthetic approved contraindication text for AlphaMed/);
  assert.doesNotMatch(result.response, /Synthetic approved side-effect text/);
});

test("side-effect lookup for unknown medicine fails closed", async () => {
  const processor = new ConversationProcessor({
    config: loadConfig({}),
    drugInformationProvider: new SyntheticDrugInformationProvider()
  });

  const result = await processor.process(requestFor("What are the side effects of UnknownMed?"));

  assert.equal(result.intent, "side_effects");
  assert.equal(result.safety_status, "blocked");
  assert.equal(result.metadata.errors[0]?.code, "UNKNOWN_MEDICINE");
});

test("side-effect lookup with missing topic fails closed", async () => {
  const service = new DrugInformationService(loadConfig({}), new SyntheticDrugInformationProvider());

  await assert.rejects(
    () =>
      service.answer({
        ai_request: requestFor("What are the side effects of NoDataMed?"),
        intent: "side_effects",
        medicine_candidates: ["NoDataMed"]
      }),
    /did not provide enough information/
  );
});
