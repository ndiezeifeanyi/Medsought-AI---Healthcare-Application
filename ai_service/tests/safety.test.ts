import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/configuration/config.ts";
import { SafetyValidator } from "../src/safety/validator.ts";

test("adds approved disclaimer to grounded medical content", () => {
  const validator = new SafetyValidator(loadConfig({}));
  const result = validator.validate({
    response: "This is educational medication information from approved evidence.",
    is_medical_content: true,
    has_grounding_evidence: true
  });

  assert.equal(result.status, "needs_fallback");
  assert.match(result.response, /Disclaimer; Educational only\. Not medical advice\./);
});

test("blocks medical content without grounding evidence", () => {
  const validator = new SafetyValidator(loadConfig({}));
  const result = validator.validate({
    response: "This medicine has several effects.",
    is_medical_content: true,
    has_grounding_evidence: false
  });

  assert.equal(result.status, "needs_fallback");
  assert.match(result.findings.join(" "), /missing approved medical grounding evidence/);
  assert.match(result.response, /Disclaimer; Educational only\. Not medical advice\./);
});

test("blocks diagnosis-style responses", () => {
  const validator = new SafetyValidator(loadConfig({}));
  const result = validator.validate({
    response: "You have malaria.",
    is_medical_content: true,
    has_grounding_evidence: true
  });

  assert.equal(result.status, "blocked");
  assert.match(result.findings.join(" "), /diagnose/);
});

test("does NOT block standard conditional advisory language containing 'if you have'", () => {
  const validator = new SafetyValidator(loadConfig({}));
  const result = validator.validate({
    response: "Yes, generally you can take vitamin C after taking paracetamol. If you have any underlying medical conditions or are taking other medications, speak with a doctor.",
    is_medical_content: true,
    has_grounding_evidence: true
  });

  assert.notEqual(result.status, "blocked");
  assert.equal(result.findings.some(f => /diagnose/i.test(f)), false);
});

test("blocks authoritative diagnosis declarations", () => {
  const validator = new SafetyValidator(loadConfig({}));
  
  const testCases = [
    "You are definitely diagnosed with malaria.",
    "My clinical diagnosis is that you have typhoid.",
    "Your symptoms confirm that you have pneumonia."
  ];

  for (const text of testCases) {
    const res = validator.validate({
      response: text,
      is_medical_content: true,
      has_grounding_evidence: true
    });
    assert.equal(res.status, "blocked", `Expected "${text}" to be blocked`);
  }
});
