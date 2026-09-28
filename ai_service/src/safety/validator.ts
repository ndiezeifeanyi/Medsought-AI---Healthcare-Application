import type { AiRuntimeConfig } from "../configuration/config.ts";
import { AiServiceError } from "../errors/ai-error.ts";
import { appendDisclaimer, hasRequiredDisclaimer } from "./disclaimer.ts";
import { extractMedicineCandidates } from "../conversation/intent.ts";

export function containsMedicalContent(text: string): boolean {
  if (!text) return false;
  // 1. Detected medicine candidates
  const medicines = extractMedicineCandidates(text);
  if (medicines.length > 0) return true;

  // 2. Health guidance / clinical indicator patterns
  const healthIndicators = /\b(?:medications?|medicines?|prescriptions?|dosage|doses?|drugs?|symptoms?|adverse effects?|side effects?|contraindications?|interactions?|pharmacotherapy|prescribing doctor|pharmacist consultation)\b/i;
  return healthIndicators.test(text);
}

export interface SafetyValidationRequest {
  response: string;
  is_medical_content: boolean;
  has_grounding_evidence: boolean;
  is_documented_interaction?: boolean;
}

export interface SafetyValidationResult {
  status: "passed" | "needs_fallback" | "blocked";
  response: string;
  findings: string[];
}

const UNSAFE_DIAGNOSIS_PATTERNS = [
  /\byou (?:definitely|certainly|likely|probably)?\s*(?:have|suffer from|are suffering from)\s+(?:malaria|typhoid|cancer|diabetes|hypertension|ulcers?|covid|infections?|pneumonia|asthma|depression|anxiety|hiv|hepatitis|appendicitis|migraine|arthritis|tuberculosis)\b/i,
  /\b(?:this|the test|your results?)\s+confirms?\s+(?:that\s+)?you have\b/i,
  /\b(?:based on (?:your|these) symptoms,? you have)\b/i,
  /\b(?:my|the)\s+clinical diagnosis is\b/i,
  /\bi (?:would)?\s*diagnose you with\b/i,
  /\byou are (?:definitely|formally)?\s*diagnosed with\b/i,
  /\bdiagnosis:\s*[a-zA-Z]/i
];

export const META_PROMPT_LEAK_PATTERNS = [
  /\bcited (?:interaction )?database\b/i,
  /\bDDInter(?:'s)? (?:2\.0 )?(?:dataset|database|data|records?|materials?)\b/i,
  /\bthe cited (?:source|database|interaction)\b/i,
  /\bbased on general medical knowledge rather than\b/i,
  /\bnot (?:provided|sourced|included|found) (?:in|from|by) (?:the )?(?:DDInter|dataset|database|source|cited source)\b/i,
  /\busing (?:your|my|our) (?:own )?medical knowledge\b/i,
  /\bgeneral guidance,? not sourced from\b/i,
  /\bfrom the cited (?:interaction )?database\b/i,
  /\bexplain the likely clinical mechanism\b/i,
  /\bDDInter 2\.0\b/i,
  /\bnot sourced from the cited\b/i,
  /\b(?:current\s+)?(?:data|dataset|database|records?)\s+classif(?:ies|ied)\b/i,
  /\bclassif(?:ies|ied)\s+(?:the\s+)?(?:potential\s+)?interaction\s+as\s+unknown\b/i,
  /\bseverity\s+(?:level\s+)?is\s+unknown\b/i,
  /\bunspecified\s+in\s+(?:our\s+)?source\s+data\b/i,
  /\bunclassified\s+in\s+(?:our\s+)?source\s+data\b/i,
  /\bthe interaction database\b/i,
  /\binteraction database cited\b/i,
  /\bdatabase records\b/i,
  /\bdatabase cited\b/i,
  /\bcited database\b/i,
  /\bthe database\b/i
];

export const FALSE_REASSURANCE_PATTERNS = [
  /\b(?:generally|considered|is|are|deemed)\s+(?:safe|fine|harmless|risk-free)\s+to\s+(?:take|combine|use|co-administer)\b/i,
  /\bmeaning\s+(?:they\s+are|you\s+can)\s+(?:generally\s+)?(?:safe|fine|okay|take|use|combine)\b/i,
  /\b(?:take|use|combine|mix)\s+(?:them|both)?\s*(?:together\s+)?safely\b/i,
  /\bno\s+(?:need\s+to\s+worry|reason\s+to\s+avoid|adverse\s+interaction|potential\s+risk|known\s+harmful\s+interaction|known\s+interaction)\b/i,
  /\bdo\s+not\s+(?:interfere\s+with|interact\s+with|affect)\s+each\s+other\b/i,
  /\bthere\s+is\s+no\s+(?:interaction|risk|danger|known\s+harmful)\b/i,
  /\bsafe\s+combination\b/i,
  /\bwithout\s+(?:major\s+)?(?:concern|risk|worry)\b/i,
  /\b(?:generally|typically|usually|normally|mostly)?\s*(?:considered\s+)?safe to take together\b/i,
  /\b(?:are|is)\s+(?:generally|typically|usually|normally|mostly)?\s*safe together\b/i,
  /\b(?:is|are)\s+(?:generally\s+)?safe to (?:combine|use together|mix)\b/i,
  /\b(?:safe|fine|okay|ok)\s+to (?:take|use|combine)\s+(?:them\s+)?together\b/i,
  /\bcommonly taken together without (?:issue|problems?|complications?|concerns?)\b/i,
  /\bdoes not interfere with your\b/i,
  /\bno (?:known\s+)?(?:harmful\s+)?interaction\s+(?:between|exists)\b/i,
  /\bno (?:reason|need) for concern\b/i,
  /\bcan be taken together safely\b/i,
  /\bmeaning they are generally considered safe\b/i
];

export function detectMetaPromptLeak(text: string): { leaked: boolean; matchedPattern?: string; matchedText?: string } {
  for (const pattern of META_PROMPT_LEAK_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { leaked: true, matchedPattern: pattern.source, matchedText: match[0] };
    }
  }
  return { leaked: false };
}

export function detectFalseReassurance(text: string): { hasFalseReassurance: boolean; matchedPattern?: string; matchedText?: string } {
  for (const pattern of FALSE_REASSURANCE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { hasFalseReassurance: true, matchedPattern: pattern.source, matchedText: match[0] };
    }
  }
  return { hasFalseReassurance: false };
}

export class SafetyValidator {
  private readonly config: AiRuntimeConfig;

  constructor(config: AiRuntimeConfig) {
    this.config = config;
  }

  validate(request: SafetyValidationRequest): SafetyValidationResult {
    const findings: string[] = [];
    let status: "passed" | "needs_fallback" | "blocked" = "passed";

    if (UNSAFE_DIAGNOSIS_PATTERNS.some((pattern) => pattern.test(request.response))) {
      findings.push("response appears to diagnose or make an authoritative clinical diagnosis");
      status = "blocked";
    } else if (request.is_medical_content && !request.has_grounding_evidence) {
      findings.push("missing approved medical grounding evidence");
      status = "needs_fallback";
    }

    const leak = detectMetaPromptLeak(request.response);
    if (leak.leaked) {
      findings.push(`meta-prompt leak detected in response: '${leak.matchedText}' matching pattern /${leak.matchedPattern}/`);
    }

    if (request.is_documented_interaction) {
      const reassurance = detectFalseReassurance(request.response);
      if (reassurance.hasFalseReassurance) {
        findings.push(
          `unwarranted false reassurance detected for documented interaction: '${reassurance.matchedText}' matching pattern /${reassurance.matchedPattern}/`
        );
        status = "blocked";
      }
    }

    const disclaimerText = this.config.safety.disclaimer_text || "Disclaimer; Educational only. Not medical advice.";
    const hasMedicalContent = Boolean(request.is_medical_content || containsMedicalContent(request.response));
    const disclaimerRequired = hasMedicalContent;

    let finalResponse = request.response;
    if (disclaimerRequired && !hasRequiredDisclaimer(finalResponse, disclaimerText)) {
      finalResponse = appendDisclaimer(finalResponse, disclaimerText);
      if (status === "passed") {
        status = "needs_fallback";
      }
    }

    return {
      status,
      response: finalResponse,
      findings
    };
  }

  fallbackResponse(): string {
    const disclaimer = this.config.safety.disclaimer_text || "Disclaimer; Educational only. Not medical advice.";
    return `I do not have enough approved medical information to answer that safely.\n\n${disclaimer}`;
  }

  assertPassed(result: SafetyValidationResult): void {
    if (result.status === "blocked") {
      throw new AiServiceError("SAFETY_VALIDATION_FAILED", "Safety validation blocked the response.", false, {
        findings: result.findings
      });
    }
  }
}
