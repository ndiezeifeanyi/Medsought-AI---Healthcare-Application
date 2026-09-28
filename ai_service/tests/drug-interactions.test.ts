import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/configuration/config.ts";
import { ConversationProcessor } from "../src/conversation/processor.ts";
import { AiServiceError } from "../src/errors/ai-error.ts";
import { DrugInteractionService } from "../src/medical/drug-interaction-service.ts";
import { SyntheticDrugInformationProvider } from "./fixtures/synthetic-drug-information-provider.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT: What these tests verify — and what they do NOT verify
 * ─────────────────────────────────────────────────────────────────────────────
 * All tests in this file use SyntheticDrugInformationProvider with hardcoded
 * fixture data. They test the fallback contract (error codes, safety status,
 * response format) but DO NOT test against any real drug interaction database.
 *
 * A passing test suite here does NOT mean real-world interactions are working.
 * For live/contract tests against the real DDInter provider, see:
 *   ai_service/tests/unit/knowledge/ddinter-provider.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

function requestFor(message: string) {
  return {
    conversation_id: "conv-interaction",
    user_id: "user-interaction",
    message,
    message_type: "text" as const,
    language: "en" as const,
    context: {}
  };
}

test("answers interaction request for two known medicines using approved provider content", async () => {
  const processor = new ConversationProcessor({
    config: loadConfig({}),
    drugInformationProvider: new SyntheticDrugInformationProvider()
  });

  const result = await processor.process(requestFor("Can I take AlphaMed with BetaMed?"));

  assert.equal(result.intent, "drug_interaction");
  assert.equal(result.safety_status, "passed");
  assert.equal(result.metadata.knowledge_source, "Synthetic Phase 2 Test Fixture");
  assert.match(result.response, /Synthetic approved interaction summary for AlphaMed and BetaMed/);
  assert.match(result.response, /Disclaimer; Educational only\. Not medical advice\./);
});

test("interaction service rejects incomplete requests with fewer than two medicines", async () => {
  const service = new DrugInteractionService(loadConfig({}), new SyntheticDrugInformationProvider());

  await assert.rejects(
    () =>
      service.answer({
        ai_request: requestFor("Can I take AlphaMed?"),
        medicine_candidates: ["AlphaMed"]
      }),
    (error) => error instanceof AiServiceError && error.code === "AMBIGUOUS_MEDICINE"
  );
});

test("returns controlled fallback when one interaction medicine is unknown", async () => {
  const processor = new ConversationProcessor({
    config: loadConfig({}),
    drugInformationProvider: new SyntheticDrugInformationProvider()
  });

  const result = await processor.process(requestFor("Can I take AlphaMed with UnknownMed?"));

  assert.equal(result.intent, "drug_interaction");
  assert.equal(result.safety_status, "blocked");
  assert.equal(result.metadata.errors[0]?.code, "UNKNOWN_MEDICINE");
  assert.match(result.response, /do not have enough approved medical information/i);
});

test("returns controlled fallback when no interaction information is available", async () => {
  const processor = new ConversationProcessor({
    config: loadConfig({}),
    drugInformationProvider: new SyntheticDrugInformationProvider()
  });

  const result = await processor.process(requestFor("Can I take AlphaMed with NoDataMed?"));

  assert.equal(result.intent, "drug_interaction");
  assert.equal(result.safety_status, "blocked");
  assert.equal(result.metadata.errors[0]?.code, "MISSING_MEDICAL_INFORMATION");
  assert.match(result.response, /do not have enough approved medical information/i);
});
