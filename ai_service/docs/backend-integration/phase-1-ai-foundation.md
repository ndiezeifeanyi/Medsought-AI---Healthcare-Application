# Phase 1 Backend Integration Handoff: AI Foundation

## 1. Purpose

Phase 1 establishes the provider-independent AI layer foundation for MedSought. It defines request and response schemas, configuration loading, logging, errors, prompt management, LLM interfaces, drug knowledge interfaces, required RAG interfaces, translation interfaces, reminder interpretation scaffolding, and safety validation.

This phase does not implement final medical answers, pharmacy search, WhatsApp infrastructure, notification scheduling, or provider-specific integrations.

## 2. Endpoint / Interface

The backend can call the AI layer through an application-owned endpoint or direct service call. The provisional service entry point is:

```ts
const processor = new ConversationProcessor({ config: loadConfig() });
const response = await processor.process(request);
```

The production HTTP endpoint path is a backend decision.

## 3. Request Schema

```json
{
  "conversation_id": "string",
  "user_id": "string",
  "message": "string",
  "message_type": "text",
  "language": "en | ha | yo | ig",
  "context": {
    "recent_messages": [
      {
        "role": "user | assistant",
        "content": "string",
        "language": "en | ha | yo | ig"
      }
    ],
    "current_medicine": "string | null",
    "current_intent": "drug_information | drug_interaction | side_effects | medicine_search | reminder_response | unknown | null",
    "metadata": {}
  }
}
```

This schema is approved as a starting point and intentionally kept easy to change.

## 4. Response Schema

```json
{
  "response": "string",
  "intent": "drug_information | drug_interaction | side_effects | medicine_search | reminder_response | unknown",
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
    ],
    "trace_id": "string"
  }
}
```

## 5. Example Request

```json
{
  "conversation_id": "conv-123",
  "user_id": "user-456",
  "message": "What are the side effects of Paracetamol?",
  "message_type": "text",
  "language": "en",
  "context": {
    "recent_messages": [],
    "current_medicine": null
  }
}
```

## 6. Example Response

```json
{
  "response": "I do not have enough approved medical information to answer that safely.\n\nDisclaimer; Educational only. Not medical advice.",
  "intent": "side_effects",
  "language": "en",
  "actions": [],
  "safety_status": "blocked",
  "metadata": {
    "knowledge_source": null,
    "confidence": 0.55,
    "errors": [
      {
        "code": "SAFETY_VALIDATION_FINDING",
        "message": "missing approved medical grounding evidence",
        "retryable": false
      },
      {
        "code": "SAFETY_VALIDATION_FINDING",
        "message": "missing required medical disclaimer",
        "retryable": false
      }
    ]
  }
}
```

## 7. Error Responses

Controlled errors include:

- `MALFORMED_INPUT`
- `UNSUPPORTED_LANGUAGE`
- `LLM_PROVIDER_UNCONFIGURED`
- `LLM_API_FAILURE`
- `DRUG_PROVIDER_UNCONFIGURED`
- `DRUG_API_FAILURE`
- `RETRIEVAL_PROVIDER_UNCONFIGURED`
- `TRANSLATION_FAILURE`
- `MISSING_MEDICAL_INFORMATION`
- `AMBIGUOUS_MEDICINE`
- `UNKNOWN_MEDICINE`
- `TIMEOUT`
- `RATE_LIMIT`
- `SAFETY_VALIDATION_FAILED`

## 8. Required Environment Variables

Variable names only:

- `MEDSOUGHT_LLM_PROVIDER`
- `MEDSOUGHT_LLM_MODEL`
- `MEDSOUGHT_LLM_API_KEY`
- `MEDSOUGHT_LLM_BASE_URL`
- `MEDSOUGHT_DRUG_INFO_PROVIDER`
- `MEDSOUGHT_DRUG_INFO_API_KEY`
- `MEDSOUGHT_DRUG_INFO_BASE_URL`
- `MEDSOUGHT_RAG_ENABLED`
- `MEDSOUGHT_RETRIEVAL_PROVIDER`
- `MEDSOUGHT_RETRIEVAL_INDEX_NAME`
- `MEDSOUGHT_TRANSLATION_PROVIDER`
- `MEDSOUGHT_TRANSLATION_API_KEY`
- `MEDSOUGHT_AI_CONFIG_PATH`
- `MEDSOUGHT_PROMPT_DIR`
- `MEDSOUGHT_LOG_LEVEL`

## 9. Dependencies

External dependencies are not selected in Phase 1.

- LLM provider: open decision.
- Drug information provider: open decision.
- RAG retriever/index: required by project direction, provider/index open.
- Translation provider: open decision.

## 10. Backend Responsibilities

The backend owns WhatsApp webhooks, authentication, user persistence, conversation persistence, pharmacy search, pharmacy inventory, GPS/location, Google Maps, reminder scheduling, notification delivery, analytics dispatch, and final endpoint routing.

## 11. AI Responsibilities

The AI layer owns language understanding, provider-neutral AI orchestration, medical knowledge interfaces, RAG grounding interfaces, prompt management, safety validation, structured AI responses, and controlled fallback behavior.

## 12. Integration Test

Backend can verify the Phase 1 interface by sending:

```json
{
  "conversation_id": "conv-test",
  "user_id": "user-test",
  "message": "Where can I find Augmentin?",
  "message_type": "text",
  "language": "en",
  "context": {}
}
```

Expected result:

- `intent` is `medicine_search`
- `language` is `en`
- `actions` is an array
- `safety_status` is present
- no medical facts are fabricated

## Open Decisions

OPEN DECISION: Approved drug-information source.

OPEN DECISION: Approved LLM provider and model.

OPEN DECISION: Approved RAG retrieval provider, index, embedding strategy, and ingestion pipeline.

OPEN DECISION: Approved translation provider and medical translation validation process.

OPEN DECISION: Final backend HTTP endpoint path and auth wrapper.
