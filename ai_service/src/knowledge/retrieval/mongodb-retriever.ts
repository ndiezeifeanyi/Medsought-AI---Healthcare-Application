/**
 * MongoDB Atlas Vector Search retriever implementation.
 *
 * Implements the Retriever interface using MongoDB's $vectorSearch
 * aggregation stage for semantic similarity search.
 *
 * Requires:
 * - MongoDB Atlas cluster with a vector search index named "vector_index"
 *   on the configured collection
 * - Documents with fields: _id, text, embedding (array<number>),
 *   source_id, source_name, url, retrieved_at, metadata
 */

import dns from "node:dns";
import { MongoClient, type Collection, type Db, type Document } from "mongodb";
import type { EvidenceChunk, RetrievalQuery, Retriever } from "./retriever.ts";
import type { EmbeddingProvider } from "./embedding-provider.ts";
import { createLogger, type Logger } from "../../logging/logger.ts";

try {
  dns.setDefaultResultOrder?.("ipv4first");
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch {
  // ignore environments where custom DNS servers cannot be set
}

export interface MongoDBRetrieverConfig {
  uri: string;
  database: string;
  collection: string;
  /** Name of the Atlas vector search index. Defaults to "vector_index". */
  indexName?: string;
  /** Minimum similarity score to consider a result relevant. Defaults to 0.7. */
  relevanceThreshold?: number;
  /** Maximum results to return. Defaults to 5. */
  defaultLimit?: number;
}

export class MongoDBRetriever implements Retriever {
  readonly name = "mongodb";
  private readonly config: Required<MongoDBRetrieverConfig>;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly logger: Logger;
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private collection: Collection<Document> | null = null;

  constructor(
    config: MongoDBRetrieverConfig,
    embeddingProvider: EmbeddingProvider,
    logger?: Logger
  ) {
    this.config = {
      ...config,
      indexName: config.indexName ?? "vector_index",
      relevanceThreshold: config.relevanceThreshold ?? 0.7,
      defaultLimit: config.defaultLimit ?? 5
    };
    this.embeddingProvider = embeddingProvider;
    this.logger = logger ?? createLogger("info");
  }

  /**
   * Lazily connect to MongoDB. Connection is reused across calls.
   */
  private async ensureConnected(): Promise<Collection<Document>> {
    if (this.collection) return this.collection;

    this.client = new MongoClient(this.config.uri, {
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000
    });

    await this.client.connect();
    this.db = this.client.db(this.config.database);
    this.collection = this.db.collection(this.config.collection);
    this.logger.info("MongoDB retriever connected", {
      database: this.config.database,
      collection: this.config.collection
    });

    return this.collection;
  }

  async retrieve(query: RetrievalQuery): Promise<EvidenceChunk[]> {
    const startTime = Date.now();
    const limit = query.limit ?? this.config.defaultLimit;

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingProvider.embed(query.query);

      const col = await this.ensureConnected();

      // Build the $vectorSearch aggregation pipeline
      const pipeline: Document[] = [
        {
          $vectorSearch: {
            index: this.config.indexName,
            path: "embedding",
            queryVector: queryEmbedding,
            numCandidates: limit * 10,
            limit: limit
          }
        },
        {
          $addFields: {
            score: { $meta: "vectorSearchScore" }
          }
        }
      ];

      // Apply metadata filters if provided
      if (query.filters && Object.keys(query.filters).length > 0) {
        const filterConditions: Document = {};
        for (const [key, value] of Object.entries(query.filters)) {
          filterConditions[`metadata.${key}`] = value;
        }
        // Insert filter as pre-filter in vectorSearch if supported,
        // otherwise as a $match stage after
        pipeline.push({ $match: filterConditions });
      }

      // Review gate: only retrieve chunks that have been reviewed and approved
      pipeline.push({
        $match: {
          status: "approved"
        }
      });

      // Project only needed fields
      pipeline.push({
        $project: {
          _id: 1,
          text: 1,
          score: 1,
          status: 1,
          embeddingModel: 1,
          source_id: 1,
          source_name: 1,
          url: 1,
          retrieved_at: 1,
          metadata: 1
        }
      });

      const results = await col.aggregate(pipeline).toArray();

      const latency = Date.now() - startTime;
      this.logger.info("MongoDB vector search completed", {
        query_length: query.query.length,
        results_total: results.length,
        retrieval_latency_ms: latency
      });

      // Filter by relevance threshold and map to EvidenceChunk
      const evidenceChunks: EvidenceChunk[] = results
        .filter((doc) => (doc.score ?? 0) >= this.config.relevanceThreshold)
        .map((doc) => ({
          id: String(doc._id),
          text: doc.text ?? "",
          score: doc.score ?? 0,
          citation: {
            source_id: doc.source_id ?? String(doc._id),
            source_name: doc.source_name ?? "mongodb",
            url: doc.url ?? undefined,
            retrieved_at: doc.retrieved_at ?? new Date().toISOString()
          },
          metadata: {
            ...(doc.metadata ?? {}),
            status: doc.status,
            embeddingModel: doc.embeddingModel
          }
        }));

      return evidenceChunks;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.logger.error("MongoDB retrieval failed", {
        error: String(error),
        retrieval_latency_ms: latency
      });
      // Return empty array for graceful degradation — caller decides how to handle
      return [];
    }
  }

  /**
   * Insert or update a document with its embedding into the MongoDB collection.
   * Default status is "pending" until approved.
   */
  async upsert(doc: {
    id: string;
    text: string;
    embedding: number[];
    source_id: string;
    source_name: string;
    url?: string;
    metadata?: Record<string, unknown>;
    embeddingModel?: string;
    status?: "pending" | "approved";
    contentHash?: string;
  }): Promise<void> {
    const col = await this.ensureConnected();
    await col.updateOne(
      { _id: doc.id as any },
      {
        $set: {
          text: doc.text,
          embedding: doc.embedding,
          embeddingModel: doc.embeddingModel ?? this.embeddingProvider.model ?? "gemini-embedding-2",
          status: doc.status ?? "pending",
          ...(doc.contentHash ? { contentHash: doc.contentHash } : {}),
          source_id: doc.source_id,
          source_name: doc.source_name,
          url: doc.url ?? null,
          retrieved_at: new Date().toISOString(),
          metadata: doc.metadata ?? {}
        }
      },
      { upsert: true }
    );
  }

  /**
   * Retrieve existing chunk content hashes and embedding models for a specific source file.
   * Used for change detection to skip re-embedding unchanged chunks.
   */
  async getExistingChunks(sourceId: string): Promise<Map<string, { contentHash?: string; embeddingModel?: string; status?: string }>> {
    const col = await this.ensureConnected();
    const docs = await col
      .find({ source_id: sourceId })
      .project({ _id: 1, contentHash: 1, embeddingModel: 1, status: 1 })
      .toArray();

    const map = new Map<string, { contentHash?: string; embeddingModel?: string; status?: string }>();
    for (const doc of docs) {
      map.set(String(doc._id), {
        contentHash: doc.contentHash,
        embeddingModel: doc.embeddingModel,
        status: doc.status
      });
    }
    return map;
  }

  /**
   * Remove chunks belonging to a source file that are no longer present in the updated file.
   */
  async deleteOrphanChunks(sourceId: string, activeIds: string[]): Promise<number> {
    const col = await this.ensureConnected();
    const res = await col.deleteMany({
      source_id: sourceId,
      _id: { $nin: activeIds as any[] }
    });
    return res.deletedCount;
  }

  /**
   * Approve chunks for retrieval by transitioning status from "pending" to "approved".
   */
  async approveChunks(filter: { ids?: string[]; sourceId?: string } = {}): Promise<number> {
    const col = await this.ensureConnected();
    const query: Document = {};
    if (filter.ids && filter.ids.length > 0) {
      query._id = { $in: filter.ids as any[] };
    }
    if (filter.sourceId) {
      query.source_id = filter.sourceId;
    }
    const res = await col.updateMany(query, {
      $set: { status: "approved", approved_at: new Date().toISOString() }
    });
    return res.modifiedCount;
  }

  /**
   * Close the MongoDB connection gracefully.
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.collection = null;
      this.logger.info("MongoDB retriever connection closed");
    }
  }
}
