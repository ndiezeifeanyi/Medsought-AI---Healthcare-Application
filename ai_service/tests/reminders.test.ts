import test from "node:test";
import assert from "node:assert/strict";
import { interpretReminderResponseFallback } from "../src/reminders/conversation-handler.ts";

test("interprets common reminder replies", () => {
  assert.equal(interpretReminderResponseFallback("I've taken it.").intent, "taken");
  assert.equal(interpretReminderResponseFallback("I missed it.").intent, "missed");
  assert.equal(interpretReminderResponseFallback("Remind me later.").intent, "delay");
  assert.equal(interpretReminderResponseFallback("I need a refill.").intent, "refill");
  assert.equal(interpretReminderResponseFallback("Where is the nearest pharmacy?").intent, "unrelated");
});
