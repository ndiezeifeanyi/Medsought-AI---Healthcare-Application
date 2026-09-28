import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { createHash } from "node:crypto";
import { GeminiEmbeddingProvider } from "../retrieval/embedding-provider.ts";
import { MongoDBRetriever } from "../retrieval/mongodb-retriever.ts";
import { chunkMarkdown } from "./chunker.ts";
import { createLogger, type Logger } from "../../logging/logger.ts";

export interface IngestionOptions {
  sourcesDir?: string;
  localIndexPath?: string;
  approveImmediately?: boolean;
  forceReindex?: boolean;
  logger?: Logger;
  mongoUri?: string;
  database?: string;
  collection?: string;
  apiKey?: string;
}

export interface IngestionResult {
  totalFiles: number;
  totalChunks: number;
  newChunks: number;
  skippedChunks: number;
  orphanChunksDeleted: number;
  embeddingModel: string;
  outputDimensions: number;
  localIndexWritten: boolean;
}

function listFiles(dir: string, exts = [".md"]): string[] {
  const out: string[] = [];
  try {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        out.push(...listFiles(full, exts));
      } else if (exts.includes(extname(full))) {
        out.push(full);
      }
    }
  } catch {
    // Directory might not exist or be empty
  }
  return out;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function buildVocab(docs: string[][], minFreq = 1): string[] {
  const freq = new Map<string, number>();
  for (const d of docs) {
    for (const t of d) {
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }
  return [...freq.entries()].filter(([, c]) => c >= minFreq).map(([t]) => t);
}

function vectorize(tokens: string[], vocab: string[]): number[] {
  const vec = new Array(vocab.length).fill(0);
  for (const t of tokens) {
    const i = vocab.indexOf(t);
    if (i >= 0) vec[i] += 1;
  }
  return vec;
}

export function computeContentHash(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

/**
 * Core reusable ingestion pipeline:
 * 1. Discovers and parses Markdown source files
 * 2. Chunks documents with header context, token clamping, and overlap
 * 3. Builds local fallback Bag-of-Words index (ai_service/knowledge/index.json)
 * 4. Connects to MongoDB Atlas if configured:
 *    - Checks content hashes to skip re-embedding unchanged chunks
 *    - Generates dense vectors using GeminiEmbeddingProvider (gemini-embedding-2)
 *    - Upserts chunks with status (default "pending" or "approved" if approveImmediately)
 *    - Deletes orphaned chunk IDs if source file shrank
 */
export async function ingestDocuments(options: IngestionOptions = {}): Promise<IngestionResult> {
  const logger = options.logger ?? createLogger("info");
  const sourcesDir = options.sourcesDir ?? join(process.cwd(), "ai_service/knowledge/sources");
  const localIndexPath = options.localIndexPath ?? join(process.cwd(), "ai_service/knowledge/index.json");
  const approveImmediately = options.approveImmediately ?? false;
  const forceReindex = options.forceReindex ?? false;

  const files = listFiles(sourcesDir, [".md"]);
  logger.info("Starting ingestion", { sourcesDir, fileCount: files.length });

  const allChunks: Array<{
    id: string;
    file: string;
    chunkIndex: number;
    text: string;
    contentHash: string;
    tokens: string[];
    headerPath: string;
    tokenCount: number;
  }> = [];

  const docsTokens: string[][] = [];

  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const markdownChunks = chunkMarkdown(raw);

    for (const mc of markdownChunks) {
      const tokens = tokenize(mc.text);
      docsTokens.push(tokens);
      allChunks.push({
        id: `${file}#${mc.index}`,
        file,
        chunkIndex: mc.index,
        text: mc.text,
        contentHash: computeContentHash(mc.text),
        tokens,
        headerPath: mc.headerPath,
        tokenCount: mc.tokenCount
      });
    }
  }

  // 1. Build local bag-of-words index for in-memory retriever fallback
  const vocab = buildVocab(docsTokens, 1);
  const localChunks = allChunks.map((c) => ({
    id: c.id,
    text: c.text,
    citation: {
      source_id: c.file,
      source_name: "local_docs",
      url: null,
      retrieved_at: new Date().toISOString()
    },
    metadata: {
      headerPath: c.headerPath,
      tokenCount: c.tokenCount,
      contentHash: c.contentHash,
      vector: vectorize(c.tokens, vocab)
    }
  }));

  const localIndexDir = join(localIndexPath, "..");
  mkdirSync(localIndexDir, { recursive: true });
  writeFileSync(localIndexPath, JSON.stringify({ chunks: localChunks, vocab }, null, 2), "utf8");
  logger.info("Wrote local inmemory index", {
    path: localIndexPath,
    chunkCount: localChunks.length,
    vocabCount: vocab.length
  });

  let newChunks = 0;
  let skippedChunks = 0;
  let orphanChunksDeleted = 0;
  let embeddingModel = "none";
  let outputDimensions = 0;

  // 2. Ingest into MongoDB Atlas Vector Search if configured
  const mongoUri = options.mongoUri ?? process.env.MONGODB_URI;
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.MEDSOUGHT_LLM_API_KEY;

  if (mongoUri && apiKey) {
    logger.info("Connecting to MongoDB for vector ingestion...");
    const embeddingProvider = new GeminiEmbeddingProvider(apiKey);
    embeddingModel = embeddingProvider.model;
    outputDimensions = embeddingProvider.dimensions;

    const database = options.database ?? process.env.MONGODB_DATABASE ?? "medsought";
    const collection = options.collection ?? process.env.MONGODB_COLLECTION ?? "knowledge_chunks";

    const retriever = new MongoDBRetriever(
      { uri: mongoUri, database, collection },
      embeddingProvider,
      logger
    );

    // Group chunks by file to manage caching and orphan cleanup per file
    const fileChunksMap = new Map<string, typeof allChunks>();
    for (const chunk of allChunks) {
      const list = fileChunksMap.get(chunk.file) ?? [];
      list.push(chunk);
      fileChunksMap.set(chunk.file, list);
    }

    for (const [file, chunks] of fileChunksMap.entries()) {
      // Fetch existing chunks from MongoDB for this file
      const existingChunks = await retriever.getExistingChunks(file);
      const activeIds = chunks.map((c) => c.id);

      for (const chunk of chunks) {
        const existing = existingChunks.get(chunk.id);

        // Check if chunk is identical in content and embedding model
        const isUnchanged =
          !forceReindex &&
          existing &&
          existing.contentHash === chunk.contentHash &&
          existing.embeddingModel === embeddingModel;

        if (isUnchanged) {
          skippedChunks++;
          continue;
        }

        // Generate embedding and upsert
        const embedding = await embeddingProvider.embed(chunk.text);
        const status = approveImmediately
          ? "approved"
          : (existing?.status as "pending" | "approved") ?? "pending";

        await retriever.upsert({
          id: chunk.id,
          text: chunk.text,
          embedding,
          embeddingModel,
          status,
          contentHash: chunk.contentHash,
          source_id: chunk.file,
          source_name: "local_docs",
          url: undefined,
          metadata: {
            headerPath: chunk.headerPath,
            tokenCount: chunk.tokenCount,
            dimensions: outputDimensions
          }
        });

        newChunks++;
      }

      // Cleanup orphan chunks if the file shrank
      const deleted = await retriever.deleteOrphanChunks(file, activeIds);
      orphanChunksDeleted += deleted;
    }

    await retriever.close();
    logger.info("MongoDB vector ingestion completed", {
      totalChunks: allChunks.length,
      newChunks,
      skippedChunks,
      orphanChunksDeleted,
      embeddingModel,
      dimensions: outputDimensions
    });
  } else {
    logger.warn("MONGODB_URI or GEMINI_API_KEY missing; skipped MongoDB vector ingestion.");
  }

  return {
    totalFiles: files.length,
    totalChunks: allChunks.length,
    newChunks,
    skippedChunks,
    orphanChunksDeleted,
    embeddingModel,
    outputDimensions,
    localIndexWritten: true
  };
}
