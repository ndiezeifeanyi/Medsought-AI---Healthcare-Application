import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PROMPT_KEYS = [
  "conversation_response",
  "drug_information_response",
  "drug_interaction_response",
  "safety_validation",
  "intent_classification",
  "reminder_interpretation",
  "translation"
] as const;

export type PromptKey = (typeof PROMPT_KEYS)[number];

export interface PromptTemplate {
  key: PromptKey;
  version: string;
  template: string;
}

const PROMPT_FILES: Record<PromptKey, string> = {
  conversation_response: "conversation-response.v1.md",
  drug_information_response: "drug-information-response.v1.md",
  drug_interaction_response: "drug-interaction-response.v1.md",
  safety_validation: "safety-validation.v1.md",
  intent_classification: "intent-classification.v1.md",
  reminder_interpretation: "reminder-interpretation.v1.md",
  translation: "translation.v1.md"
};

export class PromptRegistry {
  private readonly promptDir: string;

  constructor(promptDir: string) {
    this.promptDir = promptDir;
  }

  load(key: PromptKey): PromptTemplate {
    const fileName = PROMPT_FILES[key];
    const template = readFileSync(join(this.promptDir, fileName), "utf8");
    return {
      key,
      version: "v1",
      template
    };
  }
}
