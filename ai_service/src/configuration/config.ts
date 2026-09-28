import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LANGUAGE_CODES, type LanguageCode } from "../schemas/contracts.ts";

export interface AiRuntimeConfig {
  supported_languages: LanguageCode[];
  rag: {
    enabled: boolean;
    required: boolean;
    relevance_threshold: number;
  };
  mongodb: {
    uri?: string;
    database?: string;
    collection?: string;
  };
  timeouts: {
    llm_ms: number;
    drug_info_ms: number;
    translation_ms: number;
  };
  safety: {
    disclaimer_text: string;
    require_disclaimer_for_medical_content: boolean;
    emergency_escalation_rules_enabled: boolean;
  };
  providers: {
    llm?: string;
    drug_information?: string;
    retrieval?: string;
    translation?: string;
  };
  prompt_dir: string;
  log_level: string;
}

interface ConfigFileShape {
  supported_languages?: string[];
  rag?: {
    enabled?: boolean;
    required?: boolean;
    relevance_threshold?: number;
  };
  mongodb?: {
    uri?: string;
    database?: string;
    collection?: string;
  };
  timeouts?: Partial<AiRuntimeConfig["timeouts"]>;
  safety?: Partial<AiRuntimeConfig["safety"]>;
}

function readConfigFile(path: string): ConfigFileShape {
  return JSON.parse(readFileSync(path, "utf8")) as ConfigFileShape;
}

function requireSupportedLanguages(values: string[] | undefined): LanguageCode[] {
  const configured = values ?? [...LANGUAGE_CODES];
  const invalid = configured.filter((language) => !LANGUAGE_CODES.includes(language as LanguageCode));
  if (invalid.length > 0) {
    throw new Error(`Unsupported language configured: ${invalid.join(", ")}`);
  }
  return configured as LanguageCode[];
}

import { existsSync } from "node:fs";

function loadDotEnvIfPresent(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AiRuntimeConfig {
  loadDotEnvIfPresent();
  const configPath = resolve(env.MEDSOUGHT_AI_CONFIG_PATH ?? process.env.MEDSOUGHT_AI_CONFIG_PATH ?? "ai_service/config/default.json");
  const fileConfig = readConfigFile(configPath);

  const relevanceThreshold = env.RAG_RELEVANCE_THRESHOLD
    ? parseFloat(env.RAG_RELEVANCE_THRESHOLD)
    : fileConfig.rag?.relevance_threshold ?? 0.7;

  return {
    supported_languages: requireSupportedLanguages(fileConfig.supported_languages),
    rag: {
      enabled: env.MEDSOUGHT_RAG_ENABLED ? env.MEDSOUGHT_RAG_ENABLED === "true" : fileConfig.rag?.enabled ?? true,
      required: fileConfig.rag?.required ?? true,
      relevance_threshold: isNaN(relevanceThreshold) ? 0.7 : relevanceThreshold
    },
    mongodb: {
      uri: env.MONGODB_URI ?? fileConfig.mongodb?.uri,
      database: env.MONGODB_DATABASE ?? fileConfig.mongodb?.database ?? "medsought",
      collection: env.MONGODB_COLLECTION ?? fileConfig.mongodb?.collection ?? "knowledge_chunks"
    },
    timeouts: {
      llm_ms: fileConfig.timeouts?.llm_ms ?? 10000,
      drug_info_ms: fileConfig.timeouts?.drug_info_ms ?? 10000,
      translation_ms: fileConfig.timeouts?.translation_ms ?? 10000
    },
    safety: {
      disclaimer_text: fileConfig.safety?.disclaimer_text ?? "",
      require_disclaimer_for_medical_content: fileConfig.safety?.require_disclaimer_for_medical_content ?? true,
      emergency_escalation_rules_enabled: fileConfig.safety?.emergency_escalation_rules_enabled ?? false
    },
    providers: {
      llm: env.MEDSOUGHT_LLM_PROVIDER,
      drug_information: env.MEDSOUGHT_DRUG_INFO_PROVIDER,
      retrieval: env.MEDSOUGHT_RETRIEVAL_PROVIDER,
      translation: env.MEDSOUGHT_TRANSLATION_PROVIDER
    },
    prompt_dir: resolve(env.MEDSOUGHT_PROMPT_DIR ?? "ai_service/prompts"),
    log_level: env.MEDSOUGHT_LOG_LEVEL ?? "info"
  };
}
