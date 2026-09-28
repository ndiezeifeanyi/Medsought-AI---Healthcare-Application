import test from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../../api/server.ts";

async function post(port: number, body: unknown) {
  const res = await fetch(`http://localhost:${port}/api/v1/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

test("valid drug-information request returns structured response", async () => {
  const srv = await startServer({ port: 0 });
  try {
    const { status, body } = await post(srv.port, {
      userId: "test-user",
      conversationId: "c1",
      message: "Tell me about AlphaMed."
    });
    assert.equal(status, 200);
    assert.equal(typeof body.message, "string");
    assert.equal(typeof body.intent, "string");
    assert.equal(typeof body.urgency, "string");
    assert.equal(typeof body.pharmacistConsultationRequired, "boolean");
  } finally {
    await srv.stop();
  }
});

test("drug interaction request routes to interaction capability", async () => {
  const srv = await startServer({ port: 0 });
  try {
    const { status, body } = await post(srv.port, {
      userId: "test-user",
      conversationId: "c2",
      message: "Can I take AlphaMed with BetaMed?"
    });
    assert.equal(status, 200);
    // drug_interaction internally maps to medication_question externally
    assert.equal(body.intent, "medication_question");
  } finally {
    await srv.stop();
  }
});

test("follow-up conversation uses provided context", async () => {
  const srv = await startServer({ port: 0 });
  try {
    const first = await post(srv.port, { userId: "u", conversationId: "conv-3", message: "Tell me about AlphaMed." });
    assert.equal(first.status, 200);
    // second request includes context from first response metadata if any
    const second = await post(srv.port, {
      userId: "u",
      conversationId: "conv-3",
      message: "What are its side effects?",
      context: first.body?.metadata ?? {}
    });
    assert.equal(second.status, 200);
    // side_effects internally maps to medication_question externally
    assert.equal(second.body.intent, "medication_question");
  } finally {
    await srv.stop();
  }
});

test("medicine search intent handled", async () => {
  const srv = await startServer({ port: 0 });
  try {
    const r = await post(srv.port, { userId: "u", conversationId: "c4", message: "Where can I find Augmentin?" });
    assert.equal(r.status, 200);
    // medicine_search internally maps to general_inquiry externally
    assert.equal(r.body.intent, "general_inquiry");
  } finally {
    await srv.stop();
  }
});

test("reminder conversation handled", async () => {
  const srv = await startServer({ port: 0 });
  try {
    const r = await post(srv.port, { userId: "u", conversationId: "c5", message: "I've already taken it." });
    assert.equal(r.status, 200);
    // reminder_response internally maps to cancel_or_modify_reminder externally
    assert.equal(r.body.intent, "cancel_or_modify_reminder");
  } finally {
    await srv.stop();
  }
});

test("co-administration query returns medication_question intent and medium urgency", async () => {
  const srv = await startServer({ port: 0 });
  try {
    const { status, body } = await post(srv.port, {
      userId: "test-user",
      conversationId: "c-coadmin",
      message: "Can I drink vitamin C if I already took paracetamol?"
    });
    assert.equal(status, 200);
    // drug_interaction internally → medication_question externally
    assert.equal(body.intent, "medication_question");
    // medication_question urgency is medium (personal health question)
    assert.equal(body.urgency, "medium");
    assert.equal(body.pharmacistConsultationRequired, true);
    assert.match(body.message, /vitamin c/i);
  } finally {
    await srv.stop();
  }
});
