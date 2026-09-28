import type { LanguageCode } from "../schemas/contracts.ts";

export interface TranslationRequest {
  text: string;
  source_language?: LanguageCode;
  target_language: LanguageCode;
  protected_terms?: string[];
}

export interface TranslationResult {
  text: string;
  source_language?: LanguageCode;
  target_language: LanguageCode;
  preserved_terms: string[];
  provider: string;
}

export interface Translator {
  readonly name: string;
  translate(request: TranslationRequest): Promise<TranslationResult>;
}
