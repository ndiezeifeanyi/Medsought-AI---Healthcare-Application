import type { Translator, TranslationRequest, TranslationResult } from "../translator.ts";

export class MockTranslator implements Translator {
  readonly name = "mock-translator";

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    // Naive preservation: replace protected terms with placeholders and re-insert them after "translation"
    const preserved = request.protected_terms ?? [];
    let text = request.text;

    const placeholders = preserved.map((term, idx) => ({ term, ph: `<<P_${idx}>>` }));
    for (const p of placeholders) {
      text = text.split(p.term).join(p.ph);
    }

    // Simulate translation by appending target language
    const translated = `${text} [translated->${request.target_language}]`;

    let restored = translated;
    for (const p of placeholders) {
      restored = restored.split(p.ph).join(p.term);
    }

    return {
      text: restored,
      source_language: request.source_language,
      target_language: request.target_language,
      preserved_terms: preserved,
      provider: this.name
    };
  }
}
