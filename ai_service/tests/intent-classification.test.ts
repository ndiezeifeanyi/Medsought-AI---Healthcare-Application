import test from "node:test";
import assert from "node:assert/strict";
import { classifyIntentFallback, extractMedicineCandidates, toExternalIntent } from "../src/conversation/intent.ts";

// ─── Drug Interaction (internal) / medication_question (external) ────────────

test("Test 1 — Co-administration with 'after taking' classifies as drug_interaction (internal)", () => {
  const result = classifyIntentFallback("Can I take vitamin C after taking paracetamol?");
  assert.equal(result.intent, "drug_interaction");
  const meds = result.entities.medicines.map(m => m.toLowerCase());
  assert.ok(meds.includes("vitamin c"));
  assert.ok(meds.includes("paracetamol"));
});

test("Test 2 — Natural wording 'already took ... can I drink' classifies as drug_interaction", () => {
  const result = classifyIntentFallback("I already took paracetamol, can I drink vitamin C?");
  assert.equal(result.intent, "drug_interaction");
  const meds = result.entities.medicines.map(m => m.toLowerCase());
  assert.ok(meds.includes("paracetamol"));
  assert.ok(meds.includes("vitamin c"));
});

test("Test 3 — Natural wording 'can i drink ... if i already took' classifies as drug_interaction", () => {
  const result = classifyIntentFallback("You can i drink vitamin c if i already took paracetamol?");
  assert.equal(result.intent, "drug_interaction");
  const meds = result.entities.medicines.map(m => m.toLowerCase());
  assert.ok(meds.includes("vitamin c"));
  assert.ok(meds.includes("paracetamol"));
});

test("Test 4 — 'Can I take these medicines together?' classifies as drug_interaction", () => {
  const result = classifyIntentFallback("Can I take these medicines together?");
  assert.equal(result.intent, "drug_interaction");
});

test("Test 5 — Alcohol co-administration classifies as drug_interaction", () => {
  const result = classifyIntentFallback("Is it safe to drink alcohol with amoxicillin?");
  assert.equal(result.intent, "drug_interaction");
  const meds = result.entities.medicines.map(m => m.toLowerCase());
  assert.ok(meds.includes("amoxicillin"));
});

test("Test 12 — 'vitamin c mixed with augmentin' classifies as drug_interaction (internal)", () => {
  const result = classifyIntentFallback("vitamin c mixed with augmentin");
  assert.equal(result.intent, "drug_interaction");
  const meds = result.entities.medicines.map(m => m.toLowerCase());
  assert.ok(meds.includes("vitamin c"));
  assert.ok(meds.includes("augmentin"));
});

test("Test 13 — 'Can I take vitamin C with Augmentin?' classifies as drug_interaction", () => {
  const result = classifyIntentFallback("Can I take vitamin C with Augmentin?");
  assert.equal(result.intent, "drug_interaction");
});

test("Test 14 — 'Can I take paracetamol and ibuprofen together?' classifies as drug_interaction", () => {
  const result = classifyIntentFallback("Can I take paracetamol and ibuprofen together?");
  assert.equal(result.intent, "drug_interaction");
  const meds = result.entities.medicines.map(m => m.toLowerCase());
  assert.ok(meds.includes("paracetamol"));
  assert.ok(meds.includes("ibuprofen"));
});

test("Test 15 — 'Do paracetamol and ibuprofen interact?' classifies as drug_interaction", () => {
  const result = classifyIntentFallback("Do paracetamol and ibuprofen interact?");
  assert.equal(result.intent, "drug_interaction");
});

// ─── Side effects / drug information ────────────────────────────────────────

test("Test 6 — Side effects question classifies as side_effects", () => {
  const result = classifyIntentFallback("What are the side effects of paracetamol?");
  assert.equal(result.intent, "side_effects");
  const meds = result.entities.medicines.map(m => m.toLowerCase());
  assert.ok(meds.includes("paracetamol"));
});

test("Test 7 — General drug information classifies as drug_information", () => {
  const result = classifyIntentFallback("What is paracetamol used for?");
  assert.equal(result.intent, "drug_information");
  const meds = result.entities.medicines.map(m => m.toLowerCase());
  assert.ok(meds.includes("paracetamol"));
});

// ─── Medicine search / general inquiry ──────────────────────────────────────

test("Test 8 — Medicine search classifies as medicine_search (internal)", () => {
  const result = classifyIntentFallback("Where can I find Augmentin?");
  assert.equal(result.intent, "medicine_search");
  const meds = result.entities.medicines.map(m => m.toLowerCase());
  assert.ok(meds.includes("augmentin"));
});

// ─── Reminder ─────────────────────────────────────────────────────────────

test("Test 9 — Adherence confirmation classifies as reminder_response", () => {
  const result = classifyIntentFallback("I already took my medicine.");
  assert.equal(result.intent, "reminder_response");
});

test("Test 16 — Cancel reminder classifies as cancel_or_modify_reminder", () => {
  const result = classifyIntentFallback("Please cancel my reminder for metformin.");
  assert.equal(result.intent, "cancel_or_modify_reminder");
});

test("Test 17 — [SYSTEM]-prefixed message classifies as reminder_delivery", () => {
  const result = classifyIntentFallback("[SYSTEM] Time to take your metformin!");
  assert.equal(result.intent, "reminder_delivery");
});

// ─── Greeting ────────────────────────────────────────────────────────────────

test("Test 18 — 'Hi there' classifies as greeting", () => {
  const result = classifyIntentFallback("Hi there");
  assert.equal(result.intent, "greeting");
});

test("Test 19 — 'Good morning' classifies as greeting", () => {
  const result = classifyIntentFallback("Good morning!");
  assert.equal(result.intent, "greeting");
});

// ─── Emergency ───────────────────────────────────────────────────────────────

test("Test 20 — Chest pain classifies as emergency", () => {
  const result = classifyIntentFallback("I have chest pain and I can't breathe");
  assert.equal(result.intent, "emergency");
});

test("Test 21 — Overdose classifies as emergency", () => {
  const result = classifyIntentFallback("I think I took too many tablets — possible overdose");
  assert.equal(result.intent, "emergency");
});

// ─── Pharmacist consultation ─────────────────────────────────────────────────

test("Test 22 — 'I need to speak to a pharmacist' classifies as pharmacist_consultation", () => {
  const result = classifyIntentFallback("I need to speak to a pharmacist about my medication.");
  assert.equal(result.intent, "pharmacist_consultation");
});

// ─── Symptom report ──────────────────────────────────────────────────────────

test("Test 23 — Non-emergency symptom report classifies as symptom_report", () => {
  const result = classifyIntentFallback("I have been experiencing nausea for two days.");
  assert.equal(result.intent, "symptom_report");
});

// ─── Unknown / other ─────────────────────────────────────────────────────────

test("Test 10 — Ambiguous / non-medical query classifies as 'general_inquiry'", () => {
  const result = classifyIntentFallback("The weather today is cloudy and pleasant");
  assert.equal(result.intent, "general_inquiry");
});

// ─── Entity extraction ───────────────────────────────────────────────────────

test("Test 11 — extracts multi-word vitamin names cleanly without conversational noise", () => {
  const candidates = extractMedicineCandidates("Can I drink vitamin C if I already took paracetamol?");
  assert.deepEqual(candidates.map(c => c.toLowerCase()), ["vitamin c", "paracetamol"]);
});

// ─── toExternalIntent mapping ────────────────────────────────────────────────

test("Test 24 — drug_interaction maps to medication_question externally", () => {
  assert.equal(toExternalIntent("drug_interaction"), "medication_question");
});

test("Test 25 — drug_information maps to medication_question externally", () => {
  assert.equal(toExternalIntent("drug_information"), "medication_question");
});

test("Test 26 — side_effects maps to medication_question externally", () => {
  assert.equal(toExternalIntent("side_effects"), "medication_question");
});

test("Test 27 — medicine_search maps to general_inquiry externally", () => {
  assert.equal(toExternalIntent("medicine_search"), "general_inquiry");
});

test("Test 28 — reminder_response maps to cancel_or_modify_reminder externally", () => {
  assert.equal(toExternalIntent("reminder_response"), "cancel_or_modify_reminder");
});

test("Test 29 — unknown maps to general_inquiry externally", () => {
  assert.equal(toExternalIntent("unknown"), "general_inquiry");
});

test("Test 30 — emergency passes through unchanged externally", () => {
  assert.equal(toExternalIntent("emergency"), "emergency");
});

test("Test 31 — greeting passes through unchanged externally", () => {
  assert.equal(toExternalIntent("greeting"), "greeting");
});

test("Test 32 — pharmacist_consultation passes through unchanged externally", () => {
  assert.equal(toExternalIntent("pharmacist_consultation"), "pharmacist_consultation");
});

test("Test 33 — reminder_delivery passes through unchanged externally", () => {
  assert.equal(toExternalIntent("reminder_delivery"), "reminder_delivery");
});
