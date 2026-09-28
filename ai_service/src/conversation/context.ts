import type { ConversationContext } from "../schemas/contracts.ts";

export function resolveCurrentMedicine(context: ConversationContext | undefined): string | null {
  if (!context) return null;
  return context.current_medicine ?? null;
}
