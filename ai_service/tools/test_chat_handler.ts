import { ChatHandler } from "../api/handlers/chat.ts";

async function run() {
  const handler = new ChatHandler();

  const queries = [
    "what are you thinking about",
    "i need access to consult a pharmacists",
    "pharmacist consultation"
  ];

  for (const q of queries) {
    console.log(`\n========================================`);
    console.log(`User: ${q}`);
    const res = await handler.process({
      userId: "test-user-live-3",
      conversationId: "conv-live-3",
      message: q
    });

    console.log(`AI: ${res.message}`);
    console.log(`[Intent: ${res.intent} | Urgency: ${res.urgency} | Pharmacist Consultation Required: ${res.pharmacistConsultationRequired}]`);
  }
}

run().catch(console.error);
