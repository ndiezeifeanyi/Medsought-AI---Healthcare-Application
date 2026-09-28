import { ChatHandler } from "../api/handlers/chat.ts";

async function main() {
  const handler = new ChatHandler();

  const queries = [
    "what is paracetamol",
    "what is ibuprofen",
    "remind me about taking my drugs by 9pm",
    "who are you?",
    "if i mix paracetamol with alcohol, wht will be the result",
    "i want to book a consultation",
    "book a consultation with a pharmacist",
    "tell me more about augmentin"
  ];

  for (const q of queries) {
    console.log(`\n=================== USER: "${q}" ===================`);
    const res = await handler.process({
      userId: "u1",
      conversationId: "c_test",
      message: q
    });
    console.log(`AI: ${res.message}`);
  }
}

main().catch(console.error);
