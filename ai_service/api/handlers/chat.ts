import { loadConfig } from "../../src/configuration/config.ts";
import { ConversationProcessor } from "../../src/conversation/processor.ts";
import { resolveLlmProvider } from "../../src/llm/factory.ts";
import { resolveDrugInformationProvider } from "../../src/knowledge/factory.ts";
import { resolveRetriever } from "../../src/knowledge/retrieval/retrieval-factory.ts";
import { RagPipeline } from "../../src/knowledge/rag/rag-pipeline.ts";
import { toExternalIntent } from "../../src/conversation/intent.ts";
import {
  type BackendChatRequest,
  type BackendChatResponse,
  type UrgencyLevel,
  validateBackendResponse
} from "../schemas.ts";

export interface ChatHandlerOptions {
  provider?: any;
  provider_llm?: any;
  retriever?: any;
  rag_pipeline?: any;
}

interface StoredConversation {
  userId: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  currentMedicine?: string | null;
  /** Broader active conversational subject (may be a non-drug product/topic). */
  activeSubject?: string | null;
  lastUpdated: number;
}

export class ChatHandler {
  private readonly processor: ConversationProcessor;
  private readonly memoryStore = new Map<string, StoredConversation>();

  /**
   * Compose a memory key that is always scoped to (userId, conversationId).
   * Even if two users happen to share the same conversationId value, their
   * conversation state is stored and retrieved from completely separate slots.
   */
  private memoryKey(userId: string, conversationId: string): string {
    return `${userId}::${conversationId}`;
  }

  constructor(options?: ChatHandlerOptions) {
    const config = loadConfig(process.env);
    const provider = options?.provider ?? resolveDrugInformationProvider(config);
    const llm = options?.provider_llm ?? resolveLlmProvider(config);
    const retriever = options?.retriever ?? resolveRetriever(config);
    const ragPipeline = options?.rag_pipeline ?? new RagPipeline(retriever);
    this.processor = new ConversationProcessor({
      config,
      drugInformationProvider: provider,
      llmProvider: llm,
      ragPipeline
    });
  }

  async process(request: BackendChatRequest): Promise<BackendChatResponse> {
    const requestTime = new Date();

    // Retrieve state keyed by (userId, conversationId) — never by conversationId alone.
    // This ensures User A and User B never share state even if they happen to use the
    // same conversationId value.
    const storeKey = this.memoryKey(request.userId, request.conversationId);
    const stored = this.memoryStore.get(storeKey);

    // stored.userId should always equal request.userId because the key already
    // encodes the userId, but the guard is kept for defensive clarity.
    let recentMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
    let currentMedicine: string | null = null;
    let storedActiveSubject: string | null = null;

    if (stored && stored.userId === request.userId) {
      recentMessages = stored.recentMessages;
      currentMedicine = stored.currentMedicine ?? null;
      storedActiveSubject = stored.activeSubject ?? null;
    }

    // Merge explicit context if the backend supplies it in the request body.
    // active_subject from the backend is accepted but the memory-store value
    // takes precedence when present.
    const reqContext = (request.context as any) ?? {};
    const mergedMessages = reqContext.recent_messages ?? recentMessages;
    const mergedMedicine = reqContext.current_medicine ?? currentMedicine;
    const mergedSubject: string | null = reqContext.active_subject ?? storedActiveSubject;

    const aiReq = {
      conversation_id: request.conversationId,
      user_id: request.userId,
      message: request.message,
      message_type: (request.messageType as any) ?? "text",
      language: (request.language as any) ?? "en",
      context: {
        recent_messages: mergedMessages,
        current_medicine: mergedMedicine,
        active_subject: mergedSubject
      },
      // Pass current time so processor can build ISO reminder timestamps
      request_time: requestTime
    };

    const result = await this.processor.process(aiReq as any);

    // Persist updated state.  Both current_medicine and active_subject are
    // returned by the processor inside metadata.updated_context.
    const newRecentMessages = [
      ...mergedMessages,
      { role: "user" as const, content: request.message },
      { role: "assistant" as const, content: result.response }
    ].slice(-10);

    const updatedMedicine = (result.metadata as any)?.updated_context?.current_medicine ?? mergedMedicine;
    const updatedSubject: string | null =
      (result.metadata as any)?.updated_context?.active_subject ?? mergedSubject;

    this.memoryStore.set(storeKey, {
      userId: request.userId,
      recentMessages: newRecentMessages,
      currentMedicine: updatedMedicine,
      activeSubject: updatedSubject,
      lastUpdated: Date.now()
    });

    const validUrgencies: UrgencyLevel[] = ["low", "medium", "high", "emergency"];
    let urgency: UrgencyLevel = "low";
    const rawUrgency = (result.metadata as any)?.urgency;
    if (typeof rawUrgency === "string" && validUrgencies.includes(rawUrgency as UrgencyLevel)) {
      urgency = rawUrgency as UrgencyLevel;
    } else if (result.safety_status === "blocked") {
      urgency = "high";
    } else if (result.safety_status === "needs_fallback") {
      urgency = "medium";
    }

    const requiresPharmacist =
      typeof (result.metadata as any)?.requires_pharmacist_consultation === "boolean"
        ? (result.metadata as any).requires_pharmacist_consultation
        : result.safety_status !== "passed";

    // Map internal routing intent → public API external intent
    const externalIntent = toExternalIntent(result.intent);

    // Pass reminder field from processor metadata (null if not a schedule_reminder)
    const reminder = (result.metadata as any)?.reminder ?? null;

    const response: BackendChatResponse = {
      message: result.response,
      intent: externalIntent,
      urgency,
      pharmacistConsultationRequired: requiresPharmacist,
      reminder
    };

    const validationErrors = validateBackendResponse(response);
    if (validationErrors.length > 0) {
      throw new Error(`AI response contract validation failed: ${validationErrors.join("; ")}`);
    }

    return response;
  }
}

export default ChatHandler;
