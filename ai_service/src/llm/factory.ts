import type { AiRuntimeConfig } from "../configuration/config.ts";
import type { LlmGenerateRequest, LlmGenerateResponse, LlmProvider } from "./interface.ts";
import { GeminiLlmProvider } from "./providers/gemini-llm-provider.ts";
import { OpenAiLlmProvider } from "./providers/openai-llm-provider.ts";

export class HybridLlmProvider implements LlmProvider {
  readonly name = "hybrid-llm";
  private readonly gemini = new GeminiLlmProvider();
  private readonly openai = new OpenAiLlmProvider();

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    // 1. Primary: Gemini API
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.MEDSOUGHT_LLM_API_KEY) {
      return this.gemini.generate(request);
    }

    // 2. Secondary: OpenAI API (only if OPENAI_API_KEY is explicitly defined)
    if (process.env.OPENAI_API_KEY) {
      return this.openai.generate(request);
    }

    // 3. Unconfigured fallback
    return {
      content: "I am MedSought AI. An LLM API key (GEMINI_API_KEY) has not been configured in the environment. Please set GEMINI_API_KEY in your .env file to enable live AI responses.",
      model: "unconfigured",
      provider: this.name,
      usage: { input_tokens: 0, output_tokens: 0 }
    };
  }
}

export function resolveLlmProvider(config: AiRuntimeConfig): LlmProvider {
  return new HybridLlmProvider();
}
