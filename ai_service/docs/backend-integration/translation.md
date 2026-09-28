# Translation Handoff

1. Purpose
- Translate messages between English and supported languages (Hausa, Yoruba, Igbo) while preserving protected medical entities.

2. Interface
- AI accepts `TranslationRequest` and returns `TranslationResult` as defined in `ai_service/src/translation/translator.ts`.

3. Example
- Input: { text: "Take Paracetamol 500 mg", target_language: "yo", protected_terms: ["Paracetamol", "500 mg"] }

4. Env vars
- `MEDSOUGHT_TRANSLATION_PROVIDER`, provider keys.

5. Backend responsibilities
- Route translation requests if performed outside AI layer; provide language hints when available.

6. AI responsibilities
- Preserve medical entities and avoid claiming translation accuracy without validation.
