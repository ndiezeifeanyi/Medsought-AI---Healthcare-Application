import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { RetrievalQuery, EvidenceChunk, Retriever } from "./retriever.ts";

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from",
  "is", "am", "are", "was", "were", "be", "been", "being",
  "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
  "can", "could", "should", "would", "may", "might", "must", "do", "does", "did",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my", "your"
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] || 0) * (b[i] || 0);
  return s;
}

function norm(a: number[]) {
  return Math.sqrt(a.reduce((s, v) => s + v * v, 0));
}

export class InMemoryRetriever implements Retriever {
  readonly name = "inmemory";
  private indexPath: string;
  private index: { chunks: EvidenceChunk[]; vocab: string[] } | null = null;

  constructor(indexPath?: string) {
    this.indexPath = indexPath ?? join(process.cwd(), "ai_service/knowledge/index.json");
    if (existsSync(this.indexPath)) this.loadIndex();
  }

  private loadIndex() {
    const raw = readFileSync(this.indexPath, "utf8");
    this.index = JSON.parse(raw);
  }

  async retrieve(query: RetrievalQuery): Promise<EvidenceChunk[]> {
    if (!this.index) throw new Error("Index not found; run the indexer to build ai_service/knowledge/index.json");

    const allTokens = tokenize(query.query);
    const contentTokens = allTokens.filter((t) => !STOP_WORDS.has(t));
    const effectiveTokens = contentTokens.length > 0 ? contentTokens : allTokens;

    const vocab = this.index.vocab;
    const qVec: number[] = new Array(vocab.length).fill(0);
    for (const t of effectiveTokens) {
      const idx = vocab.indexOf(t);
      if (idx >= 0) qVec[idx] += 1;
    }

    const scored = this.index.chunks
      .map((chunk) => {
        const vec = (chunk.metadata?.vector as number[]) || [];
        const score = norm(vec) === 0 || norm(qVec) === 0 ? 0 : dot(vec, qVec) / (norm(vec) * norm(qVec));
        const chunkLower = chunk.text.toLowerCase();
        // Check if chunk text contains at least one meaningful token
        const matchesContentToken = contentTokens.some((t) => chunkLower.includes(t));
        return { chunk, score, matchesContentToken };
      })
      .filter((s) => s.score >= 0.1 && (contentTokens.length === 0 || s.matchesContentToken))
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, query.limit ?? 5).map((s) => ({ ...s.chunk, score: s.score }));
  }
}
