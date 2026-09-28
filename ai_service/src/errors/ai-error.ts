export type AiErrorCode =
  | "MALFORMED_INPUT"
  | "UNSUPPORTED_LANGUAGE"
  | "LLM_PROVIDER_UNCONFIGURED"
  | "LLM_API_FAILURE"
  | "DRUG_PROVIDER_UNCONFIGURED"
  | "DRUG_API_FAILURE"
  | "RETRIEVAL_PROVIDER_UNCONFIGURED"
  | "TRANSLATION_FAILURE"
  | "MISSING_MEDICAL_INFORMATION"
  | "AMBIGUOUS_MEDICINE"
  | "UNKNOWN_MEDICINE"
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "SAFETY_VALIDATION_FAILED";

export class AiServiceError extends Error {
  readonly code: AiErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(code: AiErrorCode, message: string, retryable = false, details?: Record<string, unknown>) {
    super(message);
    this.name = "AiServiceError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }

  toEnvelope() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.details ? { details: this.details } : {})
    };
  }
}
