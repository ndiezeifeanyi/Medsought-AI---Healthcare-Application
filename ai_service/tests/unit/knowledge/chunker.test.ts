import test from "node:test";
import assert from "node:assert/strict";
import { chunkMarkdown, estimateTokens } from "../../../src/knowledge/ingestion/chunker.ts";

test("estimateTokens provides reasonable approximations", () => {
  assert.equal(estimateTokens(""), 0);
  const text = "Paracetamol is an analgesic and antipyretic drug.";
  const tokens = estimateTokens(text);
  assert.ok(tokens >= 7 && tokens <= 20);
});

test("chunkMarkdown preserves header hierarchy and paths", () => {
  const md = `
# Antibiotics
General introduction to antibiotics.

## Penicillins
Amoxicillin is a penicillin antibiotic.

### Augmentin
Augmentin combines amoxicillin with clavulanic acid.
`.trim();

  const chunks = chunkMarkdown(md);
  assert.ok(chunks.length >= 3);

  assert.ok(chunks[0].headerPath.includes("Antibiotics"));
  assert.ok(chunks[0].text.includes("[Antibiotics]"));

  assert.ok(chunks[1].headerPath.includes("Antibiotics > Penicillins"));
  assert.ok(chunks[1].text.includes("Amoxicillin"));

  assert.ok(chunks[2].headerPath.includes("Antibiotics > Penicillins > Augmentin"));
  assert.ok(chunks[2].text.includes("clavulanic acid"));
});

test("chunkMarkdown splits long sections with overlap and token clamping", () => {
  const paragraph = "This is a detailed paragraph explaining drug pharmacology and clinical dosage guidelines in detail. ".repeat(10);
  const longMd = `
# Long Medical Section
${paragraph}

${paragraph}

${paragraph}
`.trim();

  const chunks = chunkMarkdown(longMd, { maxTokens: 100, overlapTokens: 25 });
  assert.ok(chunks.length > 1, "Should split long section into multiple chunks");

  for (const chunk of chunks) {
    assert.ok(chunk.tokenCount <= 200, "Each chunk should be clamped within bounds");
    assert.ok(chunk.text.includes("[Long Medical Section]"), "Each chunk should retain section header context");
  }
});
