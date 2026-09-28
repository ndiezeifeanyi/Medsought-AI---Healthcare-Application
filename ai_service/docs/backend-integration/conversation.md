# Conversation Processor Integration Handoff

1. Purpose
- The Conversation Processor accepts backend-supplied messages and returns structured AI responses, detected intent, actions, safety status, and optional updated short-term conversation context.

2. Endpoint / Interface
- Backend calls AI with `AiServiceRequest` and receives `AiServiceResponse`. The processor is provider-agnostic and uses configured adapters for LLM, translation, and drug-information providers.

3. Request schema
- `AiServiceRequest` in `ai_service/src/schemas/contracts.ts`.

4. Response schema
- `AiServiceResponse`. For conversation context, see `metadata.updated_context`.

5. Example request/response
- See `drug-information.md` for an example. For a `medicine_search` request, AI returns an action:
```json
"actions": [{ "type": "medicine_search", "payload": { "medicine": "Augmentin", "location_hint": "Ikeja" } }]
```

6. Error responses
- Malformed input returns `MALFORMED_INPUT` in `metadata.errors`.

7. Required environment variables
- `MEDSOUGHT_PROMPT_DIR`, provider selection env vars (LLM, translator, drug info).

8. Dependencies
- `DrugInformationProvider` for grounding, optional `Translator` for non-English messages.

9. Backend responsibilities
- Persist `metadata.updated_context` where appropriate (short-term only) and use `actions` to perform searches or schedule reminders.

10. AI responsibilities
- NLU (intent, entity extraction), medical grounding, response generation, safety validation, translation integration.

11. Integration test
- `ai_service/tools/run_evaluation.ts` demonstrates end-to-end processing for sample WhatsApp messages.
