import test from "node:test";
import assert from "node:assert/strict";
import { RagPipeline } from "../src/knowledge/rag/rag-pipeline.ts";
import type { EvidenceChunk, RetrievalQuery, Retriever } from "../src/knowledge/retrieval/retriever.ts";

class MockSuccessRetriever implements Retriever {
  readonly name = "mock-success";
  async retrieve(_query: RetrievalQuery): Promise<EvidenceChunk[]> {
    return [
      {
        id: "chunk-1",
        text: "Paracetamol is an analgesic and antipyretic medication used to treat mild to moderate pain and fever.",
        score: 0.88,
        citation: {
          source_id: "doc-1",
          source_name: "BNF Essentials",
          url: "https://example.com/paracetamol",
          retrieved_at: new Date().toISOString()
        },
        metadata: { category: "analgesics" }
      }
    ];
  }
}

class MockEmptyRetriever implements Retriever {
  readonly name = "mock-empty";
  async retrieve(_query: RetrievalQuery): Promise<EvidenceChunk[]> {
    return [];
  }
}

class MockFailingRetriever implements Retriever {
  readonly name = "mock-failing";
  async retrieve(_query: RetrievalQuery): Promise<EvidenceChunk[]> {
    throw new Error("MongoDB connection timeout: unable to reach server");
  }
}

test("RAG pipeline retrieves relevant evidence and sets observability", async () => {
  const pipeline = new RagPipeline(new MockSuccessRetriever());
  const result = await pipeline.buildGroundingContext({
    query: "What is paracetamol?",
    language: "en"
  });

  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].id, "chunk-1");
  assert.deepEqual(result.source_names, ["BNF Essentials"]);
  assert.equal(result.observability.rag_attempted, true);
  assert.equal(result.observability.rag_used, true);
  assert.equal(result.observability.rag_result_count, 1);
  assert.equal(result.observability.rag_failure, false);
  assert.ok(result.observability.retrieval_latency_ms >= 0);
});

test("RAG pipeline handles no results gracefully without throwing", async () => {
  const pipeline = new RagPipeline(new MockEmptyRetriever());
  const result = await pipeline.buildGroundingContext({
    query: "Nonexistent topic xyz",
    language: "en"
  });

  assert.equal(result.evidence.length, 0);
  assert.deepEqual(result.source_names, []);
  assert.equal(result.observability.rag_attempted, true);
  assert.equal(result.observability.rag_used, false);
  assert.equal(result.observability.rag_result_count, 0);
  assert.equal(result.observability.rag_failure, false);
});

test("RAG pipeline handles technical retrieval failure gracefully", async () => {
  const pipeline = new RagPipeline(new MockFailingRetriever());
  const result = await pipeline.buildGroundingContext({
    query: "What is paracetamol?",
    language: "en"
  });

  assert.equal(result.evidence.length, 0);
  assert.deepEqual(result.source_names, []);
  assert.equal(result.observability.rag_attempted, true);
  assert.equal(result.observability.rag_used, false);
  assert.equal(result.observability.rag_result_count, 0);
  assert.equal(result.observability.rag_failure, true);
});
