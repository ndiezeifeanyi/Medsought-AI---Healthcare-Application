import { AiServiceError } from "../errors/ai-error.ts";
import type { DrugInformationProvider, MedicineResolutionResult } from "../knowledge/drug-information-provider.ts";
import type { LanguageCode } from "../schemas/contracts.ts";

export interface MedicineExtractionRequest {
  message: string;
  language: LanguageCode;
  candidates?: string[];
}

export interface MedicineExtractionResult {
  medicines: string[];
  confidence: number;
  resolutions: MedicineResolutionResult[];
}

export class MedicineExtractor {
  private readonly provider: DrugInformationProvider;

  constructor(provider: DrugInformationProvider) {
    this.provider = provider;
  }

  async extractMany(request: MedicineExtractionRequest, minimumCount: number): Promise<MedicineExtractionResult> {
    // If candidates were provided (from the classifier), prefer those that look like
    // proper medicine tokens (start with uppercase). Otherwise, fall back to
    // extracting explicit tokens from the message.
    let rawCandidates: string[] = [];
    if (request.candidates && request.candidates.length > 0) {
      rawCandidates = request.candidates.filter((c) => /^[A-Z][a-zA-Z0-9-]{2,}$/.test(c));
      if (rawCandidates.length === 0) {
        // If none look like proper nouns, fall back to the original candidates list
        rawCandidates = [...request.candidates];
      }
    } else {
      rawCandidates = this.findCandidates(request);
    }
    if (rawCandidates.length < minimumCount) {
      throw new AiServiceError("AMBIGUOUS_MEDICINE", "The request does not include enough medicine names.", false, {
        minimum_required: minimumCount,
        detected: rawCandidates
      });
    }

    const resolutions: MedicineResolutionResult[] = [];
    for (const candidate of rawCandidates) {
      const resolution = await this.provider.resolveMedicine({
        medicine_name: candidate,
        language: request.language
      });
      if (!resolution.found || !resolution.resolved_name) {
        throw new AiServiceError("UNKNOWN_MEDICINE", "One or more medicines were not found in the approved drug-information source.", false, {
          input: candidate,
          candidates: resolution.candidates
        });
      }
      resolutions.push(resolution);
    }

    return {
      medicines: [...new Set(resolutions.map((resolution) => resolution.resolved_name as string))],
      confidence: Math.min(...resolutions.map((resolution) => resolution.confidence)),
      resolutions
    };
  }

  private findCandidates(request: MedicineExtractionRequest): string[] {
    if (request.candidates && request.candidates.length > 0) {
      return [...new Set(request.candidates)];
    }

    const explicit = request.message.match(/\b[A-Z][a-zA-Z0-9-]{2,}\b/g) ?? [];
    const stopWords = new Set(["Can", "Do", "Does", "Drug", "I", "Is", "Tell", "What", "When", "Where"]);
    return [...new Set(explicit.filter((candidate) => !stopWords.has(candidate)))];
  }
}
