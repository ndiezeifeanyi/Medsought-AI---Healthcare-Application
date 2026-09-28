import { AiServiceError } from "../../errors/ai-error.ts";
import type {
  DrugInformationProvider,
  DrugLookupRequest,
  DrugInformationResult,
  MedicineResolutionRequest,
  MedicineResolutionResult,
  DrugInteractionLookupRequest,
  DrugInteractionResult
} from "../drug-information-provider.ts";

/**
 * Base URL for the RxNorm/RxNav REST API.
 * Configurable via RXNORM_BASE_URL env var.
 *
 * NOTE: Only the normalization endpoints are used here (rxcui.json,
 * approximateTerm.json, rxcui/{id}/properties.json). These are still
 * live and maintained by NLM as of 2026.
 *
 * The former /interaction/list.json endpoint was REMOVED — it returned
 * HTTP 404 on every call after NLM discontinued it in January 2024.
 * Drug-drug interaction checking now uses DDInterProvider.
 * @see ai_service/src/knowledge/interaction/ddinter-provider.ts
 */
const RXNAV_BASE = process.env.RXNORM_BASE_URL?.replace(/\/$/, '') ?? "https://rxnav.nlm.nih.gov/REST";

function nowIso() {
  return new Date().toISOString();
}

function isPlausibleSpellingMatch(input: string, candidate: string): boolean {
  const inNorm = input.toLowerCase().trim();
  const candNorm = candidate.toLowerCase().trim();
  if (inNorm.length < 3) return false;
  if (candNorm.includes(inNorm)) return true;
  const candWords = candNorm.split(/[\s\-\/\(\)]+/).filter((w) => w.length >= 3);
  for (const w of candWords) {
    if (w.startsWith(inNorm) || (inNorm.length >= 4 && inNorm.startsWith(w))) return true;
    if (Math.abs(w.length - inNorm.length) <= 2) {
      let diff = 0;
      const minLen = Math.min(w.length, inNorm.length);
      for (let i = 0; i < minLen; i++) {
        if (w[i] !== inNorm[i]) diff++;
      }
      diff += Math.abs(w.length - inNorm.length);
      if (diff <= 2) return true;
    }
  }
  return false;
}

export class RxNormDrugProvider implements DrugInformationProvider {
  readonly name = "rxnorm";

  private async fetchJson(url: string) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new AiServiceError("DRUG_API_FAILURE", `RxNorm API error ${res.status}`, false);
    return res.json();
  }

  async resolveMedicine(request: MedicineResolutionRequest): Promise<MedicineResolutionResult> {
    const input = request.medicine_name?.trim() ?? "";
    if (!input) {
      return {
        input,
        found: false,
        confidence: 0,
        candidates: [],
        source_name: this.name
      };
    }

    // 1. PRIMARY PATH: Try exact match first via /rxcui.json?name=X
    try {
      const term = encodeURIComponent(input);
      const exactRes = await this.fetchJson(`${RXNAV_BASE}/rxcui.json?name=${term}`);
      const rxcui = exactRes?.idGroup?.rxnormId?.[0];
      if (rxcui) {
        let resolvedName = input;
        try {
          const props = await this.fetchJson(`${RXNAV_BASE}/rxcui/${rxcui}/properties.json`);
          if (props?.properties?.name) {
            resolvedName = props.properties.name;
          }
        } catch {
          // Use input name if properties lookup fails
        }

        return {
          input,
          found: true,
          resolved_name: resolvedName,
          confidence: 1.0,
          candidates: [{ name: resolvedName, confidence: 1.0 }],
          source_name: this.name
        };
      }
    } catch {
      // Proceed to fallback approximateTerm
    }

    // 2. FALLBACK PATH: Approximate/fuzzy matching for misspellings / typos
    try {
      const term = encodeURIComponent(input);
      const url = `${RXNAV_BASE}/approximateTerm.json?term=${term}&maxEntries=6`;
      const body = await this.fetchJson(url);
      const candidatesList = (body?.approximateGroup?.candidate || body?.approximateTerm?.candidate || []) as Array<any>;
      if (!candidatesList || candidatesList.length === 0) {
        return {
          input,
          found: false,
          confidence: 0,
          candidates: [],
          source_name: this.name
        };
      }

      const mapped: Array<{ name: string; confidence: number }> = [];
      for (const c of candidatesList) {
        const rawScore = parseFloat(c?.score ?? "0");
        const rank = parseInt(c?.rank ?? "1", 10);
        // Empirically, RxNav approximateTerm scores for typos and valid terms range from ~7.0 to 14.0.
        // We reject candidates scoring below 5.0 or ranked lower than 3.
        if (rawScore < 5.0 || rank > 3) continue;

        let candidateName = c?.name || c?.candidate;
        if (!candidateName && c?.rxcui) {
          try {
            const props = await this.fetchJson(`${RXNAV_BASE}/rxcui/${c.rxcui}/properties.json`);
            candidateName = props?.properties?.name;
          } catch {
            // ignore property lookup error for individual candidate
          }
        }
        if (candidateName && isPlausibleSpellingMatch(input, candidateName)) {
          // Calculate confidence between 0.50 and 0.95 based on rawScore (5 to 15 scale)
          const confidence = Math.min(0.95, Math.max(0.50, Number((rawScore / 15).toFixed(2))));
          mapped.push({ name: candidateName, confidence });
        }
      }

      if (mapped.length === 0) {
        return {
          input,
          found: false,
          confidence: 0,
          candidates: [],
          source_name: this.name
        };
      }

      return {
        input,
        found: true,
        resolved_name: mapped[0].name,
        confidence: mapped[0].confidence ?? 0.5,
        candidates: mapped,
        source_name: this.name
      };
    } catch (e: any) {
      if (e instanceof AiServiceError) throw e;
      throw new AiServiceError("DRUG_API_FAILURE", String((e as any)?.message ?? e), false);
    }
  }

  async getDrugInformation(request: DrugLookupRequest): Promise<DrugInformationResult> {
    try {
      let rxcui: string | undefined;
      const citations: any[] = [];
      const name = encodeURIComponent(request.medicine_name);

      try {
        const rxcuiResp = await this.fetchJson(`${RXNAV_BASE}/rxcui.json?name=${name}`);
        rxcui = rxcuiResp?.idGroup?.rxnormId?.[0];
      } catch {
        // proceed to approximate lookup
      }

      if (!rxcui) {
        const resolved = await this.resolveMedicine({ medicine_name: request.medicine_name, language: request.language });
        if (resolved.found && resolved.resolved_name) {
          const resolvedName = encodeURIComponent(resolved.resolved_name);
          const rxcuiResp = await this.fetchJson(`${RXNAV_BASE}/rxcui.json?name=${resolvedName}`);
          rxcui = rxcuiResp?.idGroup?.rxnormId?.[0];
        }
      }

      if (!rxcui) {
        return {
          medicine_name: request.medicine_name,
          found: false,
          topics: {},
          citations: []
        };
      }

      // properties endpoint provides canonical name and attributes
      const props = await this.fetchJson(`${RXNAV_BASE}/rxcui/${rxcui}/properties.json`);
      const prop = props?.properties || {};
      citations.push({ source_id: rxcui, source_name: "RxNorm", url: `https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}`, retrieved_at: nowIso() });

      const normalized = prop?.name ?? request.medicine_name;

      const topics: Record<string, string> = {} as any;
      const overviewParts: string[] = [];
      if (prop?.name) overviewParts.push(`Canonical name: ${prop.name}`);
      if (prop?.synonym) overviewParts.push(`Synonyms: ${prop.synonym}`);
      if (prop?.tty) overviewParts.push(`Term type: ${prop.tty}`);

      const summary = overviewParts.join(". ") || `Active pharmaceutical ingredient: ${normalized}`;
      topics.overview = summary;
      topics.uses = `Informational details for ${normalized} (${overviewParts.join(", ")})`;
      topics.side_effects = `Standard medical precautions for ${normalized}. Consult a healthcare professional.`;

      return {
        medicine_name: request.medicine_name,
        normalized_name: normalized,
        found: true,
        topics,
        citations
      };
    } catch (e: any) {
      if (e instanceof AiServiceError) throw e;
      throw new AiServiceError("DRUG_API_FAILURE", String((e as any)?.message ?? e), false);
    }
  }

  /**
   * @deprecated This method stub exists only to satisfy the DrugInformationProvider
   * interface. Drug-drug interaction checking is now handled exclusively by
   * DDInterProvider (or the configured DrugInteractionProvider).
   *
   * The former implementation called /REST/interaction/list.json which NLM
   * discontinued in January 2024 (returns HTTP 404 on every call).
   *
   * This stub returns an unconfigured status so callers are not silently told
   * "no interactions found" when the method is mistakenly called directly.
   */
  async getDrugInteractions(request: DrugInteractionLookupRequest): Promise<DrugInteractionResult> {
    return {
      medicines: request.medicines,
      found: false,
      citations: [],
      query_status: "unconfigured"
    };
  }
}
