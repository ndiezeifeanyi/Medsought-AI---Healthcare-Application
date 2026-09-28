import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/configuration/config.ts";
import { ConversationProcessor } from "../src/conversation/processor.ts";

test("returns structured reminder_event action for reminder replies", async () => {
  const processor = new ConversationProcessor({ config: loadConfig({}) });
  const result = await processor.process({
    conversation_id: "conv-rem",
    user_id: "user-1",
    message: "I've taken it.",
    message_type: "text",
    language: "en",
    context: {}
  });

  assert.equal(result.intent, "reminder_response");
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].type, "reminder_event");
  // @ts-ignore
  assert.equal(result.actions[0].payload.event, "taken");
});
