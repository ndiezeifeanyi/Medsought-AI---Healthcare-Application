import { ChatHandler } from "../api/handlers/chat.ts";

async function main() {
  const handler = new ChatHandler();

  const conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];

  const testQueries = [
    "is it okay to take vitamin c with augmentin or paracetamol",
    "ciprofloxacin and lumenfatrine together advisable",
    "ciprofloxacin and lumefantrine together advisable",
    "my blood pressure is at 200",
    "i need pharmacy consultation",
    "my drugs just finished, i need to speak with a pharmacist to know the next drug to take",
    "i forgot my drug dosage, i need a pharmacist to tell me how to take the doasge",
    "how should i take my malaria drug",
    "My BP is back to normal",
    "2+2",
    "ciprofloxacin"
  ];

  console.log("=== RUNNING MULTI-TURN CONVERSATION VERIFICATION ===");

  for (const q of testQueries) {
    console.log(`\n======================================================`);
    console.log(`USER: "${q}"`);

    const result = await handler.process({
      userId: "test-user-1",
      conversationId: "conv-live-1",
      message: q
    });

    console.log(`AI: ${result.message}`);
    console.log(`[Intent: ${result.intent} | Urgency: ${result.urgency} | Pharmacist Required: ${result.pharmacistConsultationRequired}]`);

    conversationHistory.push({ role: "user", content: q });
    conversationHistory.push({ role: "assistant", content: result.message });
  }
}

main().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
