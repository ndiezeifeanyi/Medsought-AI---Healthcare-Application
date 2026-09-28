import { AiServiceError } from "../../errors/ai-error.ts";
import type { EvidenceChunk, RetrievalQuery, Retriever } from "../retrieval/retriever.ts";

export class UnconfiguredRetriever implements Retriever {
  readonly name = "unconfigured";

  async retrieve(_query: RetrievalQuery): Promise<EvidenceChunk[]> {
    throw new AiServiceError(
      "RETRIEVAL_PROVIDER_UNCONFIGURED",
      "RAG is required, but no approved retrieval provider or index is configured.",
      false
    );
  }
}
