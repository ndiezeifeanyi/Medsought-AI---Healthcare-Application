# MedSought AI Layer — ai_service

This folder contains the provider-agnostic AI layer for MedSought. It implements modular interfaces for LLMs (Gemini / OpenAI), drug-information providers (RxNorm / DailyMed), MongoDB Atlas Vector Search for RAG, reminders, safety guardrails, and multilingual processing.

## Architecture

```
WhatsApp / Backend
    ↓
Text Message
    ↓
AI Conversation Layer (ConversationProcessor)
    ├── Intent & Entity Extraction
    ├── Multilingual Translation (if non-English)
    ├── Grounded Drug Knowledge (RxNorm / Live API)
    ├── MongoDB Vector Search (RAG Knowledge Retrieval)
    ├── LLM Generation (Gemini / OpenAI)
    └── Safety Validation & Disclaimer Injection
    ↓
Structured Response
    ↓
Backend
```

## Quick Start

1. Copy `.env.example` to `.env` and set environment variables:
   - `GEMINI_API_KEY`: Google Gemini API key for LLM and embeddings
   - `MEDSOUGHT_RETRIEVAL_PROVIDER`: `mongodb` (or `inmemory` for local dev)
   - `MONGODB_URI`: MongoDB Atlas connection string with vector search index
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run tests:
   ```bash
   npm test
   ```
4. Start the API server:
   ```bash
   npm start
   ```

## MongoDB Vector Search Setup

To enable semantic RAG in MongoDB Atlas:
1. Create a MongoDB Atlas cluster (M0 or higher).
2. Create a collection named `knowledge_chunks` in the `medsought` database.
3. Define an Atlas Vector Search index named `vector_index` on the `embedding` field:
   ```json
   {
     "fields": [
       {
         "type": "vector",
         "path": "embedding",
         "numDimensions": 768,
         "similarity": "cosine"
       }
     ]
   }
   ```
4. Ingest documents:
   ```bash
   node ai_service/tools/build_corpus_index.ts
   ```

Do not commit credentials.
