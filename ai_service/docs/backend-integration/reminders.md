# Reminders Conversation Handoff

1. Purpose
- Interpret reminder-related conversational replies and return structured `reminder_event` actions for backend schedulers.

2. Interface
- AI receives `AiServiceRequest` and returns `AiServiceResponse` with `actions` containing `reminder_event` payloads.

3. Payload example
```json
{ "type": "reminder_event", "payload": { "event": "taken", "medicine": "Paracetamol" } }
```

4. Errors
- If ambiguous, AI returns `reminder_event` with `event: "unrelated"` and low confidence.

5. Env vars
- None specific; translator optional.

6. Backend responsibilities
- Persist reminders, trigger notifications, record adherence events, and map AI `delay` events to scheduling changes.

7. AI responsibilities
- Classify reminder replies, extract optional medicine, and return structured actions.
