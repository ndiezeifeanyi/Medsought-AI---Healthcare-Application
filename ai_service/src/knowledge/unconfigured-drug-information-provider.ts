import { AiServiceError } from "../errors/ai-error.ts";
import type {
  DrugInformationProvider,
  DrugInformationResult,
  DrugInteractionLookupRequest,
  DrugInteractionResult,
  DrugLookupRequest,
  MedicineResolutionRequest,
  MedicineResolutionResult
} from "./drug-information-provider.ts";

export class UnconfiguredDrugInformationProvider implements DrugInformationProvider {
  readonly name = "unconfigured";

  async resolveMedicine(_request: MedicineResolutionRequest): Promise<MedicineResolutionResult> {
    throw new AiServiceError(
      "DRUG_PROVIDER_UNCONFIGURED",
      "No approved drug-information source is configured.",
      false
    );
  }

  async getDrugInformation(_request: DrugLookupRequest): Promise<DrugInformationResult> {
    throw new AiServiceError(
      "DRUG_PROVIDER_UNCONFIGURED",
      "No approved drug-information source is configured.",
      false
    );
  }

  async getDrugInteractions(_request: DrugInteractionLookupRequest): Promise<DrugInteractionResult> {
    throw new AiServiceError(
      "DRUG_PROVIDER_UNCONFIGURED",
      "No approved drug-interaction source is configured.",
      false
    );
  }
}
