import type { AiRuntimeConfig } from "../configuration/config.ts";
import type { DrugInformationResult, DrugInformationTopic } from "../knowledge/drug-information-provider.ts";
import { appendDisclaimer } from "../safety/disclaimer.ts";

const TOPIC_LABELS: Record<DrugInformationTopic, string> = {
  overview: "Overview",
  uses: "Uses",
  side_effects: "Side effects",
  contraindications: "Contraindications",
  interactions: "Interactions",
  pregnancy_warnings: "Pregnancy warnings",
  storage: "Storage",
  dosage: "Dosage information"
};

export interface DrugInformationResponseGenerationRequest {
  result: DrugInformationResult;
  requested_topics: DrugInformationTopic[];
  user_message?: string;
}

export class DrugInformationResponseGenerator {
  private readonly config: AiRuntimeConfig;

  constructor(config: AiRuntimeConfig) {
    this.config = config;
  }

  generate(request: DrugInformationResponseGenerationRequest): string {
    const lines: string[] = [];

    for (const topic of request.requested_topics) {
      const content = request.result.topics[topic];
      if (content) {
        lines.push(`${TOPIC_LABELS[topic]}: ${content}`);
      }
    }

    const body = lines.join("\n\n");
    return appendDisclaimer(body, this.config.safety.disclaimer_text);
  }
}