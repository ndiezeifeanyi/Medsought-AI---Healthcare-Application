import { loadConfig } from "../src/configuration/config.ts";

async function main() {
  const config = loadConfig(process.env);
  const key = config.geminiApiKey || process.env.GEMINI_API_KEY || "";
  
  const testModels = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.7-flash", "gemma-4-26b-a4b-it"];

  for (const model of testModels) {
    console.log(`\nTesting model: ${model} ...`);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Hi Buddy" }] }],
          systemInstruction: {
            parts: [{ text: "You are MedSought AI, a medical support assistant. Answer directly to the user in 2 friendly sentences. Do NOT output internal thoughts or planning." }]
          },
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 200
          }
        })
      });
      const data = await res.json();
      if (data.candidates && data.candidates[0]?.content?.parts) {
        console.log("SUCCESS!");
        console.log("Output:", data.candidates[0].content.parts.map((p: any) => p.text).join(""));
      } else {
        console.log("Error response:", JSON.stringify(data));
      }
    } catch (e) {
      console.log("Fetch failed:", e);
    }
  }
}

main().catch(console.error);
