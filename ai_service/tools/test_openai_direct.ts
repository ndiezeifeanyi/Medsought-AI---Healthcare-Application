import { readFileSync } from "node:fs";

async function main() {
  const envRaw = readFileSync("ai_service/.env", "utf8");
  let apiKey = "";
  for (const line of envRaw.split("\n")) {
    if (line.startsWith("MEDSOUGHT_LLM_API_KEY=")) {
      apiKey = line.slice("MEDSOUGHT_LLM_API_KEY=".length).trim();
    }
  }

  console.log("Testing OpenAI key from .env:", apiKey.slice(0, 15) + "...");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say hello!" }]
    })
  });

  console.log("HTTP Status:", res.status);
  const text = await res.text();
  console.log("Response Body:", text);
}

main().catch(console.error);
