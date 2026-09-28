import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/configuration/config.ts";
import { ConversationProcessor } from "../src/conversation/processor.ts";

test("processes provisional medicine search request without backend search ownership", async () => {
  const processor = new ConversationProcessor({ config: loadConfig({}) });
  const result = await processor.process({
    conversation_id: "conv-1",
    user_id: "user-1",
    message: "Where can I find Augmentin?",
    message_type: "text",
    language: "en",
    context: {}
  });

  assert.equal(result.intent, "medicine_search");
  assert.equal(result.language, "en");
  assert.equal(result.safety_status, "passed");
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].type, "medicine_search");
  // ensure medicine extracted
  // @ts-ignore
  assert.equal(result.actions[0].payload.medicine, "Augmentin");
});

test("fails closed for medical request without approved evidence", async () => {
  const processor = new ConversationProcessor({ config: loadConfig({}) });
  const result = await processor.process({
    conversation_id: "conv-2",
    user_id: "user-1",
    message: "What are the side effects of Paracetamol?",
    message_type: "text",
    language: "en",
    context: {}
  });

  assert.equal(result.intent, "side_effects");
  assert.equal(result.safety_status, "needs_fallback");
  assert.match(result.response, /Disclaimer.*Educational only.*Not medical advice/i);
});
