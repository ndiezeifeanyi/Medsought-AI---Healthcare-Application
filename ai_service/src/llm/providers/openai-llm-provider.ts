import { AiServiceError } from "../../errors/ai-error.ts";
import type { LlmGenerateRequest, LlmGenerateResponse, LlmProvider } from "../interface.ts";

export class OpenAiLlmProvider implements LlmProvider {
  readonly name = "openai";
  private readonly key: string;
  private readonly model: string;
  private readonly apiBase: string;

  constructor(options?: { apiKey?: string; model?: string; apiBase?: string }) {
    this.key = options?.apiKey || process.env.MEDSOUGHT_LLM_API_KEY || process.env.OPENAI_API_KEY || "";
    this.model = options?.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const rawBase = options?.apiBase || process.env.OPENAI_API_BASE || "https://api.openai.com/v1";
    this.apiBase = rawBase.endsWith("/") ? rawBase.slice(0, -1) : rawBase;
  }

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    if (!this.key) {
      throw new AiServiceError(
        "LLM_PROVIDER_UNCONFIGURED",
        "OpenAI LLM provider API key is not configured.",
        false
      );
    }

    const payload = {
      model: this.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 600,
      ...(request.response_format === "json" ? { response_format: { type: "json_object" } } : {})
    };

    try {
      const response = await fetch(`${this.apiBase}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.key}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new AiServiceError(
          "LLM_PROVIDER_ERROR",
          `OpenAI API HTTP ${response.status}: ${errorText}`,
          response.status >= 500
        );
      }

      const data = (await response.json()) as any;
      const content = data.choices?.[0]?.message?.content || "";

      return {
        content,
        model: data.model || this.model,
        provider: this.name,
        usage: {
          input_tokens: data.usage?.prompt_tokens,
          output_tokens: data.usage?.completion_tokens
        }
      };
    } catch (e: any) {
      if (e instanceof AiServiceError) throw e;
      throw new AiServiceError(
        "LLM_PROVIDER_ERROR",
        `OpenAI request failure: ${String(e?.message || e)}`,
        true
      );
    }
  }
}
