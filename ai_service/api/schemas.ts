export interface BackendChatRequest {
  userId: string;
  conversationId: string;
  message: string;
  language?: string;
  messageType?: string;
  context?: unknown;
}

export type UrgencyLevel = "low" | "medium" | "high" | "emergency";

export interface ReminderPayload {
  reminderTimeISO: string;
  reminderText: string;
}

export interface BackendChatResponse {
  message: string;
  intent: string;
  urgency: UrgencyLevel;
  pharmacistConsultationRequired: boolean;
  reminder: ReminderPayload | null;
}

export function validateBackendRequest(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return ["request must be a JSON object"];
  const req = value as Record<string, unknown>;
  if (typeof req.userId !== "string" || req.userId.trim().length === 0) errors.push("userId must be a non-empty string");
  if (typeof req.conversationId !== "string" || req.conversationId.trim().length === 0) errors.push("conversationId must be a non-empty string");
  if (typeof req.message !== "string" || req.message.trim().length === 0) errors.push("message must be a non-empty string");
  return errors;
}

export function validateBackendResponse(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return ["response must be a JSON object"];
  const res = value as Record<string, unknown>;
  if (typeof res.message !== "string" || (res.message as string).trim().length === 0) {
    errors.push("message must be a non-empty string");
  }
  if (typeof res.intent !== "string" || (res.intent as string).trim().length === 0) {
    errors.push("intent must be a non-empty string");
  }
  const validUrgencies: UrgencyLevel[] = ["low", "medium", "high", "emergency"];
  if (typeof res.urgency !== "string" || !validUrgencies.includes(res.urgency as UrgencyLevel)) {
    errors.push(`urgency must be one of: ${validUrgencies.join(", ")}`);
  }
  if (typeof res.pharmacistConsultationRequired !== "boolean") {
    errors.push("pharmacistConsultationRequired must be a boolean");
  }
  // reminder must be null or an object with reminderTimeISO (string) and reminderText (string)
  if (res.reminder !== null && res.reminder !== undefined) {
    if (typeof res.reminder !== "object") {
      errors.push("reminder must be null or an object with reminderTimeISO and reminderText");
    } else {
      const r = res.reminder as Record<string, unknown>;
      if (typeof r.reminderTimeISO !== "string" || r.reminderTimeISO.trim().length === 0) {
        errors.push("reminder.reminderTimeISO must be a non-empty string");
      }
      if (typeof r.reminderText !== "string" || r.reminderText.trim().length === 0) {
        errors.push("reminder.reminderText must be a non-empty string");
      }
    }
  }
  return errors;
}

