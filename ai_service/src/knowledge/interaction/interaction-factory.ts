/**
 * Interaction provider factory.
 *
 * Reads MEDSOUGHT_INTERACTION_PROVIDER from the environment and returns
 * the appropriate DrugInteractionProvider implementation:
 *
 *   "ddinter" (default) → DDInterProvider  (CC BY-NC-SA 4.0 — non-commercial only)
 *   "none"              → NoneInteractionProvider (interaction checking disabled)
 *
 * On startup, the factory performs a health-check against the configured
 * provider and logs a prominent WARNING if the provider is unreachable.
 * This ensures a future silent dependency death is caught immediately in
 * logs rather than requiring a manual audit months later.
 */

import type { DrugInteractionProvider } from "./drug-interaction-provider.ts";
import { DDInterProvider } from "./ddinter-provider.ts";
import { NoneInteractionProvider } from "./none-provider.ts";
import { createLogger } from "../../logging/logger.ts";

let _instance: DrugInteractionProvider | null = null;

export function resolveInteractionProvider(
  env: Record<string, string | undefined> = process.env
): DrugInteractionProvider {
  if (_instance) return _instance;

  const name = (env.MEDSOUGHT_INTERACTION_PROVIDER ?? "ddinter").toLowerCase().trim();
  const logger = createLogger((env.MEDSOUGHT_LOG_LEVEL ?? "info") as any);

  let provider: DrugInteractionProvider;

  if (name === "ddinter") {
    provider = new DDInterProvider({
      uri: env.MONGODB_URI,
      database: env.MONGODB_DATABASE,
      collection: env.DDINTER_COLLECTION,
      aliasCollection: env.DDINTER_ALIAS_COLLECTION,
      logLevel: (env.MEDSOUGHT_LOG_LEVEL ?? "info") as any,
    });
    logger.info("Interaction provider: DDInter 2.0 (CC BY-NC-SA 4.0 — non-commercial only)", {
      database: env.MONGODB_DATABASE ?? "medsought",
      collection: env.DDINTER_COLLECTION ?? "drug_interactions",
    });
  } else if (name === "none") {
    provider = new NoneInteractionProvider();
    logger.warn(
      "Interaction provider disabled (MEDSOUGHT_INTERACTION_PROVIDER=none). " +
      "Drug-drug interaction checking will not return clinical data."
    );
  } else {
    logger.warn(
      `Unknown interaction provider "${name}"; defaulting to DDInter. ` +
      "Set MEDSOUGHT_INTERACTION_PROVIDER=none to disable interaction checking."
    );
    provider = new DDInterProvider({
      uri: env.MONGODB_URI,
      database: env.MONGODB_DATABASE,
      collection: env.DDINTER_COLLECTION,
      aliasCollection: env.DDINTER_ALIAS_COLLECTION,
      logLevel: (env.MEDSOUGHT_LOG_LEVEL ?? "info") as any,
    });
  }

  _instance = provider;

  // Async health check — fires once at startup but does not block initialization
  scheduleHealthCheck(provider, logger);

  return provider;
}

/** Reset the singleton — for testing only. */
export function _resetInteractionProviderForTesting(): void {
  _instance = null;
}

function scheduleHealthCheck(
  provider: DrugInteractionProvider,
  logger: ReturnType<typeof createLogger>
): void {
  // Run health check without blocking the factory return
  provider.healthCheck().then((healthy) => {
    if (!healthy) {
      logger.warn(
        `[HEALTH CHECK] Interaction provider "${provider.name}" is NOT reachable. ` +
        "Drug-drug interaction queries will return 'unreachable' status until this is resolved. " +
        "Ensure MongoDB is connected and the dataset is synced (run `sync_ddinter_dataset.ts`)."
      );
    } else {
      logger.info(`[HEALTH CHECK] Interaction provider "${provider.name}" is reachable.`);
    }
  }).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      `[HEALTH CHECK] Interaction provider "${provider.name}" health check threw: ${message}`
    );
  });
}
