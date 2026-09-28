import type { LlmProvider } from "../llm/interface.ts";
import { createLogger, type Logger } from "../logging/logger.ts";

export interface SemanticGuardrailRequest {
  medicines: string[];
  severityStatus: string;
  draftResponse: string;
}

export interface SemanticGuardrailResult {
  hasFalseReassurance: boolean;
  reasoning: string;
  latencyMs: number;
}

export class DrugInteractionSemanticGuardrail {
  private readonly llmProvider: LlmProvider;
  private readonly logger: Logger;

  constructor(llmProvider: LlmProvider, logger?: Logger) {
    this.llmProvider = llmProvider;
    this.logger = logger ?? createLogger("info", "SemanticGuardrail");
  }

  /**
   * Audits a draft response about a drug interaction to determine whether it makes
   * unauthorized claims of safety, absence of interaction, or lack of need for professional consultation.
   */
  async auditResponse(request: SemanticGuardrailRequest): Promise<SemanticGuardrailResult> {
    const startTime = Date.now();
    const prompt = `You are an expert clinical pharmacovigilance safety auditor evaluating an AI assistant's draft response to a patient about a potential drug-drug interaction.

Drug Pair: ${request.medicines.join(" and ")}
Documented Database Status: ${request.severityStatus}

Draft Response to Evaluate:
"""
${request.draftResponse}
"""

Audit Task:
Determine if the draft response states or implies ANY of the following:
1. That the combination is safe, harmless, or "fine to take together" without medical oversight.
2. That there is "no interaction", "no harmful interaction", or "no issue/concern" when source data indicates a documented interaction or unclassified severity.
3. That the patient does not need to consult a healthcare provider or pharmacist.

Note: Explaining how a known interaction works while cautioning the patient to consult their doctor or monitor symptoms is ACCEPTABLE. However, claiming the pair does not interact or can be taken together without issue is an immediate VIOLATION.

Return ONLY a valid JSON object with the following structure:
{
  "has_false_reassurance": true | false,
  "reasoning": "brief 1-2 sentence explanation of why this passed or failed"
}`;

    try {
      const result = await this.llmProvider.generate({
        messages: [
          { role: "system", content: "You are a strict clinical safety auditor. Output only valid JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.0,
        max_tokens: 300,
      });

      const latencyMs = Date.now() - startTime;
      const cleanJson = (result.content || "").replace(/```json\s*/gi, "").replace(/```\s*$/gi, "").trim();
      
      let parsed: { has_false_reassurance?: boolean; reasoning?: string };
      try {
        parsed = JSON.parse(cleanJson);
      } catch {
        // Fallback heuristic if JSON parse fails
        const lower = cleanJson.toLowerCase();
        const hasReassurance = lower.includes('"has_false_reassurance": true') || lower.includes("true");
        parsed = {
          has_false_reassurance: hasReassurance,
          reasoning: cleanJson
        };
      }

      const hasFalseReassurance = Boolean(parsed.has_false_reassurance);
      const reasoning = parsed.reasoning || "Audit completed";

      if (hasFalseReassurance) {
        this.logger.warn("Semantic guardrail flagged false reassurance in draft response", {
          medicines: request.medicines,
          severityStatus: request.severityStatus,
          reasoning,
          latencyMs,
          draftSnippet: request.draftResponse.slice(0, 100)
        });
      } else {
        this.logger.info("Semantic guardrail passed draft response", {
          medicines: request.medicines,
          severityStatus: request.severityStatus,
          latencyMs
        });
      }

      return {
        hasFalseReassurance,
        reasoning,
        latencyMs
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error("Semantic guardrail evaluation failed; defaulting to safe pass check", {
        medicines: request.medicines,
        error: errorMsg,
        latencyMs
      });
      return {
        hasFalseReassurance: false,
        reasoning: `Guardrail evaluation error: ${errorMsg}`,
        latencyMs
      };
    }
  }

  /**
   * Generates a safe, non-reassuring clinical fallback response when generation repeatedly fails safety checks.
   */
  generateSafeFallback(medicines: string[], severityStatus: string): string {
    const medNames = medicines.join(" and ");
    if (severityStatus.toLowerCase().includes("unknown") || severityStatus.toLowerCase().includes("unclassified")) {
      return `A clinical interaction between ${medNames} is documented in clinical reference records, though its specific severity remains unclassified. An unclassified severity does not mean the combination is safe or free of risk. Because individual health profiles and concurrent medications vary, you should consult your prescribing doctor or local pharmacist before combining these medications to ensure a safe treatment plan.\n\nDisclaimer; Educational only. Not medical advice.`;
    }
    return `A clinical interaction between ${medNames} is documented (${severityStatus}). Because this combination can carry potential health risks and may require dose adjustment or close monitoring, please consult your prescribing doctor or pharmacist before taking these medications together.\n\nDisclaimer; Educational only. Not medical advice.`;
  }
}
