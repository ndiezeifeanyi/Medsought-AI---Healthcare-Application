# Backend Handoff Package — MedSought AI Layer

Contents
- API docs: `ai_service/docs/backend-integration/api.md`
- OpenAPI: `ai_service/docs/backend-integration/openapi.yaml`
- Integration tests: `ai_service/tests/integration/api.test.ts`
- Server implementation: `ai_service/api/server.ts`
- Chat handler (mapping): `ai_service/api/handlers/chat.ts`
- Request/response schemas: `ai_service/api/schemas.ts`

How to run locally

1. Run unit + integration tests:

```bash
npm test
npm run test:integration
```

2. Start the API server locally:

```bash
npm run start
```

Open decisions for backend/product/medical
- Authentication: the endpoint is currently unauthenticated. Please provide an auth mechanism (API key, mTLS, JWT) and we'll add it.
- Urgency taxonomy and pharmacist escalation rules: default rules implemented; please confirm.
- Timeouts and SLA: confirm expected request timeout.

Files changed
- Added API server + handler + schemas.
- Added integration tests and docs.

Contact / Next steps
- If you want an OpenAPI UI (Swagger), we can add a small static endpoint to serve the YAML or generate swagger-ui files.
- If you require authentication, tell me the mechanism and I will add it.
