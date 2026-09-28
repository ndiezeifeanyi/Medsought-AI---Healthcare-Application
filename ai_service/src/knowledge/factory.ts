/**
 * Drug-information provider factory.
 *
 * HybridDrugInformationProvider handles:
 *   - RxNorm name resolution (approximateTerm, rxcui.json, properties) — still live
 *   - Synthetic fallback for name resolution when RxNorm doesn't match
 *   - Drug monograph information (getDrugInformation)
 *
 * Drug-drug INTERACTION checking is intentionally NOT here.
 * It is handled by the DrugInteractionProvider hierarchy:
 *   @see ai_service/src/knowledge/interaction/interaction-factory.ts
 *   @see MEDSOUGHT_INTERACTION_PROVIDER env var
 *
 * The two concerns are separated so their data-source licenses and
 * provider choices can be managed independently.
 */

import type { AiRuntimeConfig } from "../configuration/config.ts";
import type {
  DrugInformationProvider,
  DrugLookupRequest,
  DrugInformationResult,
  MedicineResolutionRequest,
  MedicineResolutionResult,
  DrugInteractionLookupRequest,
  DrugInteractionResult
} from "./drug-information-provider.ts";
import { RxNormDrugProvider } from "./providers/rxnorm-drug-provider.ts";
import { SyntheticDrugInformationProvider } from "../../tests/fixtures/synthetic-drug-information-provider.ts";
import { UnconfiguredDrugInformationProvider } from "./unconfigured-drug-information-provider.ts";
import { resolveInteractionProvider } from "./interaction/interaction-factory.ts";

export class HybridDrugInformationProvider implements DrugInformationProvider {
  readonly name = "rxnorm-hybrid";
  private readonly rxnorm = new RxNormDrugProvider();
  private readonly synthetic = new SyntheticDrugInformationProvider();

  async resolveMedicine(request: MedicineResolutionRequest): Promise<MedicineResolutionResult> {
    try {
      const rxResult = await this.rxnorm.resolveMedicine(request);
      if (rxResult.found) return rxResult;
    } catch {
      // ignore live lookup errors and check fallback
    }
    return this.synthetic.resolveMedicine(request);
  }

  async getDrugInformation(request: DrugLookupRequest): Promise<DrugInformationResult> {
    try {
      const rxResult = await this.rxnorm.getDrugInformation(request);
      if (rxResult.found && rxResult.citations.length > 0) return rxResult;
    } catch {
      // ignore live lookup errors and check fallback
    }
    return this.synthetic.getDrugInformation(request);
  }

  /**
   * Drug-drug interaction checking — delegates to the configured
   * DrugInteractionProvider (DDInter by default).
   *
   * The result's query_status field MUST be inspected by callers to distinguish:
   *   "found"       — interaction data returned
   *   "not_found"   — provider reached, no interactions for these drugs
   *   "unreachable" — provider error; do NOT treat as "no interactions"
   *   "unconfigured"— provider disabled; do NOT treat as "no interactions"
   */
  async getDrugInteractions(request: DrugInteractionLookupRequest): Promise<DrugInteractionResult> {
    const interactionProvider = resolveInteractionProvider();
    const result = await interactionProvider.checkInteractions(request);

    const nowIso = new Date().toISOString();
    const citation = {
      source_id: result.medicines.join("+"),
      source_name: result.source_name,
      url: result.source_url,
      retrieved_at: result.retrieved_at ?? nowIso
    };

    return {
      medicines: result.medicines,
      found: result.query_status === "found",
      summary: result.summary,
      interactions: result.interactions,
      citations: result.query_status === "found" ? [citation] : [],
      query_status: result.query_status
    };
  }
}

export function resolveDrugInformationProvider(config: AiRuntimeConfig): DrugInformationProvider {
  const providerName = (config.providers.drug_information || process.env.MEDSOUGHT_DRUG_INFO_PROVIDER || "rxnorm").toLowerCase();

  if (providerName === "rxnorm" || providerName === "rxnav" || providerName === "hybrid" || providerName === "default") {
    return new HybridDrugInformationProvider();
  }
  if (providerName === "synthetic") {
    return new SyntheticDrugInformationProvider();
  }

  return new UnconfiguredDrugInformationProvider();
}
