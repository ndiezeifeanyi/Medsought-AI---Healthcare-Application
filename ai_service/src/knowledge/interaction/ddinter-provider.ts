/**
 * DDInter 2.0 Drug-Interaction Provider (Local Bulk-Synced MongoDB Implementation)
 *
 * Provides high-performance, deterministic drug-drug interaction lookups
 * by querying the local `drug_interactions` collection in MongoDB, bulk-synced
 * from DDInter 2.0's complete dataset (https://ddinter2.scbdd.com).
 *
 * Direction-independent: Lookups query on a canonical sorted key
 *   `[normDrugA, normDrugB].sort().join("::")`
 * so drug pair lookups are completely symmetric and fast (O(1) indexed query).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  LICENSING NOTICE — READ BEFORE LAUNCHING COMMERCIALLY ⚠️
 * ─────────────────────────────────────────────────────────────────────────────
 * DDInter data is licensed under CC BY-NC-SA 4.0 (Creative Commons
 * Attribution-NonCommercial-ShareAlike 4.0 International).
 *
 * "Non-Commercial" means this provider MUST NOT be used in any version of
 * MedSought that is:
 *   - Offered as a paid product or subscription
 *   - Embedded in a commercially licensed software package
 *   - Generating direct or indirect commercial revenue
 *
 * Before MedSought is monetized, publicly launched as a paid product, or
 * otherwise made commercial in any way, this MUST be revisited:
 *   (a) Replace with a DrugBank commercial license, OR
 *   (b) Obtain a compatible commercial license from the DDInter team directly.
 *
 * Contact: http://www.scbdd.com/  |  Reference: ddinter2.scbdd.com/terms/
 * Set MEDSOUGHT_INTERACTION_PROVIDER=none in .env to disable immediately.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import dns from "node:dns";
import { MongoClient, type Collection, type Db } from "mongodb";
import type {
  DrugInteractionProvider,
  DrugInteractionLookupRequest,
  DrugInteractionCheckResult,
  InteractionPair,
} from "./drug-interaction-provider.ts";
import { createLogger, type Logger, type LogLevel } from "../../logging/logger.ts";

try {
  dns.setDefaultResultOrder?.("ipv4first");
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch {
  // ignore environments where custom DNS servers cannot be set
}

export interface DDInterProviderOptions {
  uri?: string;
  database?: string;
  collection?: string;
  aliasCollection?: string;
  logLevel?: LogLevel;
}

export interface MongoInteractionDoc {
  pair_key: string;
  drug_a: string;
  drug_a_norm: string;
  ddinter_id_a: string;
  drug_b: string;
  drug_b_norm: string;
  ddinter_id_b: string;
  level: "Major" | "Moderate" | "Minor" | "Unknown";
  atc_codes: string[];
  mechanism?: string;
  management?: string;
  source: string;
  license: string;
  updated_at: Date;
}

export interface MongoAliasDoc {
  alias: string;
  canonical_name: string;
  ddinter_id?: string;
  source: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class DDInterProvider implements DrugInteractionProvider {
  readonly name = "ddinter";

  private readonly uri: string;
  private readonly dbName: string;
  private readonly collectionName: string;
  private readonly aliasCollectionName: string;
  private readonly logger: Logger;

  private client: MongoClient | null = null;
  private db: Db | null = null;
  private interactionCollection: Collection<MongoInteractionDoc> | null = null;
  private aliasCollection: Collection<MongoAliasDoc> | null = null;

  // In-memory alias cache for ultra-fast repetitive lookups
  private readonly aliasCache = new Map<string, string>();

  constructor(options: DDInterProviderOptions = {}) {
    this.uri = options.uri ?? process.env.MONGODB_URI ?? "";
    this.dbName = options.database ?? process.env.MONGODB_DATABASE ?? "medsought";
    this.collectionName = options.collection ?? process.env.DDINTER_COLLECTION ?? "drug_interactions";
    this.aliasCollectionName =
      options.aliasCollection ?? process.env.DDINTER_ALIAS_COLLECTION ?? "drug_aliases";
    this.logger = createLogger(
      options.logLevel ?? ((process.env.MEDSOUGHT_LOG_LEVEL ?? "info") as LogLevel)
    );
  }

  /**
   * Lazily connects to MongoDB and initializes collection references.
   */
  private async ensureConnected(): Promise<{
    interactionCol: Collection<MongoInteractionDoc>;
    aliasCol: Collection<MongoAliasDoc>;
  }> {
    if (this.interactionCollection && this.aliasCollection) {
      return {
        interactionCol: this.interactionCollection,
        aliasCol: this.aliasCollection,
      };
    }

    if (!this.uri) {
      throw new Error("MONGODB_URI is not configured for DDInterProvider.");
    }

    this.client = new MongoClient(this.uri, {
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
    });

    await this.client.connect();
    this.db = this.client.db(this.dbName);
    this.interactionCollection = this.db.collection<MongoInteractionDoc>(this.collectionName);
    this.aliasCollection = this.db.collection<MongoAliasDoc>(this.aliasCollectionName);

    this.logger.info("DDInter local MongoDB provider connected", {
      database: this.dbName,
      interactionCollection: this.collectionName,
      aliasCollection: this.aliasCollectionName,
    });

    return {
      interactionCol: this.interactionCollection,
      aliasCol: this.aliasCollection,
    };
  }

  /**
   * Resolves a drug name to its canonical name in the DDInter dataset
   * using the local `drug_aliases` collection and in-memory cache.
   */
  async resolveCanonicalName(name: string): Promise<string> {
    const norm = name.toLowerCase().trim();
    if (!norm) return name;

    if (this.aliasCache.has(norm)) {
      return this.aliasCache.get(norm)!;
    }

    try {
      const { aliasCol } = await this.ensureConnected();
      const match = await aliasCol.findOne({ alias: norm });
      if (match?.canonical_name) {
        this.aliasCache.set(norm, match.canonical_name);
        return match.canonical_name;
      }
    } catch {
      // If alias lookup fails, fall through to input name
    }

    this.aliasCache.set(norm, name.trim());
    return name.trim();
  }

  /**
   * Health check verifies that MongoDB is reachable AND that the
   * `drug_interactions` collection contains synced records.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const { interactionCol } = await this.ensureConnected();
      const count = await interactionCol.estimatedDocumentCount();
      return count > 0;
    } catch (err) {
      this.logger.warn("DDInterProvider health check failed", { error: String(err) });
      return false;
    }
  }

  /**
   * Performs direction-independent interaction checks across all pairs
   * of the provided medicine list.
   */
  async checkInteractions(
    request: DrugInteractionLookupRequest
  ): Promise<DrugInteractionCheckResult> {
    const medicines = request.medicines ?? [];
    const retrievedAt = nowIso();

    if (medicines.length < 2) {
      return {
        medicines,
        query_status: "not_found",
        source_name: "DDInter 2.0",
        source_url: "https://ddinter2.scbdd.com",
        retrieved_at: retrievedAt,
      };
    }

    try {
      const { interactionCol } = await this.ensureConnected();

      // Check if dataset has been synced
      const count = await interactionCol.estimatedDocumentCount();
      if (count === 0) {
        this.logger.error("DDInter interaction collection is empty; dataset not synced.");
        return {
          medicines,
          query_status: "unreachable",
          source_name: "DDInter 2.0",
          source_url: "https://ddinter2.scbdd.com",
          retrieved_at: retrievedAt,
          error_detail: "Local DDInter dataset is empty. Run `sync_ddinter_dataset.ts` to sync.",
        };
      }

      // Step 1: Resolve all drug names to canonical active ingredient names
      const resolvedNames = await Promise.all(
        medicines.map((m) => this.resolveCanonicalName(m))
      );

      // Step 2: Check all unique pairs
      const foundInteractions: InteractionPair[] = [];

      for (let i = 0; i < resolvedNames.length; i++) {
        for (let j = i + 1; j < resolvedNames.length; j++) {
          const normA = resolvedNames[i].toLowerCase().trim();
          const normB = resolvedNames[j].toLowerCase().trim();

          const canonicalKey = normA <= normB ? `${normA}::${normB}` : `${normB}::${normA}`;

          const doc = await interactionCol.findOne({ pair_key: canonicalKey });
          if (doc) {
            foundInteractions.push({
              drug_a: doc.drug_a,
              drug_b: doc.drug_b,
              severity: doc.level,
              atc_codes: doc.atc_codes,
              citation: {
                source_id: `${doc.ddinter_id_a}+${doc.ddinter_id_b}`,
                source_name: "DDInter 2.0",
                url: "https://ddinter2.scbdd.com",
                retrieved_at: retrievedAt,
              },
            });
          }
        }
      }

      if (foundInteractions.length === 0) {
        this.logger.info("DDInter: query completed — no interactions found", {
          medicines,
          resolved: resolvedNames,
        });
        return {
          medicines,
          query_status: "not_found",
          source_name: "DDInter 2.0",
          source_url: "https://ddinter2.scbdd.com",
          retrieved_at: retrievedAt,
        };
      }

      const summary = this.buildSummary(foundInteractions);

      this.logger.info("DDInter: interactions found", {
        medicines,
        interactionCount: foundInteractions.length,
        severities: foundInteractions.map((i) => i.severity),
      });

      return {
        medicines,
        query_status: "found",
        interactions: foundInteractions,
        summary,
        source_name: "DDInter 2.0",
        source_url: "https://ddinter2.scbdd.com",
        retrieved_at: retrievedAt,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error("DDInter: local database query failed", {
        medicines,
        error: message,
      });
      return {
        medicines,
        query_status: "unreachable",
        source_name: "DDInter 2.0",
        source_url: "https://ddinter2.scbdd.com",
        retrieved_at: retrievedAt,
        error_detail: message,
      };
    }
  }

  /**
   * Formats interaction pairs into a clean grounding fact and clinical explanation request for the LLM.
   * States DDInter's verified classification and ATC categories, and prompts for a clear clinical explanation
   * and precautions without asking the LLM to self-disclose database sourcing inline.
   * For 'Unknown' severity, explicitly instructs that unclassified severity must not be framed as safe.
   */
  private buildSummary(interactions: InteractionPair[]): string {
    if (interactions.length >= 2) {
      const pairSummaries = interactions
        .map((pair, idx) => {
          const atcInfo =
            pair.atc_codes && pair.atc_codes.length > 0
              ? ` (ATC categories: ${pair.atc_codes.join(", ")})`
              : "";
          if (pair.severity === "Unknown") {
            return `[Pair ${idx + 1}: ${pair.drug_a} + ${pair.drug_b}]\nDocumented interaction with Unclassified severity${atcInfo}. You must address this pair specifically: explain clinical considerations and precautions, note that unclassified severity is not proof of safety, and state that professional consultation is advised. Do not claim they are safe together without medical supervision.`;
          }
          return `[Pair ${idx + 1}: ${pair.drug_a} + ${pair.drug_b}]\nDocumented interaction classified as ${pair.severity}${atcInfo}. You must address this pair specifically: explain the clinical mechanism and precautions in clear, patient-friendly language.`;
        })
        .join("\n\n");

      return `Multiple (${interactions.length}) distinct drug interaction pairs are documented for this combination:\n\n${pairSummaries}\n\nIMPORTANT: Your final response MUST explicitly address each of the ${interactions.length} distinct drug pairs listed above individually. Do not omit or combine them so vaguely that any pair is missed.`;
    }

    return interactions
      .map((pair) => {
        const atcInfo =
          pair.atc_codes && pair.atc_codes.length > 0
            ? ` (ATC categories: ${pair.atc_codes.join(", ")})`
            : "";
        if (pair.severity === "Unknown") {
          return `A clinical interaction between ${pair.drug_a} and ${pair.drug_b} is documented, but its severity is unclassified${atcInfo}. Explain the potential clinical considerations, pharmacological mechanisms, and precautions in plain, natural language suitable for a patient. Emphasize that an unclassified severity does not mean the combination is safe or free of risk, and advise consulting a healthcare professional. You must not claim or imply that the drugs do not interact or are safe to take together without medical supervision.`;
        }
        return `A clinical interaction between ${pair.drug_a} and ${pair.drug_b} is classified as ${pair.severity}${atcInfo}. Explain the likely clinical mechanism and appropriate precautions in plain, natural language suitable for a patient.`;
      })
      .join("\n\n");
  }

  /**
   * Closes the MongoDB connection gracefully.
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.interactionCollection = null;
      this.aliasCollection = null;
    }
  }
}
