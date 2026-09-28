import test from "node:test";
import assert from "node:assert/strict";
import { GeminiEmbeddingProvider } from "../../../src/knowledge/retrieval/embedding-provider.ts";

test("GeminiEmbeddingProvider defaults to gemini-embedding-2 and 768 dimensions", () => {
  const provider = new GeminiEmbeddingProvider("mock-api-key");
  assert.equal(provider.model, "gemini-embedding-2");
  assert.equal(provider.dimensions, 768);
});

test("GeminiEmbeddingProvider respects custom dimensions and model overrides", () => {
  const provider = new GeminiEmbeddingProvider("mock-api-key", "custom-model", 3072);
  assert.equal(provider.model, "custom-model");
  assert.equal(provider.dimensions, 3072);
});

test("GeminiEmbeddingProvider throws if no API key provided", () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldMedsoughtKey = process.env.MEDSOUGHT_LLM_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.MEDSOUGHT_LLM_API_KEY;

  try {
    assert.throws(() => new GeminiEmbeddingProvider(""), {
      message: /GEMINI_API_KEY is required/
    });
  } finally {
    if (oldKey) process.env.GEMINI_API_KEY = oldKey;
    if (oldMedsoughtKey) process.env.MEDSOUGHT_LLM_API_KEY = oldMedsoughtKey;
  }
});
