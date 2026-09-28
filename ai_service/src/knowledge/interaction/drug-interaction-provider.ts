/**
 * Drug-Interaction Provider abstraction.
 *
 * This is a separate concern from DrugInformationProvider — the latter handles
 * drug monograph look-ups (name resolution, overview, side effects, etc.) while
 * this interface is exclusively responsible for checking drug-drug interactions.
 *
 * The separation exists so the interaction-data source (and its licensing
 * implications) can be swapped independently of the drug-information source.
 *
 * @see MEDSOUGHT_INTERACTION_PROVIDER env var to select the active provider.
 */

import type { LanguageCode } from "../../schemas/contracts.ts";

export interface DrugInteractionLookupRequest {
  medicines: string[];
  language: LanguageCode;
}

export interface InteractionPair {
  drug_a: string;
  drug_b: string;
  /** Severity level from the source database. */
  severity: "Major" | "Moderate" | "Minor" | "Unknown";
  /** Optional ATC classification codes from the source database. */
  atc_codes?: string[];
  /** Structured citation attached specifically to the verified severity fact. */
  citation?: {
    source_id: string;
    source_name: string;
    url?: string;
    retrieved_at: string;
  };
  /** Human-readable mechanism description (only if provided by source database). */
  mechanism?: string;
  /** Clinical management recommendation (only if provided by source database). */
  management?: string;
}

/**
 * Distinguishable query outcome — NEVER collapse these into a single boolean.
 *
 * - "found"       : Provider was reached, query succeeded, ≥1 interaction returned.
 * - "not_found"   : Provider was reached, query succeeded, 0 interactions between
 *                   these specific drugs. (Absence of evidence, not evidence of absence.)
 * - "unreachable" : Provider could not be contacted (network error, HTTP error, timeout).
 * - "unconfigured": No interaction provider is selected/configured.
 */
export type InteractionQueryStatus =
  | "found"
  | "not_found"
  | "unreachable"
  | "unconfigured";

export interface DrugInteractionCheckResult {
  medicines: string[];
  /** Distinguishable query outcome — see InteractionQueryStatus. */
  query_status: InteractionQueryStatus;
  /** Only populated when query_status === "found". */
  interactions?: InteractionPair[];
  /** Human-readable combined summary — only when query_status === "found". */
  summary?: string;
  /** Provider name for citation. */
  source_name: string;
  /** Source URL for citation, if available. */
  source_url?: string;
  retrieved_at: string;
  /** Error detail — only when query_status === "unreachable". */
  error_detail?: string;
}

export interface DrugInteractionProvider {
  readonly name: string;
  checkInteractions(
    request: DrugInteractionLookupRequest
  ): Promise<DrugInteractionCheckResult>;
  /** Health check — resolves true if the provider is reachable, false otherwise. */
  healthCheck(): Promise<boolean>;
}
