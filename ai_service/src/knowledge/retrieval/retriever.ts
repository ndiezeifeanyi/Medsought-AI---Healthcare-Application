import type { LanguageCode } from "../../schemas/contracts.ts";
import type { KnowledgeCitation } from "../drug-information-provider.ts";

export interface RetrievalQuery {
  query: string;
  language: LanguageCode;
  filters?: Record<string, string | number | boolean>;
  limit?: number;
}

export interface EvidenceChunk {
  id: string;
  text: string;
  score: number;
  citation: KnowledgeCitation;
  metadata?: Record<string, unknown>;
}

export interface Retriever {
  readonly name: string;
  retrieve(query: RetrievalQuery): Promise<EvidenceChunk[]>;
}
