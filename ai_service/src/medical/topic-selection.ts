import type { Intent } from "../schemas/contracts.ts";
import type { DrugInformationTopic } from "../knowledge/drug-information-provider.ts";

export function topicsForIntent(intent: Intent, message = ""): DrugInformationTopic[] {
  if (intent === "side_effects") return ["side_effects"];
  if (intent === "drug_information") {
    const lower = message.toLowerCase();
    const requested: DrugInformationTopic[] = [];
    if (/\b(uses?|used for|treats?)\b/.test(lower)) requested.push("uses");
    if (/\b(side effects?|adverse effects?)\b/.test(lower)) requested.push("side_effects");
    if (/\b(contraindications?|avoid|should not use)\b/.test(lower)) requested.push("contraindications");
    if (/\b(pregnancy|pregnant|breastfeeding)\b/.test(lower)) requested.push("pregnancy_warnings");
    if (/\b(storage|store|keep)\b/.test(lower)) requested.push("storage");
    if (/\b(dose|dosage)\b/.test(lower)) requested.push("dosage");
    if (requested.length > 0) return [...new Set(requested)];

    return ["overview", "uses", "contraindications", "pregnancy_warnings", "storage", "dosage"];
  }
  return ["overview"];
}
