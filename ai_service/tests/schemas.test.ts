import test from "node:test";
import assert from "node:assert/strict";
import { validateAiServiceRequest } from "../src/schemas/contracts.ts";

test("accepts the provisional backend request contract", () => {
  const errors = validateAiServiceRequest({
    conversation_id: "conv-1",
    user_id: "user-1",
    message: "Where can I find Augmentin?",
    message_type: "text",
    language: "en",
    context: {
      recent_messages: [],
      current_medicine: null
    }
  });

  assert.deepEqual(errors, []);
});

test("rejects malformed input and unsupported language", () => {
  const errors = validateAiServiceRequest({
    conversation_id: "",
    user_id: "user-1",
    message: "",
    message_type: "image",
    language: "fr"
  });

  assert.deepEqual(errors, [
    "conversation_id must be a non-empty string",
    "message must be a non-empty string",
    "message_type must be one of: text",
    "language must be one of: en, ha, yo, ig"
  ]);
});
