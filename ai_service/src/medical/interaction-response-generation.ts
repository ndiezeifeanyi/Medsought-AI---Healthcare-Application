import type { AiRuntimeConfig } from "../configuration/config.ts";
import type { DrugInteractionResult } from "../knowledge/drug-information-provider.ts";
import { appendDisclaimer } from "../safety/disclaimer.ts";

export interface DrugInteractionResponseGenerationRequest {
  result: DrugInteractionResult;
  user_message?: string;
}

export class DrugInteractionResponseGenerator {
  private readonly config: AiRuntimeConfig;

  constructor(config: AiRuntimeConfig) {
    this.config = config;
  }

  generate(request: DrugInteractionResponseGenerationRequest): string {
    const summary = request.result.summary || "No clinical interactions found in the database.";
    return appendDisclaimer(summary, this.config.safety.disclaimer_text);
  }
}
