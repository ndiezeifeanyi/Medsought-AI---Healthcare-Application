import type { AiRuntimeConfig } from "../configuration/config.ts";
import { AiServiceError } from "../errors/ai-error.ts";
import type { DrugInformationProvider } from "../knowledge/drug-information-provider.ts";
import { SafetyValidator } from "../safety/validator.ts";
import type { AiServiceRequest } from "../schemas/contracts.ts";
import { DrugInteractionResponseGenerator } from "./interaction-response-generation.ts";
import { MedicineExtractor } from "./medicine-extraction.ts";

export interface DrugInteractionServiceRequest {
  ai_request: AiServiceRequest;
  medicine_candidates: string[];
}

export interface DrugInteractionServiceResponse {
  response: string;
  knowledge_source: string;
  safety_status: "passed" | "needs_fallback" | "blocked";
  confidence: number;
  resolved_medicines: string[];  
}

export class DrugInteractionService {
  private readonly provider: DrugInformationProvider;
  private readonly extractor: MedicineExtractor;
  private readonly generator: DrugInteractionResponseGenerator;
  private readonly safety: SafetyValidator;

  constructor(config: AiRuntimeConfig, provider: DrugInformationProvider) {
    this.provider = provider;
    this.extractor = new MedicineExtractor(provider);
    this.generator = new DrugInteractionResponseGenerator(config);
    this.safety = new SafetyValidator(config);
  }

  async answer(request: DrugInteractionServiceRequest): Promise<DrugInteractionServiceResponse> {
    const medicines = await this.extractor.extractMany(
      {
        message: request.ai_request.message,
        language: request.ai_request.language,
        candidates: request.medicine_candidates
      },
      2
    );

    const lookup = await this.provider.getDrugInteractions({
      medicines: medicines.medicines,
      language: request.ai_request.language
    });

    if (!lookup.found || !lookup.summary) {
      throw new AiServiceError(
        "MISSING_MEDICAL_INFORMATION",
        `The approved drug-information source did not find interaction data for ${medicines.medicines.join(" and ")}.`,
        false,
        { medicines: medicines.medicines }
      );
    }

    const rawResponse = this.generator.generate({ result: lookup, user_message: request.ai_request.message });
    const safety = this.safety.validate({
      response: rawResponse,
      is_medical_content: true,
      has_grounding_evidence: true
    });

    return {
      response: safety.response,
      knowledge_source: lookup.citations[0]?.source_name ?? this.provider.name,
      safety_status: safety.status,
      confidence: Math.min(medicines.confidence, 0.95),
      resolved_medicines: medicines.medicines
    };
  }
}
