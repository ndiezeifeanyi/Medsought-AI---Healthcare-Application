import type { EvidenceChunk, RetrievalQuery, Retriever } from "../retrieval/retriever.ts";
import { createLogger, type Logger } from "../../logging/logger.ts";

export interface RagObservability {
  rag_attempted: boolean;
  rag_used: boolean;
  rag_result_count: number;
  rag_failure: boolean;
  retrieval_latency_ms: number;
}

export interface RagGroundingContext {
  query: RetrievalQuery;
  evidence: EvidenceChunk[];
  source_names: string[];
  observability: RagObservability;
}

export class RagPipeline {
  private readonly retriever: Retriever;
  private readonly logger: Logger;

  constructor(retriever: Retriever, logger?: Logger) {
    this.retriever = retriever;
    this.logger = logger ?? createLogger("info");
  }

  /**
   * Attempt RAG retrieval and return grounding context with observability metadata.
   *
   * Graceful behavior:
   * - If relevant evidence is found → returns evidence + rag_used=true
   * - If no relevant evidence → returns empty evidence + rag_used=false (no error)
   * - If retrieval fails technically → logs error, returns empty evidence + rag_failure=true
   */
  async buildGroundingContext(
    query: RetrievalQuery
  ): Promise<RagGroundingContext> {
    const startTime = Date.now();

    const observability: RagObservability = {
      rag_attempted: true,
      rag_used: false,
      rag_result_count: 0,
      rag_failure: false,
      retrieval_latency_ms: 0
    };

    try {
      const evidence = await this.retriever.retrieve(query);
      observability.retrieval_latency_ms = Date.now() - startTime;
      observability.rag_result_count = evidence.length;

      if (evidence.length > 0) {
        observability.rag_used = true;
        this.logger.info("RAG retrieval succeeded", {
          retriever: this.retriever.name,
          result_count: evidence.length,
          latency_ms: observability.retrieval_latency_ms
        });
      } else {
        this.logger.info("RAG retrieval returned no relevant results", {
          retriever: this.retriever.name,
          query_length: query.query.length,
          latency_ms: observability.retrieval_latency_ms
        });
      }

      return {
        query,
        evidence,
        source_names: [...new Set(evidence.map((chunk) => chunk.citation.source_name))],
        observability
      };
    } catch (error) {
      observability.retrieval_latency_ms = Date.now() - startTime;
      observability.rag_failure = true;
      this.logger.warn("RAG retrieval failed; continuing without RAG", {
        retriever: this.retriever.name,
        error: String(error),
        latency_ms: observability.retrieval_latency_ms
      });

      return {
        query,
        evidence: [],
        source_names: [],
        observability
      };
    }
  }
}
