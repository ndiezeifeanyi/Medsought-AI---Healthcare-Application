# Phase 2 Backend Integration Handoff: Drug Information

## 1. Purpose

Phase 2 adds the drug-information flow for educational medication questions. It supports medicine identification, provider-backed medicine resolution, approved-source lookup, grounded response generation, required disclaimer insertion, and safe fallback behavior.

The implementation does not contain real medical facts. Until the team approves a production drug-information source, production medical requests must fail closed instead of fabricating answers.

## 2. Endpoint / Interface

Backend can keep using the Phase 1 request/response contract. The service call remains:

```ts
const processor = new ConversationProcessor({
  config: loadConfig(),
  drugInformationProvider
});

const response = await processor.process(request);
```

If `drugInformationProvider` is omitted, drug-information requests return the safe fallback. If supplied, it must implement the provider interface.

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
    "current_intent": "drug_information | side_effects | unknown | null",
    "metadata": {}
  }
}
```

## 4. Response Schema

```json
{
  "response": "string",
  "intent": "drug_information | side_effects | unknown",
  "language": "en | ha | yo | ig",
  "actions": [],
  "safety_status": "passed | needs_fallback | blocked",
  "metadata": {
    "knowledge_source": "string | null",
    "confidence": "number | null",
    "errors": []
  }
}
```

## 5. Example Request

```json
{
  "conversation_id": "conv-200",
  "user_id": "user-101",
  "message": "What are the side effects of AlphaMed?",
  "message_type": "text",
  "language": "en",
  "context": {}
}
```

`AlphaMed` is a synthetic test fixture name, not a real medicine.

## 6. Example Response

```json
{
  "response": "Here is educational information for AlphaMed from the approved drug-information source.\nSide effects: Synthetic approved side-effect text for test verification only.\nSource: Synthetic Phase 2 Test Fixture\n\nDisclaimer; Educational only. Not medical advice.",
  "intent": "side_effects",
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

Possible controlled failures:

- `DRUG_PROVIDER_UNCONFIGURED`: no approved drug-information provider has been configured.
- `UNKNOWN_MEDICINE`: provider could not resolve the requested medicine.
- `AMBIGUOUS_MEDICINE`: request does not identify a clear medicine.
- `MISSING_MEDICAL_INFORMATION`: source found the medicine but did not provide the requested information or citation.
- `DRUG_API_FAILURE`: provider call failed unexpectedly.
- `SAFETY_VALIDATION_FAILED`: generated response failed safety checks.

Errors are returned in `metadata.errors` when handled through `ConversationProcessor`. Direct service calls may throw `AiServiceError`.

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

External provider dependency is still open.

OPEN DECISION: approved drug-information source.

OPEN DECISION: provider adapter implementation details for RxNorm, DailyMed, curated dataset, RAG-backed retrieval, or another approved source.

OPEN DECISION: whether generic-name/brand-name normalization comes from the drug source directly or a separate terminology service.

## 10. Backend Responsibilities

Backend remains responsible for HTTP routing, auth, user/session storage, context persistence, analytics events, WhatsApp delivery, and deciding how to expose this AI service.

Backend must pass available `current_medicine` context for follow-up questions such as "What are its side effects?"

## 11. AI Responsibilities

AI layer is responsible for:

- detecting drug-information and side-effect requests
- identifying medicine names from the message or context
- resolving medicine names through the approved provider
- retrieving approved source information
- generating an educational answer only from returned source content
- adding `Disclaimer; Educational only. Not medical advice.`
- returning controlled fallbacks when information is unavailable

## 12. Integration Test

With a configured test provider, send:

```json
{
  "conversation_id": "conv-test",
  "user_id": "user-test",
  "message": "What are the side effects of AlphaMed?",
  "message_type": "text",
  "language": "en",
  "context": {}
}
```

Expected:

- `intent` is `side_effects`
- `safety_status` is `passed` only when provider evidence and citation are present
- `metadata.knowledge_source` is non-null
- `response` includes the configured disclaimer
- no medical facts are present unless returned by the approved provider

## Open Decisions

OPEN DECISION: Trusted production drug-information source.

WHY IT MATTERS: The AI layer cannot provide real drug facts without an approved authoritative source.

REQUIRED FROM TEAM: selected API/dataset/RAG source, access credentials, citation fields, supported topics, and source update policy.

POSSIBLE OPTIONS: RxNorm, DailyMed, locally curated pharmacist-reviewed dataset, RAG over approved source content, or another approved source.
