import { InMemoryRetriever } from "../src/knowledge/retrieval/inmemory-retriever.ts";
import { RagPipeline } from "../src/knowledge/rag/rag-pipeline.ts";

async function run() {
  const retriever = new InMemoryRetriever();
  const rag = new RagPipeline(retriever as any);
  const ctx = await rag.buildGroundingContext({ query: "paracetamol side effects", language: "en", limit: 5 });
  console.log(`Found ${ctx.evidence.length} evidence chunks from ${ctx.source_names.join(", ")}`);
  for (const e of ctx.evidence) {
    console.log(`--- ${e.id} (${e.score.toFixed(2)})`);
    console.log(e.text.slice(0, 200).replace(/\n/g, " ") + "...\n");
  }
}

run().catch(e => { console.error(e); process.exit(1); });
