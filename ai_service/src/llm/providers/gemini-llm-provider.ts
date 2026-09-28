import { AiServiceError } from "../../errors/ai-error.ts";
import type { LlmGenerateRequest, LlmGenerateResponse, LlmProvider } from "../interface.ts";

export class GeminiLlmProvider implements LlmProvider {
  readonly name = "gemini";
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.apiKey = options?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.MEDSOUGHT_LLM_API_KEY || "";
    this.model = options?.model || process.env.GEMINI_MODEL || "gemini-3.6-flash";
  }

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    if (!this.apiKey) {
      throw new AiServiceError(
        "LLM_PROVIDER_UNCONFIGURED",
        "Gemini API key is not configured. Set GEMINI_API_KEY in ai_service/.env",
        false
      );
    }

    const systemMessage = request.messages.find((m) => m.role === "system")?.content;
    const userMessages = request.messages.filter((m) => m.role !== "system");

    const contents = userMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const payload: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        maxOutputTokens: request.max_tokens ?? 500
      }
    };

    if (systemMessage) {
      payload.systemInstruction = {
        parts: [{ text: systemMessage }]
      };
    }

    const modelsToTry = Array.from(new Set([
      "gemini-3.5-flash-lite",
      this.model,
      "gemini-3.6-flash",
      "gemini-flash-lite-latest",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest"
    ]));

    let lastError: string = "";

    for (const targetModel of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${this.apiKey}`;
      
      // Retry up to 2 times per candidate model on transient 429/503 errors
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
          }

          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(12000)
          });

          if (!res.ok) {
            const errorText = await res.text();
            lastError = `HTTP ${res.status}: ${errorText}`;
            if (res.status === 429 || res.status === 503) {
              continue;
            }
            if (res.status === 404) {
              break;
            }
            throw new AiServiceError(
              "LLM_PROVIDER_ERROR",
              `Gemini API HTTP ${res.status}: ${errorText}`,
              res.status >= 500
            );
          }

          const data = (await res.json()) as any;
          const candidate = data.candidates?.[0];
          const textPart = (candidate?.content?.parts || []).map((p: any) => p.text || "").join("").trim();

          return {
            content: textPart,
            model: targetModel,
            provider: this.name,
            usage: {
              input_tokens: data.usageMetadata?.promptTokenCount,
              output_tokens: data.usageMetadata?.candidatesTokenCount
            }
          };
        } catch (e: any) {
          if (e instanceof AiServiceError && e.code !== "LLM_PROVIDER_ERROR") throw e;
          lastError = String(e?.message || e);
        }
      }
    }

    throw new AiServiceError(
      "LLM_PROVIDER_ERROR",
      `Gemini API rate limit or high-demand limit reached across models. Details: ${lastError}`,
      true
    );
  }

  async *generateStream(request: LlmGenerateRequest, signal?: AbortSignal): AsyncGenerator<string, void, unknown> {
    if (!this.apiKey) {
      throw new AiServiceError(
        "LLM_PROVIDER_UNCONFIGURED",
        "Gemini API key is not configured. Set GEMINI_API_KEY in ai_service/.env",
        false
      );
    }

    const systemMessage = request.messages.find((m) => m.role === "system")?.content;
    const userMessages = request.messages.filter((m) => m.role !== "system");

    const contents = userMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const payload: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        maxOutputTokens: request.max_tokens ?? 800
      }
    };

    if (systemMessage) {
      payload.systemInstruction = {
        parts: [{ text: systemMessage }]
      };
    }

    const modelsToTry = Array.from(new Set([
      this.model,
      "gemini-2.5-flash-lite",
      "gemini-flash-latest",
      "gemini-3.5-flash",
      "gemma-4-26b-a4b-it"
    ]));

    let lastError: string = "";

    for (const targetModel of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal
        });

        if (!res.ok) {
          const errorText = await res.text();
          lastError = `HTTP ${res.status}: ${errorText}`;
          if (res.status === 404) continue;
          throw new AiServiceError("LLM_PROVIDER_ERROR", `Gemini API HTTP ${res.status}: ${errorText}`, res.status >= 500);
        }

        if (!res.body) {
          throw new AiServiceError("LLM_PROVIDER_ERROR", "Gemini stream response body is null", false);
        }

        const reader = (res.body as any).getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          if (signal?.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;

            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const text = (parsed.candidates?.[0]?.content?.parts || [])
                .map((p: any) => p.text || "")
                .join("");
              if (text) {
                yield text;
              }
            } catch {
              // Ignore partial JSON frames
            }
          }
        }

        if (buffer.trim().startsWith("data:")) {
          const jsonStr = buffer.trim().slice(5).trim();
          try {
            const parsed = JSON.parse(jsonStr);
            const textPart = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (typeof textPart === "string" && textPart.length > 0) {
              yield textPart;
            }
          } catch {
            // ignore
          }
        }

        return;
      } catch (e: any) {
        if (signal?.aborted || e?.name === "AbortError") {
          return;
        }
        if (e instanceof AiServiceError && e.code !== "LLM_PROVIDER_ERROR") throw e;
        lastError = String(e?.message || e);
      }
    }

    throw new AiServiceError("LLM_PROVIDER_ERROR", `Gemini API streaming failed. Details: ${lastError}`, true);
  }
}
