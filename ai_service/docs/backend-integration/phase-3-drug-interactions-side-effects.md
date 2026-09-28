# Phase 3 Backend Integration Handoff: Drug Interaction & Side Effects

## 1. Purpose

Phase 3 adds the primary MVP medical AI capability for drug interactions, side effects, and supported contraindication lookup. The AI layer identifies medicine names, resolves them through the approved drug-information provider, retrieves approved interaction or topic-specific information, generates an educational WhatsApp-friendly response, applies the required disclaimer, and fails closed when evidence is unavailable.

This phase still does not include a production medical source. Tests use a synthetic fixture provider only.

## 2. Endpoint / Interface

Backend continues using the same provisional request/response contract:

```ts
const processor = new ConversationProcessor({
  config: loadConfig(),
  drugInformationProvider
});

const response = await processor.process(request);
```

The same configured `drugInformationProvider` is used for:

- medicine resolution
- side-effect lookup
- contraindication lookup where supported
- drug-interaction lookup

## 3. Request Schema

```json
{
  "conversation_id": "string",
  "user_id": "string",
  "message": "string",
  "message_type": "text | voice",
  "language": "en | ha | yo | ig",
  "context": {
    "recent_messages": [],
    "current_medicine": "string | null",
    "current_intent": "drug_information | drug_interaction | side_effects | unknown | null",
    "metadata": {}
  }
}
```

For follow-up questions, backend should include `context.current_medicine` when known.

## 4. Response Schema

```json
{
  "response": "string",
  "intent": "drug_information | drug_interaction | side_effects | unknown",
  "language": "en | ha | yo | ig",
  "actions": [],
  "safety_status": "passed | needs_fallback | blocked",
  "metadata": {
    "knowledge_source": "string | null",
    "confidence": "number | null",
    "errors": [
      {
        "code": "string",
        "message": "string",
        "retryable": false,
        "details": {}
      }
    ]
  }
}
```

## 5. Example Request

```json
{
  "conversation_id": "conv-300",
  "user_id": "user-101",
  "message": "Can I take AlphaMed with BetaMed?",
  "message_type": "text",
  "language": "en",
  "context": {}
}
```

`AlphaMed` and `BetaMed` are synthetic test fixture names, not real medicines.

## 6. Example Response

```json
{
  "response": "Here is educational interaction information for AlphaMed and BetaMed from the approved drug-information source.\nInteraction information: Synthetic approved interaction summary for AlphaMed and BetaMed.\nSource: Synthetic Phase 2 Test Fixture\n\nDisclaimer; Educational only. Not medical advice.",
  "intent": "drug_interaction",
  "language": "en",
  "actions": [],
  "safety_status": "passed",
  "metadata": {
    "knowledge_source": "Synthetic Phase 2 Test Fixture",
    "confidence": 0.95,
    "errors": []
  }
}
```

## 7. Error Responses

Expected controlled failures:

- `AMBIGUOUS_MEDICINE`: interaction request has fewer than two resolvable medicines.
- `UNKNOWN_MEDICINE`: one or more medicines cannot be resolved by the approved source.
- `MISSING_MEDICAL_INFORMATION`: medicine is resolved, but interaction/side-effect/contraindication evidence is missing.
- `DRUG_PROVIDER_UNCONFIGURED`: no approved drug-information provider is configured.
- `DRUG_API_FAILURE`: provider unexpectedly fails.
- `SAFETY_VALIDATION_FAILED`: generated response violates safety policy.

Handled failures return `safety_status: "blocked"` and the approved fallback:

```text
I do not have enough approved medical information to answer that safely.

Disclaimer; Educational only. Not medical advice.
```

## 8. Required Environment Variables

Variable names only:

- `MEDSOUGHT_DRUG_INFO_PROVIDER`
- `MEDSOUGHT_DRUG_INFO_API_KEY`
- `MEDSOUGHT_DRUG_INFO_BASE_URL`
- `MEDSOUGHT_RAG_ENABLED`
- `MEDSOUGHT_RETRIEVAL_PROVIDER`
- `MEDSOUGHT_RETRIEVAL_INDEX_NAME`
- `MEDSOUGHT_PROMPT_DIR`
- `MEDSOUGHT_AI_CONFIG_PATH`
- `MEDSOUGHT_LOG_LEVEL`

## 9. Dependencies

External API dependency remains open.

OPEN DECISION: trusted production drug-information source.

OPEN DECISION: whether interaction lookup is supplied directly by the drug source, by a separate interaction API, or by RAG over approved medical content.

OPEN DECISION: source coverage for contraindications, pregnancy warnings, storage, and dosage fields.

## 10. Backend Responsibilities

Backend owns WhatsApp delivery, endpoint routing, authentication, conversation persistence, user profile context, analytics dispatch, and any decision to escalate, suppress, or route medical questions outside the AI layer.

Backend must not treat `actions: []` as a completed medication action. Phase 3 medical answers are educational responses only.

## 11. AI Responsibilities

AI layer owns:

- interaction intent detection
- extracting two or more medicine names
- resolving medicine names through the approved provider
- retrieving interaction information from the approved provider
- side-effect lookup from approved provider content
- contraindication lookup where the provider supports it
- educational response generation
- required disclaimer enforcement
- controlled fallback when approved information is unavailable

## 12. Integration Test

With a configured provider, backend can test:

```json
{
  "conversation_id": "conv-test",
  "user_id": "user-test",
  "message": "Can I take AlphaMed with BetaMed?",
  "message_type": "text",
  "language": "en",
  "context": {}
}
```

Expected:

- `intent` is `drug_interaction`
- `metadata.knowledge_source` is non-null when evidence exists
- `safety_status` is `passed` only when approved interaction evidence and citations are present
- response includes `Disclaimer; Educational only. Not medical advice.`
- no interaction information is generated from LLM internal knowledge

## Open Questions

OPEN QUESTION: Which trusted source will power interaction checks?

OPEN QUESTION: What confidence threshold should backend require before showing a medical answer?

OPEN QUESTION: Should the backend route unresolved or ambiguous medicine names to a clarification flow, and what exact UX copy should be used?

OPEN QUESTION: How will pharmacist review validate multilingual interaction and side-effect outputs?
