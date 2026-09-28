import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/configuration/config.ts";

test("loads default configuration with approved disclaimer and RAG settings", () => {
  const config = loadConfig({});

  assert.deepEqual(config.supported_languages, ["en", "ha", "yo", "ig"]);
  assert.equal(config.rag.enabled, true);
  assert.equal(config.rag.required, true);
  assert.equal(config.rag.relevance_threshold, 0.7);
  assert.equal(config.safety.disclaimer_text, "Disclaimer; Educational only. Not medical advice.");
  assert.equal(config.safety.emergency_escalation_rules_enabled, false);
});

test("keeps providers unselected until explicitly configured", () => {
  const config = loadConfig({});

  assert.equal(config.providers.llm, undefined);
  assert.equal(config.providers.drug_information, undefined);
  assert.equal(config.providers.retrieval, undefined);
  assert.equal(config.providers.translation, undefined);
});
