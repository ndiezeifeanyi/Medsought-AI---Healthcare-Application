import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { ingestDocuments } from "../src/knowledge/ingestion/ingest.ts";

// Simple .env loader for CLI usage
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
      // ignore missing .env
    }
  }
}

loadDotEnv();

async function main() {
  const args = process.argv.slice(2);
  const approveImmediately = args.includes("--approve-all") || args.includes("--approve");
  const forceReindex = args.includes("--force") || args.includes("--force-reindex");

  console.log("Starting MedSought AI knowledge ingestion...");
  if (approveImmediately) {
    console.log("Flag --approve-all detected: newly ingested chunks will be marked status='approved'.");
  } else {
    console.log("Ingesting chunks with status='pending' (review gate active).");
  }

  const result = await ingestDocuments({
    approveImmediately,
    forceReindex
  });

  console.log("\n=========================================");
  console.log("Ingestion Summary:");
  console.log(`- Total source files processed: ${result.totalFiles}`);
  console.log(`- Total chunks generated:      ${result.totalChunks}`);
  console.log(`- New / re-embedded chunks:    ${result.newChunks}`);
  console.log(`- Unchanged (cached) chunks:   ${result.skippedChunks}`);
  console.log(`- Orphaned chunks deleted:     ${result.orphanChunksDeleted}`);
  console.log(`- Embedding model used:        ${result.embeddingModel}`);
  console.log(`- Output dimensions:           ${result.outputDimensions}`);
  console.log(`- Local index written:         ${result.localIndexWritten}`);
  console.log("=========================================\n");
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});

