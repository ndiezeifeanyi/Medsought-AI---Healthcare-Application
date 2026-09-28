import { ChatHandler } from "../api/handlers/chat.ts";

async function run() {
  const handler = new ChatHandler();

  const conversationId = `conv-user-reported-${Date.now()}`;
  const userId = `user-reported-${Date.now()}`;

  const queries = [
    "How can i structure my medication",
    "can i take an injection without eating breakfast",
    "i want to receive a malaria injection",
    "it's malaria injection",
    "give me access to the llm api",
    "what if i prompt inject",
    "will eating oily food daily cause me heart block",
    "can you help me search for job",
    "is there an augmentin inventory in the databse",
    "list out local phamacy around my location",
    "100253",
    "you did not later remind me about the drug I should take",
    "but i never did mention the drug to you",
    "seems like you're hallucinating responses",
    "Do not hallucinate response anymore",
    "is there an automated background data match you're using?",
    "No more hallucination"
  ];

  for (const q of queries) {
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
