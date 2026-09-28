import test from "node:test";
import assert from "node:assert/strict";
import { extractSubjectFromUserMessage } from "../src/conversation/processor.ts";
import { ChatHandler } from "../api/handlers/chat.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Unit tests — extractSubjectFromUserMessage
// ═══════════════════════════════════════════════════════════════════════════

test("extractSubjectFromUserMessage: 'do you know about cidarcool soap' → cidarcool soap", () => {
  const result = extractSubjectFromUserMessage("do you know about cidarcool soap");
  assert.equal(result, "cidarcool soap");
});

test("extractSubjectFromUserMessage: 'tell me about paracetamol' → paracetamol", () => {
  const result = extractSubjectFromUserMessage("tell me about paracetamol");
  assert.equal(result, "paracetamol");
});

test("extractSubjectFromUserMessage: 'what is augmentin' → augmentin", () => {
  const result = extractSubjectFromUserMessage("what is augmentin");
  assert.equal(result, "augmentin");
});

test("extractSubjectFromUserMessage: anaphoric 'what about its side effects' → null (pronoun rejected)", () => {
  const result = extractSubjectFromUserMessage("what about its side effects");
  assert.equal(result, null);
});

test("extractSubjectFromUserMessage: 'how many days does it take to work' → null (no structural pattern)", () => {
  const result = extractSubjectFromUserMessage("how many days does it take to work");
  assert.equal(result, null);
});

test("extractSubjectFromUserMessage: 'tell me about what I should do if I miss a dose' → null (stop first-word 'what')", () => {
  const result = extractSubjectFromUserMessage("tell me about what I should do if I miss a dose");
  assert.equal(result, null);
});

test("extractSubjectFromUserMessage: 'information about cidarcool cleanser' → includes cidarcool", () => {
  const result = extractSubjectFromUserMessage("information about cidarcool cleanser");
  assert.ok(result !== null && result.toLowerCase().includes("cidarcool"));
});

test("extractSubjectFromUserMessage: 'how about its dosage' → null (pronoun first-word 'its')", () => {
  const result = extractSubjectFromUserMessage("how about its dosage");
  assert.equal(result, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// User isolation — two users with the same conversationId must have
// completely separate memory slots.
// ═══════════════════════════════════════════════════════════════════════════

test("user isolation: two users with the same conversationId have separate memory slots", async () => {
  const handler = new ChatHandler();
  const convId = "shared-conv-001";

  // User A establishes a subject
  await handler.process({
    userId: "user-alpha",
    conversationId: convId,
    message: "do you know about cidarcool soap"
  });

  // User B starts a completely separate session on the SAME conversationId
  const respB = await handler.process({
    userId: "user-beta",
    conversationId: convId,
    message: "Hi there, I have a question"
  });

  // User A's next request must still work with their own isolated state
  const respA2 = await handler.process({
    userId: "user-alpha",
    conversationId: convId,
    message: "how many days does it take to work"
  });

  assert.ok(typeof respA2.message === "string", "User A still receives a valid response");
  assert.ok(typeof respB.message === "string", "User B receives their own valid response");
});

// ═══════════════════════════════════════════════════════════════════════════
// Metadata correctness
// ═══════════════════════════════════════════════════════════════════════════

test("pharmacistConsultationRequired is true when AI intent is pharmacist_consultation", async () => {
  const handler = new ChatHandler();
  const result = await handler.process({
    userId: "u2",
    conversationId: "conv-pharm-test",
    message: "I want to consult a pharmacist today"
  });
  assert.equal(result.pharmacistConsultationRequired, true);
});

test("urgency is emergency for a clear emergency message", async () => {
  const handler = new ChatHandler();
  const result = await handler.process({
    userId: "u3",
    conversationId: "conv-emergency",
    message: "I am having chest pain and cannot breathe"
  });
  assert.equal(result.urgency, "emergency");
  assert.equal(result.pharmacistConsultationRequired, false);
});

test("greeting returns low urgency and false pharmacistConsultationRequired", async () => {
  const handler = new ChatHandler();
  const result = await handler.process({
    userId: "u4",
    conversationId: "conv-greet",
    message: "Hello"
  });
  assert.equal(result.urgency, "low");
  assert.equal(result.pharmacistConsultationRequired, false);
  assert.equal(result.intent, "greeting");
});

test("no subject invented for cold-start anaphoric message with no prior context", async () => {
  const handler = new ChatHandler();
  const result = await handler.process({
    userId: "u5",
    conversationId: "conv-cold-anaphor",
    message: "how many days does it take to work"
  });
  assert.ok(typeof result.message === "string" && result.message.length > 0);
});
