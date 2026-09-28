import { loadConfig } from "../src/configuration/config.ts";
import { classifyIntentFallback } from "../src/conversation/intent.ts";
import { SyntheticDrugInformationProvider } from "../tests/fixtures/synthetic-drug-information-provider.ts";
import { MedicineIdentifier } from "../src/medical/medicine-identifier.ts";
import { RagPipeline } from "../src/knowledge/rag/rag-pipeline.ts";
import { InMemoryRetriever } from "../src/knowledge/retrieval/inmemory-retriever.ts";

async function run() {
  const cfg = loadConfig({});
  const message = "What is Augmentin?";
  console.log('Message:', message);

  const classification = classifyIntentFallback(message);
  console.log('Intent:', classification.intent, 'Confidence:', classification.confidence);
  console.log('Medicine candidates:', classification.entities.medicines);

  const provider = new SyntheticDrugInformationProvider();
  console.log('Using provider (fixture):', provider.name);

  const med = classification.entities.medicines.length > 0 ? classification.entities.medicines[0] : message;
  try {
    const lookup = await provider.getDrugInformation({ medicine_name: med, language: 'en', topics: ['overview'] as any });
    console.log('Provider lookup found:', lookup.found, 'citations length:', lookup.citations?.length ?? 0);
    if (lookup.found) {
      console.log('Available topics:', Object.keys(lookup.topics));
    }
  } catch (e) {
    console.error('Provider lookup error', String(e));
  }

  console.log('Config providers:', cfg.providers);
  console.log('RAG enabled:', cfg.rag.enabled, 'required:', cfg.rag.required);

  // Quick RAG instantiation test (in-memory)
  try {
    const retriever = new InMemoryRetriever();
    const rag = new RagPipeline(retriever as any);
    console.log('RAG pipeline instantiated successfully (in-memory).');
  } catch (e) {
    console.log('RAG pipeline instantiation failed or not configured:', String(e));
  }

  console.log('LLM provider configured in env:', cfg.providers.llm ?? '<not set>');
  console.log('Note: OpenAI adapter is a stub in this workspace (not implemented).');
}

run().catch((e) => { console.error('Diagnostic failed:', e); process.exit(1); });
