import { AiServiceError } from "../../errors/ai-error.ts";
import type { LlmGenerateRequest, LlmGenerateResponse, LlmProvider } from "../interface.ts";

export class UnconfiguredLlmProvider implements LlmProvider {
  readonly name = "unconfigured";

  async generate(_request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    throw new AiServiceError(
      "LLM_PROVIDER_UNCONFIGURED",
      "No LLM provider is configured for the MedSought AI layer.",
      false
    );
  }
}
