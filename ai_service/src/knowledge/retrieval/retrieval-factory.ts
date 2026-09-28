/**
 * Retrieval factory — resolves the configured retriever provider.
 *
 * Reads MEDSOUGHT_RETRIEVAL_PROVIDER from environment/config and returns
 * the appropriate Retriever implementation:
 *   - "mongodb"    → MongoDBRetriever (production)
 *   - "inmemory"   → InMemoryRetriever (local dev / fallback)
 *   - anything else → UnconfiguredRetriever (throws on use)
 */

import type { AiRuntimeConfig } from "../../configuration/config.ts";
import type { Retriever } from "./retriever.ts";
import { InMemoryRetriever } from "./inmemory-retriever.ts";
import { UnconfiguredRetriever } from "../rag/unconfigured-retriever.ts";
import { MongoDBRetriever } from "./mongodb-retriever.ts";
import { GeminiEmbeddingProvider } from "./embedding-provider.ts";
import { createLogger } from "../../logging/logger.ts";

/** Singleton MongoDB retriever instance for connection reuse. */
let mongoRetrieverInstance: MongoDBRetriever | null = null;

export function resolveRetriever(
  config: AiRuntimeConfig,
  env: Record<string, string | undefined> = process.env
): Retriever {
  const providerName = (
    config.providers.retrieval
    ?? env.MEDSOUGHT_RETRIEVAL_PROVIDER
    ?? ""
  ).toLowerCase();

  const logger = createLogger((config.log_level ?? "info") as any);

  if (providerName === "mongodb") {
    if (mongoRetrieverInstance) return mongoRetrieverInstance;

    const uri = env.MONGODB_URI ?? "";
    const database = env.MONGODB_DATABASE ?? "medsought";
    const collection = env.MONGODB_COLLECTION ?? "knowledge_chunks";
    const threshold = env.RAG_RELEVANCE_THRESHOLD
      ? parseFloat(env.RAG_RELEVANCE_THRESHOLD)
      : config.rag.relevance_threshold;

    if (!uri) {
      logger.warn("MONGODB_URI not set; falling back to unconfigured retriever");
      return new UnconfiguredRetriever();
    }

    let embeddingProvider;
    try {
      embeddingProvider = new GeminiEmbeddingProvider();
    } catch {
      logger.warn("Embedding provider unavailable (no API key); falling back to unconfigured retriever");
      return new UnconfiguredRetriever();
    }

    mongoRetrieverInstance = new MongoDBRetriever(
      { uri, database, collection, relevanceThreshold: threshold },
      embeddingProvider,
      logger
    );

    return mongoRetrieverInstance;
  }

  if (providerName === "inmemory") {
    return new InMemoryRetriever();
  }

  return new UnconfiguredRetriever();
}

/**
 * Gracefully shut down the MongoDB retriever connection if one exists.
 * Call during application shutdown.
 */
export async function shutdownRetriever(): Promise<void> {
  if (mongoRetrieverInstance) {
    await mongoRetrieverInstance.close();
    mongoRetrieverInstance = null;
  }
}
