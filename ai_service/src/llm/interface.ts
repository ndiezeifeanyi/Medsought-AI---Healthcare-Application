export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmGenerateRequest {
  messages: LlmMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: "text" | "json";
  metadata?: Record<string, unknown>;
}

export interface LlmGenerateResponse {
  content: string;
  model: string;
  provider: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export interface LlmProvider {
  readonly name: string;
  generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse>;
  generateStream?(request: LlmGenerateRequest, signal?: AbortSignal): AsyncGenerator<string, void, unknown>;
}
