import { ChatHandler } from "../api/handlers/chat.ts";

async function main() {
  const handler = new ChatHandler();
  const userId = `user-cidarcool-${Date.now()}`;
  const conversationId = `conv-cidarcool-${Date.now()}`;

  console.log("=== Motivating Cidarcool Soap Test ===");

  const turn1 = "do you know about cidarcool soap";
  console.log(`\nTurn 1 User: "${turn1}"`);
  const res1 = await handler.process({
    userId,
    conversationId,
    message: turn1
  });
  console.log(`AI: ${res1.message}`);
  console.log(`Metadata: intent=${res1.intent}, urgency=${res1.urgency}, pharmacistConsultationRequired=${res1.pharmacistConsultationRequired}`);

  const turn2 = "how many days or months does it take to work";
  console.log(`\nTurn 2 User: "${turn2}"`);
  const res2 = await handler.process({
    userId,
    conversationId,
    message: turn2
  });
  console.log(`AI: ${res2.message}`);
  console.log(`Metadata: intent=${res2.intent}, urgency=${res2.urgency}, pharmacistConsultationRequired=${res2.pharmacistConsultationRequired}`);

  // Verification checks:
  const msg2 = res2.message.toLowerCase();
  const mentionsAquaGlycolic = msg2.includes("aqua glycolic");
  console.log("\n=== Verifications ===");
  console.log(`Does Turn 2 hallucinate/switch to Aqua Glycolic Cleanser? ${mentionsAquaGlycolic ? "FAIL (Yes)" : "PASS (No)"}`);
  const mentionsCidarcoolOrSoapOrCleanser = msg2.includes("cidarcool") || msg2.includes("soap") || msg2.includes("work") || msg2.includes("cleanser") || msg2.includes("product") || msg2.includes("skin");
  console.log(`Does Turn 2 address the topic in context? ${mentionsCidarcoolOrSoapOrCleanser ? "PASS (Yes)" : "WARN"}`);
}

main().catch(console.error);
