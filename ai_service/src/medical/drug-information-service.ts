import type { AiRuntimeConfig } from "../configuration/config.ts";
import { AiServiceError } from "../errors/ai-error.ts";
import type { DrugInformationProvider, DrugInformationTopic, DrugInformationResult } from "../knowledge/drug-information-provider.ts";
import { SafetyValidator } from "../safety/validator.ts";
import type { AiServiceRequest, Intent } from "../schemas/contracts.ts";
import { MedicineIdentifier } from "./medicine-identifier.ts";
import { DrugInformationResponseGenerator } from "./response-generation.ts";
import { topicsForIntent } from "./topic-selection.ts";

export interface DrugInformationServiceRequest {
  ai_request: AiServiceRequest;
  intent: Extract<Intent, "drug_information" | "side_effects">;
  medicine_candidates: string[];
}

export interface DrugInformationServiceResponse {
  response: string;
  knowledge_source: string;
  safety_status: "passed" | "needs_fallback" | "blocked";
  confidence: number;
  resolved_medicine: string;
  intent: string;
  urgency: "low" | "medium" | "high";
  pharmacistConsultationRequired: boolean;
}

export class DrugInformationService {
  private readonly provider: DrugInformationProvider;
  private readonly identifier: MedicineIdentifier;
  private readonly generator: DrugInformationResponseGenerator;
  private readonly safety: SafetyValidator;

  constructor(config: AiRuntimeConfig, provider: DrugInformationProvider) {
    this.provider = provider;
    this.identifier = new MedicineIdentifier(provider);
    this.generator = new DrugInformationResponseGenerator(config);
    this.safety = new SafetyValidator(config);
  }

  async answer(request: DrugInformationServiceRequest): Promise<DrugInformationServiceResponse> {
    const medicine = await this.identifier.identify({
      message: request.ai_request.message,
      language: request.ai_request.language,
      candidates: request.medicine_candidates,
      current_medicine: request.ai_request.context?.current_medicine
    });

    const requestedTopics = topicsForIntent(request.intent, request.ai_request.message);

    const lookup = await this.provider.getDrugInformation({
      medicine_name: medicine.resolved_name,
      language: request.ai_request.language,
      topics: requestedTopics
    });

    if (!lookup.found) {
      throw new AiServiceError("UNKNOWN_MEDICINE", "The approved drug-information source did not find this medicine.", false, {
        medicine: medicine.resolved_name
      });
    }

    const availableTopics = requestedTopics.filter((topic) => Boolean(lookup.topics[topic]));
    if (availableTopics.length === 0) {
      throw new AiServiceError(
        "MISSING_MEDICAL_INFORMATION",
        `The approved drug-information source did not provide enough information for ${medicine.resolved_name}.`,
        false,
        {
          medicine: medicine.resolved_name,
          requested_topics: requestedTopics
        }
      );
    }

    const response = this.generator.generate({ 
      result: lookup, 
      requested_topics: availableTopics,
      user_message: request.ai_request.message
    });

    const safety = this.safety.validate({
      response,
      is_medical_content: true,
      has_grounding_evidence: true
    });

    return {
      response: safety.response,
      knowledge_source: lookup.citations[0]?.source_name ?? this.provider.name,
      safety_status: safety.status,
      confidence: Math.min(medicine.confidence, 0.95),
      resolved_medicine: medicine.resolved_name,
      intent: request.intent,
      urgency: "low",
      pharmacistConsultationRequired: false
    };
  }
}