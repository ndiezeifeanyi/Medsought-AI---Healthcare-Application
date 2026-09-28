import { AiServiceError } from "../errors/ai-error.ts";
import type { DrugInformationProvider, MedicineResolutionResult } from "../knowledge/drug-information-provider.ts";
import type { LanguageCode } from "../schemas/contracts.ts";

export interface MedicineIdentificationRequest {
  message: string;
  language: LanguageCode;
  candidates?: string[];
  current_medicine?: string | null;
}

export interface MedicineIdentificationResult {
  input: string;
  resolved_name: string;
  confidence: number;
  source_name: string;
  candidates: MedicineResolutionResult["candidates"];
}

const FOLLOW_UP_PATTERNS = /\b(it|its|that medicine|the medicine)\b/i;

export class MedicineIdentifier {
  private readonly provider: DrugInformationProvider;

  constructor(provider: DrugInformationProvider) {
    this.provider = provider;
  }

  static normalizeResolvedName(name: string): string {
    if (!name) return name;
    let s = name.replace(/\([^)]*\)/g, "");
    s = s.replace(/\s+/g, " ").trim();
    return s;
  }

  async identify(request: MedicineIdentificationRequest): Promise<MedicineIdentificationResult> {
    const candidate = this.chooseCandidate(request);
    if (!candidate) {
      throw new AiServiceError("AMBIGUOUS_MEDICINE", "No medicine name could be identified in the request.", false);
    }

    const resolution = await this.provider.resolveMedicine({
      medicine_name: candidate,
      language: request.language
    });

    if (!resolution.found || !resolution.resolved_name) {
      throw new AiServiceError("UNKNOWN_MEDICINE", "The medicine was not found in the approved drug-information source.", false, {
        input: candidate,
        candidates: resolution.candidates
      });
    }

    const normalized = MedicineIdentifier.normalizeResolvedName(resolution.resolved_name);

    return {
      input: resolution.input,
      resolved_name: normalized,
      confidence: resolution.confidence,
      source_name: resolution.source_name,
      candidates: resolution.candidates
    };
  }

  private chooseCandidate(request: MedicineIdentificationRequest): string | null {
    // If this message appears to be a follow-up referring to the current medicine,
    // prefer the conversational `current_medicine` over any noisy detected tokens.
    if (request.current_medicine && FOLLOW_UP_PATTERNS.test(request.message)) {
      return request.current_medicine;
    }

    if (request.candidates && request.candidates.length > 0) {
      // Prefer tokens that look like proper nouns (start with uppercase), which
      // are more likely to be medicine names when multiple tokens are detected.
      const proper = request.candidates.find((c) => /^[A-Z]/.test(c));
      if (proper) return proper;
      return request.candidates[0];
    }

    const explicitPatterns = [
      /\b(?:about|of|for|is|does|do|can i take)\s+([A-Z][a-zA-Z0-9-]{2,})\b/,
      /\b([A-Z][a-zA-Z0-9-]{2,})\b/
    ];

    for (const pattern of explicitPatterns) {
      const match = request.message.match(pattern);
      if (match?.[1]) return match[1];
    }

    return null;
  }
}
