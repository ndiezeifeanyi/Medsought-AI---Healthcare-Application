/**
 * Embedding provider interface and Gemini implementation.
 *
 * Used by the RAG pipeline to convert text into dense vectors for
 * MongoDB Atlas Vector Search or any other vector store.
 */

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  initialDelayMs = 500
): Promise<Response> {
  let delay = initialDelayMs;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) {
        return res;
      }

      // Retryable HTTP status codes (rate limit 429, service unavailable 503, gateway timeout 504)
      if (res.status === 429 || res.status === 503 || res.status === 504) {
        const errorText = await res.text().catch(() => "");
        lastError = new Error(`Gemini API transient error (${res.status}): ${errorText}`);
        if (attempt < maxRetries) {
          await sleep(delay);
          delay *= 2;
          continue;
        }
      }

      const errorBody = await res.text().catch(() => "");
      throw new Error(`Gemini Embedding API error (${res.status}): ${errorBody}`);
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        await sleep(delay);
        delay *= 2;
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("Gemini API request failed after retries");
}

/**
 * Gemini Embedding provider using the gemini-embedding-2 model.
 * Defaults to 768 dimensions (via outputDimensionality parameter / MRL)
 * to maintain compatibility with existing Atlas Vector Search indexes,
 * or configurable via EMBEDDING_OUTPUT_DIMENSIONS (e.g. 768, 1536, 3072).
 * Requires GEMINI_API_KEY or MEDSOUGHT_LLM_API_KEY in the environment.
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = "gemini-embedding";
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;

  constructor(apiKey?: string, model?: string, dimensions?: number) {
    this.apiKey = apiKey
      ?? process.env.GEMINI_API_KEY
      ?? process.env.GOOGLE_API_KEY
      ?? process.env.MEDSOUGHT_LLM_API_KEY
      ?? "";
    this.model = process.env.GEMINI_EMBEDDING_MODEL ?? model ?? "gemini-embedding-2";

    const envDims = parseInt(process.env.EMBEDDING_OUTPUT_DIMENSIONS || "", 10);
    this.dimensions = !isNaN(envDims) && envDims > 0
      ? envDims
      : (dimensions ?? 768);

    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is required for GeminiEmbeddingProvider");
    }
  }

  async embed(text: string): Promise<number[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${this.apiKey}`;

    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: this.dimensions
      })
    });

    const data = await res.json() as {
      embedding?: { values: number[] };
    };

    if (!data.embedding?.values) {
      throw new Error("Gemini Embedding API returned unexpected empty embedding response");
    }

    return data.embedding.values;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:batchEmbedContents?key=${this.apiKey}`;

    const requests = texts.map((text) => ({
      model: `models/${this.model}`,
      content: { parts: [{ text }] },
      outputDimensionality: this.dimensions
    }));

    try {
      const res = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests })
      });

      const data = await res.json() as {
        embeddings?: Array<{ values: number[] }>;
      };

      if (data.embeddings && data.embeddings.length === texts.length) {
        return data.embeddings.map((e) => e.values);
      }
    } catch {
      // Fallback: if batchEmbedContents endpoint is unavailable or fails,
      // process requests sequentially using embedContent
    }

    const results: number[][] = [];
    for (const text of texts) {
      const vec = await this.embed(text);
      results.push(vec);
    }
    return results;
  }
}

