export const LANGUAGE_CODES = ["en", "ha", "yo", "ig"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export const MESSAGE_TYPES = ["text"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

/**
 * INTERNAL intents — used by the processor for routing to the right service.
 * These preserve the granularity needed to route drug_information vs drug_interaction vs side_effects.
 */
export const INTENTS = [
  "drug_information",
  "drug_interaction",
  "side_effects",
  "medicine_search",
  "schedule_reminder",
  "reminder_response",
  "cancel_or_modify_reminder",
  "reminder_delivery",
  "greeting",
  "symptom_report",
  "emergency",
  "pharmacist_consultation",
  "general_inquiry",
  "other",
  "unknown"
] as const;
export type Intent = (typeof INTENTS)[number];

/**
 * EXTERNAL intents — the public API taxonomy exposed to the backend team.
 * drug_information / drug_interaction / side_effects all map to "medication_question".
 * medicine_search maps to "general_inquiry".
 * reminder_response / cancel_or_modify_reminder both map to "cancel_or_modify_reminder".
 * unknown maps to "other".
 */
export const EXTERNAL_INTENTS = [
  "greeting",
  "general_inquiry",
  "medication_question",
  "pharmacist_consultation",
  "symptom_report",
  "emergency",
  "schedule_reminder",
  "cancel_or_modify_reminder",
  "reminder_delivery"
] as const;
export type ExternalIntent = (typeof EXTERNAL_INTENTS)[number];

export function toExternalIntent(intent: string): ExternalIntent {
  switch (intent) {
    case "drug_information":
    case "drug_interaction":
    case "side_effects":
      return "medication_question";
    case "medicine_search":
      return "general_inquiry";
    case "reminder_response":
      return "cancel_or_modify_reminder";
    case "greeting":
      return "greeting";
    case "emergency":
      return "emergency";
    case "pharmacist_consultation":
      return "pharmacist_consultation";
    case "symptom_report":
      return "symptom_report";
    case "schedule_reminder":
      return "schedule_reminder";
    case "cancel_or_modify_reminder":
      return "cancel_or_modify_reminder";
    case "reminder_delivery":
      return "reminder_delivery";
    case "general_inquiry":
    case "unknown":
    case "other":
    default:
      return "general_inquiry";
  }
}

export const SAFETY_STATUSES = ["passed", "needs_fallback", "blocked"] as const;
export type SafetyStatus = (typeof SAFETY_STATUSES)[number];

export type AiAction =
  | {
      type: "medicine_search";
      payload: {
        medicine: string;
        location_hint?: string;
      };
    }
  | {
      type: "schedule_medication_reminder";
      payload: {
        medicine?: string;
        target_time?: string;
        relative_delay_minutes?: number;
        frequency?: "once" | "daily" | "twice_daily" | "every_x_hours" | "weekly";
        dosage?: string;
        notes?: string;
      };
    }
  | {
      type: "reminder_event";
      payload: {
        event: "taken" | "missed" | "delay" | "refill" | "unknown" | "unrelated";
        medicine?: string;
        delay_minutes?: number;
      };
    }
  | {
      type: "none";
      payload?: Record<string, never>;
    };

export interface ConversationContext {
  recent_messages?: Array<{
    role: "user" | "assistant";
    content: string;
    language?: LanguageCode;
  }>;
  current_medicine?: string | null;
  /**
   * The active conversational subject — broader than current_medicine.
   * May be a drug, supplement, non-pharmaceutical product, or health topic
   * that the user is currently discussing. Used to resolve anaphoric follow-ups
   * such as "it", "its", "this", "that" to the correct subject.
   * Never invented; only set when reliably extracted from the user's own message
   * or carried forward from the prior turn's confirmed subject.
   */
  active_subject?: string | null;
  current_intent?: Intent | null;
  metadata?: Record<string, unknown>;
}

export interface AiServiceRequest {
  conversation_id: string;
  user_id: string;
  message: string;
  message_type: MessageType;
  language: LanguageCode;
  context?: ConversationContext;
  /** Current local time at the moment the request was received. Used for ISO reminder timestamps. */
  request_time?: Date;
}

export interface AiServiceErrorEnvelope {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface AiServiceResponse {
  response: string;
  intent: Intent;
  language: LanguageCode;
  actions: AiAction[];
  safety_status: SafetyStatus;
  metadata: {
    knowledge_source: string | null;
    confidence: number | null;
    errors: AiServiceErrorEnvelope[];
    updated_context?: ConversationContext | null;
    trace_id?: string;
    urgency?: "low" | "medium" | "high" | "emergency";
    requires_pharmacist_consultation?: boolean;
    reminder?: { reminderTimeISO: string; reminderText: string } | null;
    rag?: unknown;
    interaction_facts?: unknown;
  };
}

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && LANGUAGE_CODES.includes(value as LanguageCode);
}

export function isMessageType(value: unknown): value is MessageType {
  return typeof value === "string" && MESSAGE_TYPES.includes(value as MessageType);
}

export function validateAiServiceRequest(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object") {
    return ["request must be an object"];
  }

  const request = value as Record<string, unknown>;
  for (const field of ["conversation_id", "user_id", "message"]) {
    if (typeof request[field] !== "string" || (request[field] as string).trim().length === 0) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (!isMessageType(request.message_type)) {
    errors.push("message_type must be one of: text");
  }

  if (!isLanguageCode(request.language)) {
    errors.push("language must be one of: en, ha, yo, ig");
  }

  if (request.context !== undefined && (!request.context || typeof request.context !== "object")) {
    errors.push("context must be an object when provided");
  }

  return errors;
}
