# Drug Information AI Component

1. Purpose
- Provide educational drug information (uses, side effects, contraindications, pregnancy warnings, dosage, storage) grounded in an approved drug-information source.

2. Endpoint / Interface
- The backend calls the AI layer with the `AiServiceRequest` payload (see schema) via an internal RPC or HTTP endpoint defined by the backend. The AI layer returns an `AiServiceResponse`.

3. Request schema
- Use the internal `AiServiceRequest` as defined in `ai_service/src/schemas/contracts.ts`.

4. Response schema
- Use `AiServiceResponse` from `ai_service/src/schemas/contracts.ts`. For drug information responses, `metadata.updated_context.current_medicine` will contain the resolved medicine name and `metadata.knowledge_source` will indicate the source.

5. Example request
```json
{
  "conversation_id": "conv-1",
  "user_id": "user-1",
  "message": "Tell me about AlphaMed.",
  "message_type": "text",
  "language": "en",
  "context": {}
}
```

6. Example response
```json
{
  "response": "Here is educational information for AlphaMed... Disclaimer; Educational only. Not medical advice.",
  "intent": "drug_information",
  "language": "en",
  "actions": [],
  "safety_status": "passed",
  "metadata": {
    "knowledge_source": "Synthetic Phase 2 Test Fixture",
    "confidence": 0.95,
    "errors": [],
    "updated_context": { "current_medicine": "AlphaMed" }
  }
}
```

7. Error responses
- `AiServiceError` envelopes are returned in `metadata.errors`. See `ai_service/src/errors/ai-error.ts` for codes. Common failures:
  - `UNKNOWN_MEDICINE` — upstream provider could not resolve the medicine.
  - `MISSING_MEDICAL_INFORMATION` — approved source missing requested topics.

8. Required environment variables
- `MEDSOUGHT_DRUG_INFO_PROVIDER`
- Provider-specific keys (e.g., `DRUG_API_KEY`, `DRUG_API_BASE_URL`).

9. Dependencies
- Configurable `DrugInformationProvider` adapter (RxNorm/DailyMed/curated dataset).

10. Backend responsibilities
- Provide user message transport, authentication and persistence.
- Implement scheduling, reminders, pharmacy inventory, and map/GPS-based search triggered by `medicine_search` actions returned by AI.

11. AI responsibilities
- Identify medicines, fetch grounded facts via `DrugInformationProvider`, generate educational responses, and enforce safety/disclaimer rules.

12. Integration test
- Use `ai_service/tests/` fixtures and `ai_service/tools/run_evaluation.ts` to run example flows against the AI layer locally.
