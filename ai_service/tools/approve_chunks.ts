import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MongoDBRetriever } from "../src/knowledge/retrieval/mongodb-retriever.ts";
import { GeminiEmbeddingProvider } from "../src/knowledge/retrieval/embedding-provider.ts";

function loadDotEnv() {
  const envPaths = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "ai_service/.env")
  ];
  for (const p of envPaths) {
    try {
      const raw = readFileSync(p, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx <= 0) continue;
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    } catch {
      // ignore
    }
  }
}

loadDotEnv();

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.MEDSOUGHT_LLM_API_KEY;

  if (!mongoUri || !apiKey) {
    console.error("MONGODB_URI and GEMINI_API_KEY must be set in environment.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const sourceIdArg = args.find((a) => a.startsWith("--source="))?.split("=")[1];
  const idArg = args.find((a) => a.startsWith("--id="))?.split("=")[1];

  const embeddingProvider = new GeminiEmbeddingProvider(apiKey);
  const retriever = new MongoDBRetriever(
    {
      uri: mongoUri,
      database: process.env.MONGODB_DATABASE ?? "medsought",
      collection: process.env.MONGODB_COLLECTION ?? "knowledge_chunks"
    },
    embeddingProvider
  );

  const filter: { ids?: string[]; sourceId?: string } = {};
  if (idArg) filter.ids = [idArg];
  if (sourceIdArg) filter.sourceId = sourceIdArg;

  console.log("Approving chunks with filter:", filter);
  const count = await retriever.approveChunks(filter);
  console.log(`Successfully approved ${count} chunk(s) for live RAG retrieval.`);

  await retriever.close();
}

main().catch((err) => {
  console.error("Failed to approve chunks:", err);
  process.exit(1);
});
