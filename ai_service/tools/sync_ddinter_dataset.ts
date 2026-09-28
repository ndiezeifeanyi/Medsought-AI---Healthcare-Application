/**
 * DDInter 2.0 Bulk Dataset Sync Script
 *
 * Downloads all 8 DDInter CSV dataset files (by ATC code: A, B, D, H, L, P, R, V)
 * from https://ddinter2.scbdd.com, parses ~222,000 raw interactions into ~160,000
 * unique direction-independent canonical drug pairs, and bulk-syncs them into the
 * dedicated MongoDB `drug_interactions` collection.
 *
 * Also creates and populates the `drug_aliases` collection for synonym/brand-to-generic
 * resolution (e.g., aspirin → acetylsalicylic acid, tylenol/paracetamol → acetaminophen).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  LICENSING NOTICE ⚠️
 * DDInter data is licensed under CC BY-NC-SA 4.0 (Creative Commons
 * Attribution-NonCommercial-ShareAlike 4.0 International).
 * Non-Commercial use only.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   node ai_service/tools/sync_ddinter_dataset.ts [--force-download] [--drop]
 */

import dns from "node:dns";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { MongoClient, type Collection, type Db, type Document } from "mongodb";
import { createLogger } from "../src/logging/logger.ts";

try {
  dns.setDefaultResultOrder?.("ipv4first");
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch {
  // ignore
}

// Simple .env loader for CLI execution
function loadDotEnv() {
  const envPaths = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "ai_service/.env"),
  ];
  for (const p of envPaths) {
    try {
      const raw = readFileSync(p, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx <= 0) continue;
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    } catch {
      // ignore
    }
  }
}

loadDotEnv();

const logger = createLogger("info");

const ATC_CODES = ["A", "B", "D", "H", "L", "P", "R", "V"] as const;
const BASE_DOWNLOAD_URL = "https://ddinter2.scbdd.com/static/media/download";
const DATA_DIR = resolve(process.cwd(), "ai_service/data/ddinter_csvs");

const SEVERITY_RANK: Record<string, number> = {
  Major: 4,
  Moderate: 3,
  Minor: 2,
  Unknown: 1,
};

// Common Brand/Synonym to DDInter Canonical Active Ingredient Mappings
const COMMON_DRUG_ALIASES: Record<string, string> = {
  aspirin: "acetylsalicylic acid",
  "acetyl salicylic acid": "acetylsalicylic acid",
  asa: "acetylsalicylic acid",
  paracetamol: "acetaminophen",
  tylenol: "acetaminophen",
  panadol: "acetaminophen",
  advil: "ibuprofen",
  motrin: "ibuprofen",
  nurofen: "ibuprofen",
  coumadin: "warfarin",
  jantoven: "warfarin",
  lipitor: "atorvastatin",
  glucophage: "metformin",
  prilosec: "omeprazole",
  diflucan: "fluconazole",
  zoloft: "sertraline",
  plavix: "clopidogrel",
  cipro: "ciprofloxacin",
  amoxil: "amoxicillin",
  augmentin: "amoxicillin",
  synthroid: "levothyroxine",
  cozaar: "losartan",
  neurontin: "gabapentin",
  cordarone: "amiodarone",
  pacerone: "amiodarone",
  deltasone: "prednisone",
  zestril: "lisinopril",
  prinivil: "lisinopril",
  flagyl: "metronidazole",
  lasix: "furosemide",
  norvasc: "amlodipine",
  valium: "diazepam",
  xanax: "alprazolam",
  prozac: "fluoxetine",
  crestor: "rosuvastatin",
  nexium: "esomeprazole",
  viagra: "sildenafil",
  cialis: "tadalafil",
};

export interface CanonicalInteractionRecord {
  pair_key: string;
  drug_a: string;
  drug_a_norm: string;
  ddinter_id_a: string;
  drug_b: string;
  drug_b_norm: string;
  ddinter_id_b: string;
  level: "Major" | "Moderate" | "Minor" | "Unknown";
  atc_codes: string[];
  source: string;
  license: string;
  updated_at: Date;
}

export interface DrugAliasRecord {
  alias: string;
  canonical_name: string;
  ddinter_id?: string;
  source: string;
}

export async function downloadDDInterFiles(force = false): Promise<string[]> {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const files: string[] = [];
  for (const code of ATC_CODES) {
    const filePath = join(DATA_DIR, `ddinter_downloads_code_${code}.csv`);
    if (!force && existsSync(filePath)) {
      logger.info(`DDInter CSV code ${code} found in cache: ${filePath}`);
      files.push(filePath);
      continue;
    }

    const url = `${BASE_DOWNLOAD_URL}/ddinter_downloads_code_${code}.csv`;
    logger.info(`Downloading DDInter CSV code ${code} from ${url}...`);
    const res = await fetch(url, { headers: { "User-Agent": "MedSought/1.0" } });
    if (!res.ok) {
      throw new Error(`Failed to download code ${code} CSV: HTTP ${res.status}`);
    }
    const text = await res.text();
    writeFileSync(filePath, text, "utf8");
    logger.info(`Downloaded code ${code} (${text.length} bytes) -> ${filePath}`);
    files.push(filePath);
  }

  return files;
}

export function parseDDInterCSVs(filePaths: string[]): {
  interactions: Map<string, CanonicalInteractionRecord>;
  drugs: Map<string, { id: string; name: string; atc_codes: Set<string> }>;
  rawRowCount: number;
} {
  const interactions = new Map<string, CanonicalInteractionRecord>();
  const drugs = new Map<string, { id: string; name: string; atc_codes: Set<string> }>();
  let rawRowCount = 0;

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    const code = ATC_CODES[i] || "UNKNOWN";
    const content = readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

    // Skip header line
    const dataLines = lines.slice(1);
    rawRowCount += dataLines.length;

    for (const line of dataLines) {
      const parts = line.split(",");
      if (parts.length < 5) continue;

      const idA = parts[0].trim();
      const drugA = parts[1].trim();
      const idB = parts[2].trim();
      const drugB = parts[3].trim();
      const rawLevel = parts[4].trim();

      if (!drugA || !drugB) continue;

      const normA = drugA.toLowerCase();
      const normB = drugB.toLowerCase();

      // Track drugs
      if (!drugs.has(normA)) {
        drugs.set(normA, { id: idA, name: drugA, atc_codes: new Set() });
      }
      drugs.get(normA)!.atc_codes.add(code);

      if (!drugs.has(normB)) {
        drugs.set(normB, { id: idB, name: drugB, atc_codes: new Set() });
      }
      drugs.get(normB)!.atc_codes.add(code);

      // Canonical direction-independent pair key: sorted alphabetically
      let sortedPairKey: string;
      let primaryDrugA: string;
      let primaryDrugANorm: string;
      let primaryIdA: string;
      let primaryDrugB: string;
      let primaryDrugBNorm: string;
      let primaryIdB: string;

      if (normA <= normB) {
        sortedPairKey = `${normA}::${normB}`;
        primaryDrugA = drugA;
        primaryDrugANorm = normA;
        primaryIdA = idA;
        primaryDrugB = drugB;
        primaryDrugBNorm = normB;
        primaryIdB = idB;
      } else {
        sortedPairKey = `${normB}::${normA}`;
        primaryDrugA = drugB;
        primaryDrugANorm = normB;
        primaryIdA = idB;
        primaryDrugB = drugA;
        primaryDrugBNorm = normA;
        primaryIdB = idA;
      }

      const level = (
        ["Major", "Moderate", "Minor"].includes(rawLevel) ? rawLevel : "Unknown"
      ) as "Major" | "Moderate" | "Minor" | "Unknown";

      const existing = interactions.get(sortedPairKey);
      if (!existing) {
        interactions.set(sortedPairKey, {
          pair_key: sortedPairKey,
          drug_a: primaryDrugA,
          drug_a_norm: primaryDrugANorm,
          ddinter_id_a: primaryIdA,
          drug_b: primaryDrugB,
          drug_b_norm: primaryDrugBNorm,
          ddinter_id_b: primaryIdB,
          level,
          atc_codes: [code],
          source: "DDInter 2.0",
          license: "CC BY-NC-SA 4.0",
          updated_at: new Date(),
        });
      } else {
        if (!existing.atc_codes.includes(code)) {
          existing.atc_codes.push(code);
        }
        // If multiple entries disagree on severity, retain the highest severity
        if ((SEVERITY_RANK[level] ?? 0) > (SEVERITY_RANK[existing.level] ?? 0)) {
          existing.level = level;
        }
      }
    }
  }

  return { interactions, drugs, rawRowCount };
}

export async function syncToMongoDB(options: {
  interactions: Map<string, CanonicalInteractionRecord>;
  drugs: Map<string, { id: string; name: string; atc_codes: Set<string> }>;
  dropExisting?: boolean;
}): Promise<{
  syncedInteractions: number;
  syncedAliases: number;
}> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is missing.");
  }
  const dbName = process.env.MONGODB_DATABASE || "medsought";
  const interactionCollectionName = process.env.DDINTER_COLLECTION || "drug_interactions";
  const aliasCollectionName = process.env.DDINTER_ALIAS_COLLECTION || "drug_aliases";

  logger.info(`Connecting to MongoDB (${dbName})...`);
  const client = new MongoClient(uri, {
    connectTimeoutMS: 15000,
    serverSelectionTimeoutMS: 15000,
  });

  try {
    await client.connect();
    const db = client.db(dbName);
    const interactionCol: Collection<CanonicalInteractionRecord> = db.collection(interactionCollectionName);
    const aliasCol: Collection<DrugAliasRecord> = db.collection(aliasCollectionName);

    if (options.dropExisting) {
      logger.info(`Dropping existing collections ${interactionCollectionName} and ${aliasCollectionName}...`);
      try {
        await interactionCol.drop();
      } catch {}
      try {
        await aliasCol.drop();
      } catch {}
    }

    // Create indexes
    logger.info("Ensuring indexes on collections...");
    await interactionCol.createIndex({ pair_key: 1 }, { unique: true });
    await interactionCol.createIndex({ drug_a_norm: 1 });
    await interactionCol.createIndex({ drug_b_norm: 1 });
    await interactionCol.createIndex({ level: 1 });

    await aliasCol.createIndex({ alias: 1 }, { unique: true });
    await aliasCol.createIndex({ canonical_name: 1 });

    // Bulk write interactions
    const interactionRecords = Array.from(options.interactions.values());
    const batchSize = 2500;
    let syncedInteractions = 0;

    logger.info(`Syncing ${interactionRecords.length} unique interaction pairs into MongoDB...`);
    for (let i = 0; i < interactionRecords.length; i += batchSize) {
      const batch = interactionRecords.slice(i, i + batchSize);
      const operations = batch.map((record) => ({
        updateOne: {
          filter: { pair_key: record.pair_key },
          update: { $set: record },
          upsert: true,
        },
      }));
      await interactionCol.bulkWrite(operations, { ordered: false });
      syncedInteractions += batch.length;
      if (syncedInteractions % 25000 === 0 || syncedInteractions === interactionRecords.length) {
        logger.info(`- Synced ${syncedInteractions} / ${interactionRecords.length} interactions...`);
      }
    }

    // Build alias dictionary
    const aliasRecords: DrugAliasRecord[] = [];
    // 1. Direct drug names
    for (const [normName, d] of options.drugs.entries()) {
      aliasRecords.push({
        alias: normName,
        canonical_name: d.name,
        ddinter_id: d.id,
        source: "ddinter_direct",
      });
    }

    // 2. Common synonyms and brand names
    for (const [alias, canonicalTarget] of Object.entries(COMMON_DRUG_ALIASES)) {
      const normAlias = alias.toLowerCase().trim();
      const normTarget = canonicalTarget.toLowerCase().trim();
      const matchedDrug = options.drugs.get(normTarget);
      const canonicalName = matchedDrug ? matchedDrug.name : canonicalTarget;
      const ddinterId = matchedDrug?.id;

      aliasRecords.push({
        alias: normAlias,
        canonical_name: canonicalName,
        ddinter_id: ddinterId,
        source: "synonym_dictionary",
      });
    }

    // Deduplicate aliases
    const uniqueAliasMap = new Map<string, DrugAliasRecord>();
    for (const a of aliasRecords) {
      uniqueAliasMap.set(a.alias, a);
    }
    const finalAliases = Array.from(uniqueAliasMap.values());

    logger.info(`Syncing ${finalAliases.length} drug aliases into MongoDB...`);
    for (let i = 0; i < finalAliases.length; i += batchSize) {
      const batch = finalAliases.slice(i, i + batchSize);
      const operations = batch.map((record) => ({
        updateOne: {
          filter: { alias: record.alias },
          update: { $set: record },
          upsert: true,
        },
      }));
      await aliasCol.bulkWrite(operations, { ordered: false });
    }

    return {
      syncedInteractions,
      syncedAliases: finalAliases.length,
    };
  } finally {
    await client.close();
    logger.info("MongoDB sync connection closed.");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const forceDownload = args.includes("--force-download") || args.includes("--force");
  const dropExisting = args.includes("--drop");

  console.log("===============================================================");
  console.log(" MedSought AI — DDInter 2.0 Bulk Dataset Sync (Local MongoDB)");
  console.log(" License: CC BY-NC-SA 4.0 (Non-Commercial Use Only)");
  console.log("===============================================================\n");

  const files = await downloadDDInterFiles(forceDownload);
  logger.info(`Parsed ${files.length} CSV files.`);

  const { interactions, drugs, rawRowCount } = parseDDInterCSVs(files);
  logger.info("Dataset Parse Summary:", {
    rawRows: rawRowCount,
    uniqueCanonicalPairs: interactions.size,
    uniqueDrugs: drugs.size,
  });

  const syncResult = await syncToMongoDB({
    interactions,
    drugs,
    dropExisting,
  });

  console.log("\n===============================================================");
  console.log(" DDInter Sync Complete:");
  console.log(` - Raw CSV rows processed:         ${rawRowCount}`);
  console.log(` - Unique canonical pairs synced:   ${syncResult.syncedInteractions}`);
  console.log(` - Unique drug aliases synced:      ${syncResult.syncedAliases}`);
  console.log(" - Collections: `drug_interactions`, `drug_aliases`");
  console.log("===============================================================\n");
}

if (process.argv[1] && process.argv[1].includes("sync_ddinter_dataset.ts")) {
  main().catch((err) => {
    console.error("DDInter sync failed:", err);
    process.exit(1);
  });
}
