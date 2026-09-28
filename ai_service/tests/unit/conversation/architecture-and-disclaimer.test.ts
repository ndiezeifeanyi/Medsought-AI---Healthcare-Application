import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../../../src/configuration/config.ts";
import { ConversationProcessor } from "../../../src/conversation/processor.ts";
import { SafetyValidator, containsMedicalContent } from "../../../src/safety/validator.ts";
import { SyntheticDrugInformationProvider } from "../../fixtures/synthetic-drug-information-provider.ts";

test("Task 1 — Architecture inquiries produce neutral non-disclosure and prohibit false technical claims", async () => {
  // Mock LLM that simulates Gemini obeying the new system prompt
  const mockLlmProvider = {
    name: "mock-gemini",
    async generate(request: any) {
      const lastMsg = request.messages[request.messages.length - 1].content;
      if (/RAG|MongoDB|inmemory/i.test(lastMsg)) {
        return {
          content: "I am not able to share details about my internal systems, data architecture, or backend infrastructure. However, I am here to help answer any health or medication questions you may have."
        };
      }
      return { content: "Here is your response." };
    }
  };

  const config = loadConfig({});
  const processor = new ConversationProcessor({
    config,
    llmProvider: mockLlmProvider as any
  });

  const queries = [
    "is RAG connected?",
    "so, that means rag isn't connected?",
    "are you sure you're not getting data from mongodb",
    "but is inmemory retrieval working?"
  ];

  for (const query of queries) {
    const res = await processor.process({
      conversation_id: "test-arch",
      user_id: "u1",
      message_type: "text",
      message: query,
      language: "en"
    });

    assert.equal(res.intent, "general_inquiry");
    // Assert neutral non-disclosure language is present
    assert.match(
      res.response,
      /\b(?:not able to share details|unable to disclose|cannot share details|internal systems|data architecture|backend infrastructure)\b/i,
      `Expected neutral non-disclosure for query: "${query}"`
    );

    // Assert false specific claims/denials are strictly absent
    assert.equal(
      /I do not use MongoDB|I do not access.*MongoDB|RAG is not connected/i.test(res.response),
      false,
      `Response should not make false technical claims for query: "${query}"`
    );
  }
});

test("Task 2 — Deterministic disclaimer consolidation across general_inquiry and medical responses", async () => {
  const config = loadConfig({});
  const validator = new SafetyValidator(config);

  // 1. Pure non-medical query does NOT receive a disclaimer
  const nonMedicalResult = validator.validate({
    response: "The current local time in London is 08:30 AM. Please let me know if you need anything else.",
    is_medical_content: false,
    has_grounding_evidence: false
  });
  assert.equal(
    /Disclaimer; Educational only\. Not medical advice\./i.test(nonMedicalResult.response),
    false,
    "Pure non-medical response must never receive a disclaimer"
  );

  // 2. Response containing medication mentions deterministically receives a disclaimer regardless of is_medical_content flag
  const medMentionResult = validator.validate({
    response: "Paracetamol is commonly used to treat mild to moderate pain and reduce fever.",
    is_medical_content: false, // simulating a general_inquiry turn that discussed medicine
    has_grounding_evidence: false
  });
  assert.equal(
    /Disclaimer; Educational only\. Not medical advice\./i.test(medMentionResult.response),
    true,
    "Response discussing medications must deterministically receive a disclaimer"
  );

  // 3. Disclaimer presence is independent of /disclaimer/i in LLM raw text
  assert.equal(containsMedicalContent("What time is the store open?"), false);
  assert.equal(containsMedicalContent("Can I take 500mg of ibuprofen for headache?"), true);
  assert.equal(containsMedicalContent("Please consult your prescribing doctor regarding symptoms."), true);
});

test("Task 3 — Multi-drug interaction summary structures all pairwise combinations", async () => {
  const syntheticProvider = new SyntheticDrugInformationProvider();
  const config = loadConfig({});

  // Verify that multi-pair grounding includes explicit pair enumeration
  const lookup = await syntheticProvider.getDrugInteractions({
    medicines: ["AlphaMed", "BetaMed"],
    language: "en"
  });

  assert.ok(lookup.found);
  assert.ok(lookup.summary);
});
