## ML/AI Backend Integration — API

Endpoint: `POST /api/v1/ai/chat`

Summary
- Thin HTTP integration layer exposing the existing AI pipeline to the backend.
- Accepts a small JSON payload (see Request below), delegates to `ConversationProcessor`, applies existing safety validation, and returns a controlled JSON response the backend can forward to users.

Request
- Content-Type: `application/json`
- Body schema (required fields):

```json
{
  "userId": "string",
  "conversationId": "string",
  "message": "string",
  "language": "string (optional, defaults to \"en\")",
  "messageType": "string (optional, defaults to \"text\")",
  "context": { /* optional conversation context forwarded if backend has it */ }
}
```

Response
- Success (HTTP 200) — body:

```json
{
  "message": "string",                      // user-facing text (safe)
  "intent": "string",                       // one of intent enum
  "urgency": "low|medium|high",             // mapped from safety status
  "pharmacistConsultationRequired": true|false
}
```

Intent enum
- Supported values (from `ai_service/src/schemas/contracts.ts`):
  - `drug_information`
  - `drug_interaction`
  - `side_effects`
  - `medicine_search`
  - `reminder_response`
  - `unknown`

Urgency (implemented)
- Values: `low`, `medium`, `high`.
- Default mapping (configurable):
  - `safety_status === 'passed'` -> `low`
  - `safety_status === 'needs_fallback'` -> `medium`
  - `safety_status === 'blocked'` -> `high`
- OPEN DECISION: confirm if you require a different taxonomy or thresholds.

Pharmacist consultation (implemented)
- Field: `pharmacistConsultationRequired` (boolean).
- Default rule implemented: `true` when `safety_status !== 'passed'`, otherwise `false`.
- OPEN DECISION: if you have specific rules for pharmacist escalation, provide them and we will implement.

Errors
- 400 Bad Request — JSON body failing validation (missing `userId`, `conversationId`, or `message`).
- 404 Not Found — unsupported path.
- 502 Bad Gateway — AI/provider processing error; response contains `{ error: "message" }`.

Notes
- The API layer is intentionally thin — it does not implement medical logic, prompting, or LLM orchestration.
- The existing safety pipeline (`ai_service/src/safety/validator.ts`) remains active and enforces disclaimers and blocking.
- The backend remains responsible for WhatsApp ingestion, authentication, persistence, and conversation storage.

Example request

```bash
curl -X POST http://localhost:3000/api/v1/ai/chat \
  -H 'Content-Type: application/json' \
  -d '{"userId":"user-123","conversationId":"conv-1","message":"What are the side effects of paracetamol?"}'
```

Example response (200)

```json
{
  "message": "Here are the side effects... Disclaimer; Educational only. Not medical advice.",
  "intent": "side_effects",
  "urgency": "low",
  "pharmacistConsultationRequired": false
}
```

Running locally
- Start the server:

```bash
node ai_service/api/server.ts
```

or use the npm script:

```bash
npm run start
```

Integration tests are available under `ai_service/tests/integration/api.test.ts` and are run via:

```bash
npm run test:integration
```
