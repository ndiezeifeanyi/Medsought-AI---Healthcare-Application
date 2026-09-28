import test from "node:test";
import assert from "node:assert/strict";
import { computeContentHash } from "../../../src/knowledge/ingestion/ingest.ts";

test("computeContentHash generates deterministic sha256 hashes", () => {
  const h1 = computeContentHash("Augmentin is an antibiotic");
  const h2 = computeContentHash("Augmentin is an antibiotic");
  const h3 = computeContentHash("Augmentin is an antibiotic ");

  assert.equal(h1, h2);
  assert.equal(h1, h3); // trimmed
  assert.notEqual(h1, computeContentHash("Paracetamol"));
});
