import test from "node:test";
import assert from "node:assert/strict";
import { UnconfiguredDrugInformationProvider } from "../src/knowledge/unconfigured-drug-information-provider.ts";
import { UnconfiguredRetriever } from "../src/knowledge/rag/unconfigured-retriever.ts";
import { MockLlmProvider } from "../src/llm/providers/mock-llm-provider.ts";
import { UnconfiguredLlmProvider } from "../src/llm/providers/unconfigured-llm-provider.ts";

test("LLM business boundary works through provider interface", async () => {
  const llm = new MockLlmProvider('{"intent":"unknown"}');
  const result = await llm.generate({
    messages: [{ role: "user", content: "hello" }],
    response_format: "json"
  });

  assert.equal(result.provider, "mock");
  assert.equal(result.content, '{"intent":"unknown"}');
});

test("unconfigured LLM provider fails explicitly", async () => {
  const llm = new UnconfiguredLlmProvider();

  await assert.rejects(
    () => llm.generate({ messages: [{ role: "user", content: "hello" }] }),
    /No LLM provider is configured/
  );
});

test("drug information provider is explicit when no approved source exists", async () => {
  const provider = new UnconfiguredDrugInformationProvider();

  await assert.rejects(
    () =>
      provider.getDrugInformation({
        medicine_name: "Paracetamol",
        language: "en",
        topics: ["overview"]
      }),
    /No approved drug-information source is configured/
  );
});

test("RAG fails closed when retrieval is required but unconfigured", async () => {
  const retriever = new UnconfiguredRetriever();

  await assert.rejects(
    () =>
      retriever.retrieve({
        query: "Paracetamol side effects",
        language: "en"
      }),
    /RAG is required/
  );
});
