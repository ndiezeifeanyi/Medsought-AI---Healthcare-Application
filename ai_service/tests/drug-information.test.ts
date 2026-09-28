import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/configuration/config.ts";
import { ConversationProcessor } from "../src/conversation/processor.ts";
import { AiServiceError } from "../src/errors/ai-error.ts";
import { DrugInformationService } from "../src/medical/drug-information-service.ts";
import { MedicineIdentifier } from "../src/medical/medicine-identifier.ts";
import { SyntheticDrugInformationProvider } from "./fixtures/synthetic-drug-information-provider.ts";

function requestFor(message: string) {
  return {
    conversation_id: "conv-drug-info",
    user_id: "user-drug-info",
    message,
    message_type: "text" as const,
    language: "en" as const,
    context: {}
  };
}

test("answers valid medicine information using only provider-supplied content", async () => {
  const service = new DrugInformationService(loadConfig({}), new SyntheticDrugInformationProvider());
  const result = await service.answer({
    ai_request: requestFor("Tell me about AlphaMed."),
    intent: "drug_information",
    medicine_candidates: ["AlphaMed"]
  });

  assert.equal(result.knowledge_source, "Synthetic Phase 2 Test Fixture");
  assert.equal(result.safety_status, "passed");
  assert.match(result.response, /Synthetic approved overview text/);
  assert.match(result.response, /Disclaimer; Educational only\. Not medical advice\./);
});

test("answers side-effect request for valid medicine", async () => {
  const processor = new ConversationProcessor({
    config: loadConfig({}),
    drugInformationProvider: new SyntheticDrugInformationProvider()
  });

  const result = await processor.process(requestFor("What are the side effects of AlphaMed?"));

  assert.equal(result.intent, "side_effects");
  assert.equal(result.safety_status, "passed");
  assert.equal(result.metadata.knowledge_source, "Synthetic Phase 2 Test Fixture");
  assert.match(result.response, /Synthetic approved side-effect text/);
});

test("resolves a misspelled medicine through the approved provider interface", async () => {
  const identifier = new MedicineIdentifier(new SyntheticDrugInformationProvider());
  const result = await identifier.identify({
    message: "Tell me about Alphamd.",
    language: "en",
    candidates: ["Alphamd"]
  });

  assert.equal(result.resolved_name, "AlphaMed");
  assert.equal(result.confidence, 0.82);
});

test("returns a controlled fallback for unknown medicine", async () => {
  const processor = new ConversationProcessor({
    config: loadConfig({}),
    drugInformationProvider: new SyntheticDrugInformationProvider()
  });

  const result = await processor.process(requestFor("Tell me about UnknownMed."));

  assert.equal(result.intent, "drug_information");
  assert.equal(result.safety_status, "blocked");
  assert.equal(result.metadata.errors[0]?.code, "UNKNOWN_MEDICINE");
  assert.match(result.response, /do not have enough approved medical information/i);
});

test("returns a controlled fallback when approved source has missing information", async () => {
  const service = new DrugInformationService(loadConfig({}), new SyntheticDrugInformationProvider());

  await assert.rejects(
    () =>
      service.answer({
        ai_request: requestFor("Tell me about EmptyInfo."),
        intent: "drug_information",
        medicine_candidates: ["EmptyInfo"]
      }),
    (error) =>
      error instanceof AiServiceError &&
      error.code === "MISSING_MEDICAL_INFORMATION" &&
      /did not provide enough information/.test(error.message)
  );
});
