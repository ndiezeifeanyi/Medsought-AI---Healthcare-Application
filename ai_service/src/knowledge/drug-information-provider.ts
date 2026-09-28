import type { LanguageCode } from "../schemas/contracts.ts";
import type { InteractionPair } from "./interaction/drug-interaction-provider.ts";

export type DrugInformationTopic =
  | "overview"
  | "uses"
  | "side_effects"
  | "contraindications"
  | "interactions"
  | "pregnancy_warnings"
  | "storage"
  | "dosage";

export interface DrugLookupRequest {
  medicine_name: string;
  language: LanguageCode;
  topics: DrugInformationTopic[];
}

export interface MedicineResolutionRequest {
  medicine_name: string;
  language: LanguageCode;
}

export interface DrugInteractionLookupRequest {
  medicines: string[];
  language: LanguageCode;
}

export interface KnowledgeCitation {
  source_id: string;
  source_name: string;
  url?: string;
  retrieved_at: string;
}

export interface DrugInformationResult {
  medicine_name: string;
  normalized_name?: string;
  found: boolean;
  topics: Partial<Record<DrugInformationTopic, string>>;
  citations: KnowledgeCitation[];
}

export interface MedicineResolutionResult {
  input: string;
  found: boolean;
  resolved_name?: string;
  confidence: number;
  candidates: Array<{
    name: string;
    confidence: number;
  }>;
  source_name: string;
}

export interface DrugInteractionResult {
  medicines: string[];
  found: boolean;
  summary?: string;
  interactions?: InteractionPair[];
  citations: KnowledgeCitation[];
  /**
   * Distinguishable query outcome — NEVER collapse these into a single boolean.
   *
   * - "found"       : Provider reached, query succeeded, ≥1 interaction returned.
   * - "not_found"   : Provider reached, query succeeded, 0 interactions for these drugs.
   * - "unreachable" : Provider could not be contacted (network, HTTP error, timeout).
   * - "unconfigured": No interaction provider selected.
   * - undefined     : Legacy value — provider did not set this (treat as unknown).
   */
  query_status?: "found" | "not_found" | "unreachable" | "unconfigured";
}

export interface DrugInformationProvider {
  readonly name: string;
  resolveMedicine(request: MedicineResolutionRequest): Promise<MedicineResolutionResult>;
  getDrugInformation(request: DrugLookupRequest): Promise<DrugInformationResult>;
  getDrugInteractions(request: DrugInteractionLookupRequest): Promise<DrugInteractionResult>;
}
