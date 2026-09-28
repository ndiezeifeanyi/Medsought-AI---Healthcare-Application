import type { AiRuntimeConfig } from "../configuration/config.ts";
import { AiServiceError } from "../errors/ai-error.ts";
import type { DrugInformationProvider } from "../knowledge/drug-information-provider.ts";
import { createLogger, type Logger } from "../logging/logger.ts";
import { DrugInformationService } from "../medical/drug-information-service.ts";
import { DrugInteractionService } from "../medical/drug-interaction-service.ts";
import { SafetyValidator, detectFalseReassurance, containsMedicalContent } from "../safety/validator.ts";
import { DrugInteractionSemanticGuardrail } from "../safety/semantic-guardrail.ts";
import {
  type AiServiceRequest,
  type AiServiceResponse,
  validateAiServiceRequest
} from "../schemas/contracts.ts";
import { classifyIntentFallback } from "./intent.ts";
import type { Translator } from "../translation/translator.ts";
import { interpretReminderResponseFallback, parseReminderScheduleRequest } from "../reminders/conversation-handler.ts";
import type { LlmProvider } from "../llm/interface.ts";
import { PromptRegistry } from "../prompts/prompt-registry.ts";
import { RagPipeline, type RagObservability } from "../knowledge/rag/rag-pipeline.ts";

export interface ConversationProcessorDependencies {
  config: AiRuntimeConfig;
  logger?: Logger;
  drugInformationProvider?: DrugInformationProvider;
  translator?: Translator;
  llmProvider?: LlmProvider;
  ragPipeline?: RagPipeline;
}

const EMERGENCY_SYMPTOM_PATTERNS = [
  /\bchest pain\b/i,
  /\bshortness of breath\b/i,
  /\bdifficulty breathing\b/i,
  /\bcannot breathe\b/i,
  /\bcan'?t breathe\b/i,
  /\bsevere allergic reaction\b/i,
  /\banaphylaxis\b/i,
  /\bbleeding severely\b/i,
  /\bsevere bleeding\b/i,
  /\bprofuse bleeding\b/i,
  /\bbleeding profusely\b/i,
  /\binternal bleeding\b/i,
  /\bbleeding internally\b/i,
  /\bheavy bleeding\b/i,
  /\bcoughing blood\b/i,
  /\bvomiting blood\b/i,
  /\bblood in stool\b/i,
  /\bblood in urine\b/i,
  /\bseizure\b/i,
  /\boverdose\b/i,
  /\bunconscious\b/i,
  /\bloss of consciousness\b/i,
  /\bpassed out\b/i,
  /\bpoisoning\b/i,
  /\bsuicide\b/i,
  /\bsuicidal\b/i,
  /\bstroke\b/i,
  /\bheart attack\b/i
];

/**
 * Extracts the conversational subject from the USER'S OWN message via reliable
 * structural query patterns ("about X", "what is X", "tell me about X" …).
 *
 * Constraints enforced:
 * - Examines ONLY the current user message — never the assistant's response.
 * - Uses explicit structural patterns, NOT capitalized-word heuristics.
 * - Returns null when no reliable subject can be identified; never invents one.
 * - Rejects pronouns and stop-words as candidate first words.
 */
export function extractSubjectFromUserMessage(message: string): string | null {
  const STOP_FIRST_WORDS = new Set([
    "it", "its", "this", "that", "they", "them", "these", "those",
    "he", "she", "we", "you", "me", "i", "a", "an", "the",
    "what", "how", "when", "where", "why", "which", "who",
    "my", "your", "his", "her", "their", "our"
  ]);

  // Noun phrase: 1–3 words starting with a letter
  const NP = "([A-Za-z][A-Za-z0-9-]*(?:\\s+[A-Za-z][A-Za-z0-9-]*){0,2})";

  const patterns: RegExp[] = [
    // "tell me about X" / "tell me more about X" / "know about X" / "information about X"
    new RegExp(`\\b(?:tell me (?:more )?about|know about|inform me about|information (?:on|about)|details (?:on|about))\\s+${NP}`, "i"),
    // "what is X" / "what are X"
    new RegExp(`\\bwhat\\s+(?:is|are)\\s+${NP}\\b`, "i"),
    // "what about X" / "how about X"
    new RegExp(`\\b(?:what|how)\\s+about\\s+${NP}\\b`, "i"),
    // "do you know about X"
    new RegExp(`\\bdo\\s+you\\s+know\\s+about\\s+${NP}\\b`, "i"),
    // Bare "about X" or "regarding X" — anchored to end/punctuation to avoid
    // over-matching mid-sentence clauses ("about what I should do if …")
    new RegExp(`\\b(?:about|regarding)\\s+${NP}(?=\\s*[?.!,]|\\s*$)`, "i")
  ];

  for (const pat of patterns) {
    const m = message.match(pat);
    if (m && m[1]) {
      const candidate = m[1].trim();
      const firstWord = candidate.split(/\s+/)[0].toLowerCase();
      if (candidate.length >= 3 && !STOP_FIRST_WORDS.has(firstWord)) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Determines whether the active conversational subject from the PREVIOUS turn
 * should be carried into the CURRENT turn's prompt.
 *
 * The subject is carried ONLY when the user's message genuinely continues the
 * previous thread — detected via anaphoric pronoun references ("it", "its",
 * "this", "that", "the medicine", etc.).
 *
 * Hard-blocked intents (greeting, emergency, cancel_or_modify_reminder,
 * reminder_delivery) never carry a subject: they are clearly off-topic and
 * injecting the old subject would corrupt the response.
 *
 * For all other intents, the carry-forward is gated on the presence of an
 * anaphoric reference in the message.  Without such a reference, the user is
 * asking a new question and should not inherit the previous subject.
 *
 * This prevents patterns like:
 *   "Tell me about Eva soap." → "Hi buddy."  → LLM mentions Eva soap  ❌
 *   "Tell me about Eva soap." → "What are your limitations?"  → LLM mentions Eva soap  ❌
 */
export function shouldCarrySubject(
  intent: string,
  message: string,
  contextSubject: string | null
): boolean {
  if (!contextSubject) return false;

  // These intents are definitively off-topic — never carry.
  if (
    intent === "greeting" ||
    intent === "emergency" ||
    intent === "cancel_or_modify_reminder" ||
    intent === "reminder_delivery"
  ) {
    return false;
  }

  // For every other intent (drug_information, side_effects, general_inquiry,
  // symptom_report, pharmacist_consultation, medicine_search, …), carry the
  // subject only when an anaphoric pronoun or noun-reference is present.
  // This covers: "How does IT work?", "What are ITS side effects?",
  // "Tell me more about THIS", "How long does THE MEDICINE take?", etc.
  return /\b(?:it|its|this|that|they|them|these|those|the\s+(?:medicine|drug|soap|product|supplement|medication|cleanser|cream|tablet|pill|treatment|course|dosage))\b/i.test(
    message
  );
}

export function sanitizeUserFacingMessage(text: string): string {
  if (!text) return "";
  let clean = text.trim();

  // 1. Strip <thought>...</thought> blocks if present
  clean = clean.replace(/<thought>[\s\S]*?<\/thought>/gi, "").trim();

  // 2. Extract explicit quoted response or response header if present
  const responseHeaderMatch = clean.match(/^(?:\s*\*?(?:Final Polish|Final Draft|Revised Draft|Final version|Final response|Revised Response|Final answer|Refined Answer|Response structure|Direct Conversational Reply|Conversational Reply)\*?:?\s*)(?:["“]([\s\S]+?)["”]|([^\n]+(?:\n[^\n]+)?))/im);
  if (responseHeaderMatch) {
    const captured = (responseHeaderMatch[1] || responseHeaderMatch[2] || "").trim();
    if (captured.length >= 20 && !/^(?:Rule|Draft|Sentence|Check|Constraint|Role|Persona)/i.test(captured)) {
      clean = captured;
    }
  }

  // 3. Sentence-level and line-level meta-reasoning filter
  const metaPatterns = [
    /^\s*\*?\s*(?:User(?:'s)?\s+(?:Question|Input|problem|says|asks|wants|needs|stated|mentioned|inquired)|Context(?:\s+Provided)?:?|Goal:?|Constraints?:?|Role:?|Persona:?|Length:?|Format:?|No\s+internal|Output\s+ONLY|End\s+with|Content:?|Spelling\s+check:?|Address\s+|Combine\s+into)/i,
    /^\s*\*?\s*(?:Constraint\s+Check|Safety\s+Check|Safety\s+Protocol|Required\s+Action|Direct\s+answer|Disclaimer:?|No\s+markdown|No\s+asterisk|No\s+internal\s+monologue)/i,
    /^\s*\*?\s*(?:The\s+provided\s+RAG|However,\s+as\s+an\s+AI|Actually,\s+the\s+prompt|Standard\s+medical\s+knowledge:|Since\s+the\s+RAG|Standard\s+medical\s+advice|Decision:|Check\s+against\s+constraints)/i,
    /^\s*\*?\s*(?:Wait,\s*let|Wait,\s*I|Wait,\s*looking|Sentence\s*\d+|Draft\s*\d+|Rule\s*\d+|Refining|Reference\s+provided|Self-Correction|Construction:)/i,
    /^\s*\*?\s*(?:Let's\s+stick|Let's\s+try|Actually,\s*I'll|Actually,\s*I|I\s+will\s+provide|I\s+should\s+check|Check\s+length|Final\s+check|I\s+should\s+respond|The\s+user\s+is\s+greeting|I\s+cannot\s+book|Suggest\s+calling|stick\s+to\s+the\s+core)/i,
    /^\s*[\*\-•]\s+(?:Rule\s*\d+|Constraint|Check|Draft|Self-Correction|Confidence\s+Score|Sentence\s*\d+|\d+-\d+\s+sentences|Direct\s+answer|No\s+markdown|Disclaimer\s+included)\b/i,
    /^(?:The\s+)?user\s+(?:is|wants|needs|asked|stated|mentioned|inquired|said|greeting)\b/i,
    /^I\s+(?:should|cannot|can't|must|need to|will|am going to|have to|suggest|stick to)\b/i,
    /^Suggest\s+(?:calling|checking|asking|advising|directing)\b/i,
    /^(?:This|The)\s+(?:query|prompt|question|message|input|response|model|assistant|bot)\s+(?:is|asks|requires|needs)\b/i,
    /^(?:Direct|Keep|Make sure|Check|Ensure)\s+(?:the\s+)?(?:answer|response|reply|length)\b/i,
    /^My\s+(?:role|task|goal|objective)\s+is\b/i,
    /^Since\s+(?:the\s+)?(?:user|patient|query|RAG|context)\b/i,
    /(?:isn't|is not)\s+medication advice/i,
    /\?\s+(?:Yes|No|N\/A|Done)\b/i,
    /(?:route\s+since|because\s+this|route\s+because)\s*$/i
  ];

  // Break text into sentences across all lines
  const sentences = clean.split(/(?<=[.!?])\s+|\r?\n/).map(s => s.trim()).filter(Boolean);
  const validSentences: string[] = [];

  for (const rawSentence of sentences) {
    let s = rawSentence.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/^[\*•\-]\s*/, "").trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1).trim();
    }

    // Skip disclaimer fragments during body collection
    if (/^\s*Disclaimer;?/i.test(s)) continue;
    if (/^\s*Educational only\.?/i.test(s)) continue;
    if (/^\s*Not medical advice\.?/i.test(s)) continue;

    // Check if sentence matches any meta-thought pattern
    const isMeta = metaPatterns.some((pat) => pat.test(rawSentence) || pat.test(s));
    if (isMeta) continue;

    if (s.length > 0) {
      validSentences.push(s);
    }
  }

  let result = validSentences.join(" ").trim();

  // 4. Strip duplicate quoted draft if immediately followed by unquoted text
  result = result.replace(/^"[^"]+"\s*(?=[A-Z])/g, "").trim();

  // 5. Strip any leftover asterisks and quote wraps
  result = result.replace(/\*+/g, "").replace(/^["']+/g, "").replace(/["']+$/g, "").trim();

  // 6. Deduplicate repeated consecutive sentences
  const finalSentences = result.split(/(?<=[.!?])\s+/);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const s of finalSentences) {
    const norm = s.trim().toLowerCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      unique.push(s.trim());
    }
  }
  result = unique.join(" ").trim();

  // 7. Strip leading disclaimer fragments
  result = result.replace(/^\s*(?:Disclaimer;?|Educational only\.?|Not medical advice\.?)+\s*/gi, "").trim();
  // Strip trailing disclaimer fragments
  result = result.replace(/(?:\s*\b(?:Disclaimer;?|Educational only\.?|Not medical advice\.?)\s*)+$/gi, "").trim();

  // 8. If empty or cut-off after filtering, fallback to safe professional advisory guidance
  if (!result || result.length < 15) {
    result = "Hello! I am MedSought AI. I am here to help answer your medication, pharmacy services, and health-related questions. Please let me know how I can assist you!";
  }

  return result;
}

export function isSubstantiveMonograph(text?: string | null): boolean {
  if (!text || typeof text !== "string" || text.trim().length === 0) return false;

  // If text is already RAG or DDInter interactions, it is substantive
  if (/^Medical Knowledge \(RAG\):/i.test(text) || /^Clinical Guidance/i.test(text) || /^Drug Interaction Information/i.test(text)) {
    return true;
  }

  // Check for presence of RxNorm synthetic stub boilerplate:
  const hasSyntheticOverview = /Canonical name:[^.\n]+(?:\.\s*Synonyms:[^.\n]+)?(?:\.\s*Term type:[^.\n]+)?|Active pharmaceutical ingredient:[^.\n]+/i.test(text);
  const hasSyntheticUses = /(?:Usage|Uses):\s*Informational details for/i.test(text);
  const hasSyntheticPrecautions = /(?:Precautions(?:\/Side Effects)?|Side effects|Contraindications|Pregnancy warnings|Dosage information):\s*Standard medical precautions for/i.test(text);
  const hasSyntheticStorage = /Storage:\s*Standard storage for [^:\n]+:\s*Keep in a cool, dry place/i.test(text);

  // If the text contains synthetic stub phrases, check if there is any substantive clinical text beyond the synthetic lines
  if (hasSyntheticUses || hasSyntheticOverview || hasSyntheticPrecautions || hasSyntheticStorage || /(?:Official RxNorm Data for|Drug Information for)/i.test(text)) {
    // Strip out all known synthetic boilerplate lines:
    const stripped = text
      .replace(/Official RxNorm Data for[^\n]*/gi, "")
      .replace(/Drug Information for[^\n]*/gi, "")
      .replace(/(?:- )?Details:\s*(?:Canonical name:[^.\n]+(?:\.\s*Synonyms:[^.\n]+)?(?:\.\s*Term type:[^.\n]+)?|Active pharmaceutical ingredient:[^.\n]+)\.?/gi, "")
      .replace(/(?:Overview|Details):\s*(?:Canonical name:[^.\n]+(?:\.\s*Synonyms:[^.\n]+)?(?:\.\s*Term type:[^.\n]+)?|Active pharmaceutical ingredient:[^.\n]+)\.?/gi, "")
      .replace(/(?:- )?(?:Usage|Uses):\s*Informational details for[^\n.]*\.?/gi, "")
      .replace(/(?:- )?(?:Precautions(?:\/Side Effects)?|Side effects|Contraindications|Pregnancy warnings|Dosage information):\s*Standard medical precautions for[^\n.]*\.?/gi, "")
      .replace(/(?:- )?Storage:\s*Standard storage for [^:\n]+:\s*Keep in a cool, dry place\.?/gi, "")
      .replace(/Consult a healthcare professional\.?/gi, "")
      .replace(/Disclaimer;?[^\n]*/gi, "")
      .replace(/Educational only\.?[^\n]*/gi, "")
      .replace(/Not medical advice\.?[^\n]*/gi, "")
      .trim();

    // If after stripping synthetic boilerplate there is less than 30 characters of real text, it is a thin stub
    if (stripped.length < 30) {
      return false;
    }
  }

  return true;
}

export class ConversationProcessor {
  private readonly config: AiRuntimeConfig;
  private readonly logger: Logger;
  private readonly safety: SafetyValidator;
  private readonly drugInformationService?: DrugInformationService;
  private readonly drugInteractionService?: DrugInteractionService;
  private readonly drugInformationProvider?: DrugInformationProvider;
  private readonly translator?: Translator;
  private readonly llmProvider?: LlmProvider;
  private readonly promptRegistry?: PromptRegistry;
  private readonly ragPipeline?: RagPipeline;
  private readonly semanticGuardrail?: DrugInteractionSemanticGuardrail;

  constructor(dependencies: ConversationProcessorDependencies) {
    this.config = dependencies.config;
    this.logger = dependencies.logger ?? createLogger("info");
    this.safety = new SafetyValidator(dependencies.config);
    this.drugInformationProvider = dependencies.drugInformationProvider;
    this.drugInformationService = dependencies.drugInformationProvider
      ? new DrugInformationService(dependencies.config, dependencies.drugInformationProvider)
      : undefined;
    this.drugInteractionService = dependencies.drugInformationProvider
      ? new DrugInteractionService(dependencies.config, dependencies.drugInformationProvider)
      : undefined;
    this.translator = dependencies.translator;
    this.llmProvider = dependencies.llmProvider;
    this.semanticGuardrail = dependencies.llmProvider
      ? new DrugInteractionSemanticGuardrail(dependencies.llmProvider, this.logger)
      : undefined;
    this.ragPipeline = dependencies.ragPipeline;
    try {
      this.promptRegistry = new PromptRegistry(dependencies.config.prompt_dir);
    } catch {
      this.promptRegistry = undefined;
    }
  }

  async process(request: AiServiceRequest): Promise<AiServiceResponse> {
    const validationErrors = validateAiServiceRequest(request);
    if (validationErrors.length > 0) {
      throw new AiServiceError("MALFORMED_INPUT", "AI request validation failed.", false, {
        validation_errors: validationErrors
      });
    }

    let processingMessage = request.message;
    let initialClassification = classifyIntentFallback(request.message);
    let medicines = initialClassification.entities.medicines;

    if (this.translator && request.language !== "en") {
      try {
        const trans = await this.translator.translate({
          text: request.message,
          source_language: request.language,
          target_language: "en",
          protected_terms: medicines
        });
        processingMessage = trans.text;
      } catch (e) {
        this.logger.warn("translation failed; proceeding with original message", { error: String(e) });
      }
    }

    const classification = classifyIntentFallback(processingMessage);
    medicines = classification.entities.medicines.length > 0 ? classification.entities.medicines : medicines;

    this.logger.info("classified request", {
      intent: classification.intent,
      confidence: classification.confidence,
      language: request.language
    });

    let groundedKnowledge: string | null = null;
    let knowledgeSource: string | null = null;
    let resolvedMedicine: string | null = null;
    let ragObservability: RagObservability | null = null;
    let actions: any[] = [];
    let reminderContextNote: string | null = null;
    let isSevereInteraction = false;

    const currentContextMed = request.context?.current_medicine ?? null;
    const isMedIntent = ["drug_information", "drug_interaction", "side_effects", "schedule_reminder", "reminder_response"].includes(classification.intent);
    // activeMedicine: used specifically for drug provider / RAG drug lookups
    const activeMedicine = medicines.length > 0 ? medicines.join(" and ") : (isMedIntent ? currentContextMed : null);

    // ── Active Subject Resolution ───────────────────────────────────────────
    // Determines what the user is currently talking about across turns.
    //
    // Priority (per spec §4):
    //   1. Explicit medicine entity from the current message (most reliable)
    //   2. Subject from the user's own message via structural pattern extraction
    //   3. Active subject carried forward from the previous turn's context
    //
    // Constraints (per user directives):
    //   - Never scan the assistant's response text
    //   - Never use capitalized-word heuristics
    //   - Never invent a subject when no reliable one exists
    const contextActiveSubject: string | null =
      (request.context as any)?.active_subject ?? currentContextMed ?? null;

    // Primary: verified medicine candidate; Secondary: structural extraction from user message only
    const subjectFromMessage: string | null =
      medicines.length > 0
        ? medicines[0]
        : extractSubjectFromUserMessage(processingMessage);

    // Final active subject: new entity from this turn, or carry-forward only when
    // the current message genuinely continues the previous thread (anaphoric reference).
    // shouldCarrySubject() returns false for greetings, emergencies, and any message
    // without a pronoun/noun reference — clearing stale subjects automatically.
    const activeSubject: string | null =
      subjectFromMessage ??
      (shouldCarrySubject(classification.intent, processingMessage, contextActiveSubject)
        ? contextActiveSubject
        : null);

    // Anaphoric detection: pronoun present but no new entity, and a known active subject exists
    const isAnaphoricFollowUp: boolean =
      !subjectFromMessage &&
      !!contextActiveSubject &&
      /\b(?:it|its|this|that|they|them|these|those|the\s+(?:medicine|drug|soap|product|supplement|medication|cleanser|cream|tablet|pill|treatment))\b/i.test(processingMessage);

    if (isAnaphoricFollowUp) {
      this.logger.info("Anaphoric follow-up detected; active subject resolved from context", {
        activeSubject,
        message: processingMessage.slice(0, 80)
      });
    }
    // ───────────────────────────────────────────────────────────────────────

    if (classification.intent === "schedule_reminder") {
      const schedule = parseReminderScheduleRequest(request.message, medicines[0], request.context?.current_medicine);

      actions.push({
        type: "schedule_medication_reminder",
        payload: {
          medicine: schedule.medicine,
          target_time: schedule.target_time,
          relative_delay_minutes: schedule.relative_delay_minutes,
          frequency: schedule.frequency,
          dosage: schedule.dosage,
          notes: schedule.notes
        }
      });

      const timeDesc = schedule.target_time
        ? `at ${schedule.target_time}`
        : schedule.relative_delay_minutes
        ? `in ${schedule.relative_delay_minutes} minutes`
        : "at the specified time";

      const medDesc = schedule.medicine ? schedule.medicine : "your medication";
      const freqDesc = schedule.frequency !== "once" ? ` (${schedule.frequency})` : "";

      reminderContextNote = `[Reminder Action Configured]\nThe user has requested a reminder for ${medDesc} ${timeDesc}${freqDesc}. Confirm this reminder setup warmly, clearly stating the medicine, time, and frequency.`;
    }
    else if (classification.intent === "reminder_response") {
      const interpretation = interpretReminderResponseFallback(request.message);

      actions.push({
        type: "reminder_event",
        payload: {
          event: interpretation.intent,
          medicine: activeMedicine ?? undefined
        }
      });

      reminderContextNote = `[Reminder Status Update]\nUser reported dose status: '${interpretation.intent}' for ${activeMedicine ?? "their medication"}. Provide warm encouragement or safe medical advice accordingly.`;
    }
    else if (classification.intent === "medicine_search") {
      const targetMed = medicines.length > 0 ? medicines[medicines.length - 1] : (activeMedicine ?? "");
      const locMatch = request.message.match(/near me|nearby|in ([A-Za-z0-9 ]{2,20})|at ([A-Za-z0-9 ]{2,20})/i);
      const locHint = locMatch ? (locMatch[1] ?? locMatch[2]) : undefined;
      actions.push({
        type: "medicine_search",
        payload: {
          medicine: targetMed,
          ...(locHint ? { location_hint: locHint.trim() } : {})
        }
      });
    }

    let interactionFacts: any = undefined;

    if (this.drugInformationProvider && isMedIntent && (medicines.length > 0 || activeMedicine)) {
      const targetMeds = medicines.length > 0 ? medicines : [activeMedicine!];
      try {
        if (classification.intent === "drug_interaction" && targetMeds.length >= 2) {
          if (this.drugInteractionService) {
            const interRes = await this.drugInteractionService.answer({
              ai_request: request,
              medicine_candidates: targetMeds
            });
            groundedKnowledge = interRes.response;
            knowledgeSource = interRes.knowledge_source;
            if (/severe|critical|contraindicated|dangerous/i.test(interRes.response)) {
              isSevereInteraction = true;
            }
          } else {
            const inter = await this.drugInformationProvider.getDrugInteractions({
              medicines: targetMeds,
              language: "en"
            });
            // IMPORTANT: Inspect query_status to distinguish "no interactions found"
            // from "provider was unreachable / errored." These must never be collapsed.
            if (inter.query_status === "unreachable") {
              this.logger.warn(
                "Interaction provider was unreachable — falling through to RAG/LLM. " +
                "Do NOT treat this as 'no interactions found'.",
                { medicines: targetMeds, query_status: inter.query_status }
              );
            } else if (inter.query_status === "unconfigured") {
              this.logger.warn(
                "Interaction provider is not configured — falling through to RAG/LLM.",
                { medicines: targetMeds, query_status: inter.query_status }
              );
            } else if (inter.query_status === "not_found") {
              this.logger.info(
                "Interaction provider queried successfully — no interactions found for these drugs.",
                { medicines: targetMeds }
              );
            }
            if (inter.found && inter.summary) {
              groundedKnowledge = `Drug Interaction Information for ${targetMeds.join(" and ")}:\n${inter.summary}`;
              knowledgeSource = inter.citations?.[0]?.source_name ?? "DDInter 2.0";
              if (inter.interactions) {
                interactionFacts = inter.interactions;
              }
              if (/severe|critical|contraindicated|dangerous|major/i.test(inter.summary)) {
                isSevereInteraction = true;
              }
            }
          }
        } else if (["drug_information", "side_effects"].includes(classification.intent)) {
          if (this.drugInformationService) {
            const infoRes = await this.drugInformationService.answer({
              ai_request: request,
              intent: classification.intent as any,
              medicine_candidates: targetMeds
            });
            groundedKnowledge = infoRes.response;
            knowledgeSource = infoRes.knowledge_source;
            resolvedMedicine = infoRes.resolved_medicine;
          } else {
            const info = await this.drugInformationProvider.getDrugInformation({
              medicine_name: targetMeds[0],
              language: "en",
              topics: ["overview", "uses", "side_effects"]
            });
            if (info.found) {
              resolvedMedicine = info.normalized_name ?? info.medicine_name;
              const overview = info.topics.overview ?? "";
              const uses = info.topics.uses ?? "";
              const sideEffects = info.topics.side_effects ?? "";
              groundedKnowledge = `Official RxNorm Data for ${resolvedMedicine}:\n- Details: ${overview}\n- Usage: ${uses}\n- Precautions/Side Effects: ${sideEffects}`;
              knowledgeSource = info.citations?.[0]?.source_name ?? "RxNorm";
            }
          }
        }
      } catch (e: any) {
        if (e instanceof AiServiceError) {
          if (!this.llmProvider) {
            const fallbackResp = this.safety.fallbackResponse();
            return {
              response: fallbackResp,
              intent: classification.intent,
              language: request.language,
              actions,
              safety_status: "blocked",
              metadata: {
                knowledge_source: null,
                confidence: classification.confidence,
                errors: [e.toEnvelope()],
                updated_context: {
                  current_medicine: activeMedicine
                },
                urgency: "high",
                requires_pharmacist_consultation: true
              }
            };
          }
          this.logger.info("Drug provider lookup yielded no approved monograph; proceeding to RAG/LLM", {
            code: e.code,
            message: e.message
          });
        } else {
          this.logger.warn("Drug provider lookup failed or unconfigured", { error: String(e) });
        }
      }
    }

    // RAG retrieval — attempt for medical intents or medical general inquiries when RAG is enabled
    // If upstream provider only returned a thin concept stub (no substantive monograph), RAG still executes
    const hasSubstantiveGrounding = isSubstantiveMonograph(groundedKnowledge);
    const ragRelevantIntents = ["drug_information", "drug_interaction", "side_effects"];
    const isMedicalQuery =
      ragRelevantIntents.includes(classification.intent) ||
      (classification.intent === "general_inquiry" && containsMedicalContent(processingMessage));

    if (this.ragPipeline && this.config.rag.enabled && !hasSubstantiveGrounding) {
      if (isMedicalQuery && (medicines.length > 0 || activeMedicine || containsMedicalContent(processingMessage))) {
        let ragQuery = processingMessage;
        if (medicines.length === 0 && activeMedicine) {
          ragQuery = `${activeMedicine} ${processingMessage}`;
        }
        const ragResult = await this.ragPipeline.buildGroundingContext({
          query: ragQuery,
          language: request.language,
          limit: 5
        });
        ragObservability = ragResult.observability;

        if (ragResult.evidence.length > 0) {
          const ragText = ragResult.evidence
            .map((e) => e.text)
            .join("\n\n");
          if (resolvedMedicine && !ragText.toLowerCase().includes(resolvedMedicine.toLowerCase())) {
            groundedKnowledge = `Normalized Drug Identity: ${resolvedMedicine}\n\nClinical Guidance (Verified Knowledge Base):\n${ragText}`;
          } else {
            groundedKnowledge = `Clinical Guidance (Verified Knowledge Base):\n${ragText}`;
          }
          knowledgeSource = ragResult.source_names.join(", ") || "RAG";
          this.logger.info("RAG context applied (overriding thin stub with verified clinical knowledge)", {
            source_names: ragResult.source_names,
            evidence_count: ragResult.evidence.length,
            normalized_medicine: resolvedMedicine
          });
        }
      }
    }

    // ── RAG Subject-Relevance Guard ─────────────────────────────────────────
    // Constraint: RAG must never replace the active conversational subject with
    // a different product/topic merely because another document matches the
    // query wording.  If the retrieved evidence does not mention the active
    // subject, discard it so the LLM falls back with the conversation context
    // intact rather than being steered toward an irrelevant product.
    if (groundedKnowledge && activeSubject && (knowledgeSource?.includes("RAG") || knowledgeSource?.includes("local_docs"))) {
      const subjectTokens = activeSubject
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const ragLower = groundedKnowledge.toLowerCase();
      // Evidence is considered on-topic if at least one significant token of
      // the active subject appears in the RAG text.
      const ragMentionsSubject =
        subjectTokens.length === 0 ||
        subjectTokens.some((token) => ragLower.includes(token));
      if (!ragMentionsSubject) {
        this.logger.info(
          "RAG evidence discarded: does not mention active subject; preserving active subject for LLM",
          { activeSubject, discardedSource: knowledgeSource }
        );
        groundedKnowledge = null;
        knowledgeSource = null;
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    // If non-LLM runtime has direct approved medical knowledge from provider, return immediately
    if (!this.llmProvider && groundedKnowledge && knowledgeSource && !knowledgeSource.includes("RAG")) {
      return {
        response: groundedKnowledge,
        intent: classification.intent,
        language: request.language,
        actions,
        safety_status: "passed",
        metadata: {
          knowledge_source: knowledgeSource,
          confidence: classification.confidence,
          errors: [],
          updated_context: {
            current_medicine: activeMedicine
          },
          urgency: isSevereInteraction ? "high" : "medium",
          requires_pharmacist_consultation: true
        }
      };
    }

    const bpMatch = request.message.match(/\b(?:blood pressure|bp)\s*(?:is\s*(?:at\s*)?)?(?:over\s*|above\s*)?([1-2]\d{2})\b/i);
    const isHighBpCrisis = bpMatch && parseInt(bpMatch[1], 10) >= 180;
    const isEmergency = isHighBpCrisis || EMERGENCY_SYMPTOM_PATTERNS.some((pattern) => pattern.test(request.message));

    if (isEmergency) {
      const emergencyAdvice = isHighBpCrisis
        ? `Please contact emergency services (911) or go to the nearest emergency room immediately. A blood pressure reading of ${bpMatch ? bpMatch[1] : "180 or higher"} is considered a hypertensive crisis and requires urgent medical attention.`
        : "This appears to be a medical emergency. Please contact emergency services (911) or go to the nearest emergency room immediately.";

      return {
        response: emergencyAdvice,
        intent: "emergency",
        language: request.language,
        actions,
        safety_status: "passed",
        metadata: {
          knowledge_source: "EmergencySafetyProtocol",
          confidence: 0.99,
          errors: [],
          updated_context: {
            current_medicine: activeMedicine
          },
          urgency: "emergency",
          requires_pharmacist_consultation: false
        }
      };
    }

    if (/^\s*(\d+\s*[\+\-\*\/]\s*\d+)\s*=?\s*$/i.test(request.message.trim())) {
      const mathMatch = request.message.trim().match(/^(\d+)\s*([\+\-\*\/])\s*(\d+)/);
      if (mathMatch) {
        const a = parseFloat(mathMatch[1]);
        const op = mathMatch[2];
        const b = parseFloat(mathMatch[3]);
        let res = 0;
        if (op === "+") res = a + b;
        else if (op === "-") res = a - b;
        else if (op === "*") res = a * b;
        else if (op === "/" && b !== 0) res = a / b;
        return {
          response: `${a} ${op} ${b} = ${res}. Please let me know if you have any questions regarding your medications or health.`,
          intent: "general_inquiry",
          language: request.language,
          actions,
          safety_status: "passed",
          metadata: {
            knowledge_source: "DirectEvaluation",
            confidence: 1.0,
            errors: [],
            updated_context: {
              current_medicine: activeMedicine
            },
            urgency: "low",
            requires_pharmacist_consultation: false
          }
        };
      }
    }

    const requestTime: Date = (request as any).request_time instanceof Date
      ? (request as any).request_time
      : new Date();

    const systemPrompt = `You are MedSought AI, an empathetic, concise, and professional medical support assistant. You provide short, direct, and informative summary answers (2 to 4 sentences) to help users with medication information, pharmacy services, and health inquiries. You are not a doctor or pharmacist and do not diagnose conditions or prescribe treatment.

Guidelines:
- Directly answer the user's CURRENT message in 2 to 4 clear, helpful sentences.
- When multiple interacting drug pairs are provided in the grounded context, you MUST explicitly address every distinct drug pair listed (do not omit or skip any pair). For 3 or more medications, you may expand your answer to 3 to 6 concise sentences to ensure all distinct drug pairs are addressed clearly.
- When the user mentions a medication with a minor spelling mistake (such as "lumenfatrine" for lumefantrine), identify the intended drug naturally, address their question clearly, and clarify the correct spelling if helpful.
- For pharmacy consultation requests, explain how to reach their local pharmacy or prescribing doctor directly. Do not repeat past emergency warnings if the user's current message is a routine request or inquiry.
- If the user asks about your internal architecture, technology stack, data storage, databases, retrieval pipelines (such as RAG or in-memory systems), or how you generate responses, provide a neutral, honest non-disclosure (for example: "I am not able to share details about my internal systems, data architecture, or specific backend infrastructure."). Never make specific factual claims asserting that you do or do not use specific databases (such as MongoDB), retrieval systems (such as RAG), or internal pipelines.
- Never cite internal database names (such as DDInter, RxNav, RxNorm, or "the database"), source data status, or internal classification labels in your user-facing message; speak directly to the patient in warm, plain conversational clinical language.
- Never include internal monologue, planning notes, draft labels, or thinking steps.
- Avoid markdown asterisks and bullet clutter.
The current local time is: ${requestTime.toISOString()}.`;

    const userContentParts: string[] = [];

    // ── Structured Context Note (Constraint 2) ──────────────────────────────
    // The original user message is NEVER rewritten.  Instead, the resolved
    // active subject is provided as an explicit structured note before the
    // grounded knowledge and the user's message so the LLM has an unambiguous
    // anchor without altering what the user actually said.
    if (activeSubject) {
      const contextNote = isAnaphoricFollowUp
        ? `[Conversation Context]\nThe active subject of this conversation is: "${activeSubject}". ` +
          `The user's follow-up question refers to ${activeSubject}. ` +
          `Answer about ${activeSubject} unless the user explicitly introduces a different subject.\n`
        : `[Conversation Context]\nActive subject: "${activeSubject}". ` +
          `Maintain this subject in your answer unless the user explicitly changes it.\n`;
      userContentParts.push(contextNote);
    }
    // ───────────────────────────────────────────────────────────────────────

    if (groundedKnowledge) {
      userContentParts.push(`[Grounded Medical Context from Approved Source]\n${groundedKnowledge}\n`);
    }
    if (reminderContextNote) {
      userContentParts.push(`${reminderContextNote}\n`);
    }
    userContentParts.push(processingMessage);

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt }
    ];

    if (request.context?.recent_messages && Array.isArray(request.context.recent_messages)) {
      for (const historyMsg of request.context.recent_messages.slice(-6)) {
        // Strip any residual thought/draft formatting from past messages to prevent LLM mimicking
        const cleanContent = sanitizeUserFacingMessage(historyMsg.content);
        if (cleanContent) {
          messages.push({
            role: historyMsg.role === "assistant" ? "assistant" : "user",
            content: cleanContent
          });
        }
      }
    }

    messages.push({ role: "user", content: userContentParts.join("\n") });

    let responseText = "";
    let llmErrorMessage: string | null = null;

    if (this.llmProvider) {
      try {
        const llmResp = await this.llmProvider.generate({
          messages,
          temperature: 0.2,
          max_tokens: 1000
        });
        if (llmResp && llmResp.content && llmResp.content.trim().length > 0) {
          responseText = llmResp.content.trim();
        }
      } catch (e: any) {
        this.logger.warn("Live LLM generation failed", { error: String(e?.message || e) });
        if (String(e?.message || "").includes("429") || String(e?.message || "").includes("RATE_LIMIT")) {
          llmErrorMessage = "Gemini API rate limit reached (HTTP 429). Please wait a few seconds and try your message again.";
        } else {
          llmErrorMessage = `AI generation error: ${String(e?.message || e)}`;
        }
      }
    }

    if (!responseText) {
      if (llmErrorMessage) {
        responseText = llmErrorMessage;
      } else if (groundedKnowledge) {
        responseText = groundedKnowledge + "\n\n*Disclaimer: Educational only. Not medical advice.*";
      } else {
        responseText = "I am MedSought AI. I am here to help answer your questions. Please ask what you need assistance with!";
      }
    }

    responseText = sanitizeUserFacingMessage(responseText);

    // ── Secondary Semantic Guardrail for Drug Interactions (Safety-Critical Path) ──
    const targetInteractingMeds = medicines.length > 0 ? medicines : (activeMedicine ? [activeMedicine] : []);
    if (this.semanticGuardrail && classification.intent === "drug_interaction" && targetInteractingMeds.length >= 2) {
      const severityDesc = isSevereInteraction
        ? "Documented interaction with Major severity"
        : (groundedKnowledge?.includes("unclassified") || groundedKnowledge?.includes("Unknown"))
        ? "Documented interaction with Unclassified/Unknown severity"
        : (groundedKnowledge ? "Documented interaction with Moderate/Minor severity" : "No structured record in DDInter (General Medical Knowledge Fallback)");

      const regexReassurance = detectFalseReassurance(responseText);
      let needsRemediation = regexReassurance.hasFalseReassurance;
      let guardrailReasoning = regexReassurance.hasFalseReassurance ? `Regex matched: ${regexReassurance.matchedText}` : "";

      if (!needsRemediation) {
        const audit = await this.semanticGuardrail.auditResponse({
          medicines: targetInteractingMeds,
          severityStatus: severityDesc,
          draftResponse: responseText
        });
        if (audit.hasFalseReassurance) {
          needsRemediation = true;
          guardrailReasoning = audit.reasoning;
        }
      }

      if (needsRemediation && this.llmProvider) {
        this.logger.warn("Semantic guardrail triggered remediation for drug interaction response", {
          medicines: targetInteractingMeds,
          severityDesc,
          triggerReason: guardrailReasoning,
          initialDraftSnippet: responseText.slice(0, 120)
        });

        // Attempt 1 regeneration with explicit corrective guidance
        try {
          const retryMessages = [
            ...messages,
            { role: "assistant" as const, content: responseText },
            {
              role: "user" as const,
              content: `SAFETY VIOLATION DETECTED: The previous draft inappropriately asserted safety, lack of interaction, or absence of concern (${guardrailReasoning}). Re-generate your response in 2 to 4 sentences. You MUST explain the documented clinical considerations and potential risks without claiming the combination is safe, harmless, or without issue. Emphasize the importance of consulting a healthcare professional.`
            }
          ];
          const retryResp = await this.llmProvider.generate({
            messages: retryMessages,
            temperature: 0.1,
            max_tokens: 1000
          });

          if (retryResp?.content) {
            const candidate = sanitizeUserFacingMessage(retryResp.content.trim());
            const retryRegex = detectFalseReassurance(candidate);
            const retryAudit = !retryRegex.hasFalseReassurance
              ? await this.semanticGuardrail.auditResponse({
                  medicines: targetInteractingMeds,
                  severityStatus: severityDesc,
                  draftResponse: candidate
                })
              : { hasFalseReassurance: true, reasoning: `Regex matched: ${retryRegex.matchedText}`, latencyMs: 0 };

            if (!retryAudit.hasFalseReassurance) {
              this.logger.info("Semantic guardrail remediation retry succeeded", {
                medicines: targetInteractingMeds,
                severityDesc
              });
              responseText = candidate;
            } else {
              this.logger.warn("Semantic guardrail retry also failed; falling back to safe deterministic template", {
                medicines: targetInteractingMeds,
                severityDesc,
                retryReason: retryAudit.reasoning
              });
              responseText = this.semanticGuardrail.generateSafeFallback(targetInteractingMeds, severityDesc);
            }
          } else {
            responseText = this.semanticGuardrail.generateSafeFallback(targetInteractingMeds, severityDesc);
          }
        } catch (e) {
          this.logger.warn("Semantic guardrail regeneration attempt failed; falling back to safe template", { error: String(e) });
          responseText = this.semanticGuardrail.generateSafeFallback(targetInteractingMeds, severityDesc);
        }
      }
    }

    if (this.translator && request.language !== "en") {
      try {
        const back = await this.translator.translate({
          text: responseText,
          source_language: "en",
          target_language: request.language,
          protected_terms: medicines
        });
        responseText = sanitizeUserFacingMessage(back.text);
      } catch (e) {
        this.logger.warn("Response back-translation failed", { error: String(e) });
      }
    }

    const isMedical = !!groundedKnowledge || ["drug_information", "drug_interaction", "side_effects"].includes(classification.intent);
    const safetyResult = this.safety.validate({
      response: responseText,
      is_medical_content: isMedical,
      has_grounding_evidence: !!groundedKnowledge,
      is_documented_interaction: isMedIntent && classification.intent === "drug_interaction" && !!groundedKnowledge
    });

    if (safetyResult.findings.length > 0) {
      this.logger.warn("Safety validation findings for response", { findings: safetyResult.findings });
    }

    // Check if the AI's response text explicitly advises or suggests consulting a pharmacist / clinical provider
    const advisesConsultation =
      /\b(?:consult|contact|speak with|talk to|visit|reach out to|see|check with|ask)\s+(?:your\s+)?(?:local\s+)?(?:pharmacist|pharmacy|prescribing doctor|doctor|healthcare provider|physician|care team|clinic)\b/i.test(responseText) ||
      /\b(?:consultation\s+with\s+(?:a\s+)?pharmacist|pharmacy\s+consultation|pharmacist\s+consultation)\b/i.test(responseText);

    let urgency: "low" | "medium" | "high" | "emergency" = "low";
    let requiresPharmacistConsultation = false;

    if (isEmergency || classification.intent === "emergency") {
      // Emergencies need emergency services, NOT a pharmacist
      urgency = "emergency";
      requiresPharmacistConsultation = false;
    } else if (isSevereInteraction || safetyResult.status === "blocked" || classification.intent === "pharmacist_consultation") {
      urgency = "high";
      requiresPharmacistConsultation = true;
    } else if (["drug_information", "drug_interaction", "side_effects", "symptom_report"].includes(classification.intent) || advisesConsultation) {
      // Personal medication / health questions or response advises professional consultation
      urgency = /immediately|right away|urgent|prompt|crisis|severe/i.test(responseText) ? "high" : "medium";
      requiresPharmacistConsultation = true;
    } else {
      urgency = "low";
      requiresPharmacistConsultation = false;
    }

    // Build reminder payload for schedule_reminder when we have both time and medicine
    let reminderPayload: { reminderTimeISO: string; reminderText: string } | null = null;
    if (classification.intent === "schedule_reminder" && actions.length > 0) {
      const scheduleAction = actions.find((a) => a.type === "schedule_medication_reminder") as any;
      if (scheduleAction) {
        const targetTime: string | undefined = scheduleAction.payload?.target_time;
        const medicine: string | undefined = scheduleAction.payload?.medicine;
        if (targetTime && medicine) {
          // Build ISO timestamp from requestTime + extracted HH:MM
          const [hStr, mStr] = targetTime.split(":");
          const reminderDate = new Date(requestTime);
          reminderDate.setHours(parseInt(hStr, 10), parseInt(mStr ?? "0", 10), 0, 0);
          // If the computed time is in the past, advance to the next day
          if (reminderDate <= requestTime) {
            reminderDate.setDate(reminderDate.getDate() + 1);
          }
          const offsetMs = -reminderDate.getTimezoneOffset() * 60000;
          const sign = offsetMs >= 0 ? "+" : "-";
          const absOffset = Math.abs(offsetMs);
          const offH = String(Math.floor(absOffset / 3600000)).padStart(2, "0");
          const offM = String(Math.floor((absOffset % 3600000) / 60000)).padStart(2, "0");
          const iso = reminderDate.toISOString().replace("Z", `${sign}${offH}:${offM}`);
          const reminderText = `Time to take your ${medicine}!`;
          reminderPayload = { reminderTimeISO: iso, reminderText };
        }
      }
    }

    return {
      response: safetyResult.response,
      intent: classification.intent,
      language: request.language,
      actions,
      safety_status: safetyResult.status,
      metadata: {
        knowledge_source: knowledgeSource,
        confidence: classification.confidence,
        errors: [],
        updated_context: {
          current_medicine: resolvedMedicine ?? (medicines.length > 0 ? medicines[0] : null),
          // Carry the full active subject forward so the next turn can resolve
          // anaphoric follow-ups correctly.  Never set to null if a subject was
          // active; null means "no subject was ever established this turn".
          active_subject: activeSubject
        },
        urgency,
        requires_pharmacist_consultation: requiresPharmacistConsultation,
        reminder: reminderPayload,
        ...(ragObservability ? { rag: ragObservability } : {}),
        ...(interactionFacts ? { interaction_facts: interactionFacts } : {})
      }
    };
  }
}
