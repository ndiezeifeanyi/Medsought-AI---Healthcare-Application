import test from "node:test";
import assert from "node:assert/strict";
import { MongoDBRetriever } from "../src/knowledge/retrieval/mongodb-retriever.ts";
import type { EmbeddingProvider } from "../src/knowledge/retrieval/embedding-provider.ts";

class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = "mock-embedding";
  readonly dimensions = 4;

  async embed(_text: string): Promise<number[]> {
    return [0.1, 0.2, 0.3, 0.4];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => [0.1, 0.2, 0.3, 0.4]);
  }
}

test("MongoDBRetriever initializes with default configuration", () => {
  const embeddingProvider = new MockEmbeddingProvider();
  const retriever = new MongoDBRetriever(
    {
      url: "mongodb://localhost:27017",
      database: "medsought",
      collection: "knowledge_chunks"
    },
    embeddingProvider
  );

  assert.equal(retriever.name, "mongodb");
});

test("MongoDBRetriever handles connection failure gracefully on retrieve", async () => {
  const embeddingProvider = new MockEmbeddingProvider();
  // Using an invalid host/port that will immediately fail or timeout
  const retriever = new MongoDBRetriever(
    {
      uri: "mongodb://invalid-host-definitely-does-not-exist:27017",
      database: "medsought",
      collection: "knowledge_chunks",
      relevanceThreshold: 0.7
    },
    embeddingProvider
  );

  // Must not throw — should return empty array for graceful degradation
  const results = await retriever.retrieve({
    query: "paracetamol dosage",
    language: "en"
  });

  assert.deepEqual(results, []);
  await retriever.close();
});
