import test from "node:test";
import assert from "node:assert/strict";
import { MockTranslator } from "../src/translation/providers/mock-translator.ts";

test("preserves protected medical terms during translation", async () => {
  const translator = new MockTranslator();
  const res = await translator.translate({
    text: "Take Paracetamol 500 mg twice daily",
    target_language: "yo",
    protected_terms: ["Paracetamol", "500 mg"]
  });

  assert.equal(res.preserved_terms.length, 2);
  assert.match(res.text, /Paracetamol/);
  assert.match(res.text, /500 mg/);
  assert.equal(res.provider, "mock-translator");
});
