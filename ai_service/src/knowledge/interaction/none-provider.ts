/**
 * None/Stub interaction provider — used when MEDSOUGHT_INTERACTION_PROVIDER=none.
 *
 * Returns "unconfigured" status explicitly so logs always distinguish between
 * "not configured" and "no interactions found." Never silently returns found: false.
 */

import type {
  DrugInteractionProvider,
  DrugInteractionLookupRequest,
  DrugInteractionCheckResult,
} from "./drug-interaction-provider.ts";
import { createLogger } from "../../logging/logger.ts";

export class NoneInteractionProvider implements DrugInteractionProvider {
  readonly name = "none";

  private readonly logger = createLogger(
    (process.env.MEDSOUGHT_LOG_LEVEL ?? "info") as any
  );

  async checkInteractions(
    request: DrugInteractionLookupRequest
  ): Promise<DrugInteractionCheckResult> {
    this.logger.warn(
      "Interaction provider is disabled (MEDSOUGHT_INTERACTION_PROVIDER=none). " +
      "Drug-drug interaction checking is not active. Set MEDSOUGHT_INTERACTION_PROVIDER=ddinter to enable.",
      { medicines: request.medicines }
    );

    return {
      medicines: request.medicines,
      query_status: "unconfigured",
      source_name: "none",
      retrieved_at: new Date().toISOString(),
    };
  }

  async healthCheck(): Promise<boolean> {
    // Explicitly not healthy — this signals the interaction layer is disabled
    return false;
  }
}
