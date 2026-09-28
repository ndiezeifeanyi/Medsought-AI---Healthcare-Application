import { ChatHandler } from "../api/handlers/chat.ts";

async function run() {
  const handler = new ChatHandler();

  const conversationId = `conv-memory-test-${Date.now()}`;
  const userId = `user-memory-test-${Date.now()}`;

  const turns = [
    "hi buddy",
    "how do i mix lumefantrine with ciprofloxacin",
    "so are you saying, it is a bad combination",
    "what are the side effects",
    "what about lonart drugs",
    "my stomach feels bad, like i am purging",
    "thank you"
  ];

  for (const q of turns) {
    console.log(`\n========================================`);
    console.log(`You: ${q}`);
    const res = await handler.process({
      userId,
      conversationId,
      message: q
    });

    console.log(`AI: ${res.message}`);
    console.log(`[Intent: ${res.intent} | Urgency: ${res.urgency} | Pharmacist Consultation Required: ${res.pharmacistConsultationRequired}]`);
  }
}

run().catch(console.error);
