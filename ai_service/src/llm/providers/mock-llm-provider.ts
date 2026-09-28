import type { LlmGenerateRequest, LlmGenerateResponse, LlmProvider } from "../interface.ts";

export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";
  private readonly response: string;

  constructor(response = "{}") {
    this.response = response;
  }

  async generate(_request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    return {
      content: this.response,
      model: "mock-model",
      provider: this.name,
      usage: {
        input_tokens: 0,
        output_tokens: 0
      }
    };
  }
}
