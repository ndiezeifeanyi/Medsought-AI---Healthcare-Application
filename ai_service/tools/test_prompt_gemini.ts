import { loadConfig } from "../src/configuration/config.ts";
import { resolveLlmProvider } from "../src/llm/factory.ts";

async function main() {
  const config = loadConfig(process.env);
  const llm = resolveLlmProvider(config);

  const res = await llm.generate({
    messages: [
      {
        role: "system",
        content: `You are MedSought AI, a helpful medical support assistant.
Respond directly to the patient's question in 2-3 concise, friendly sentences.
Never write any internal notes, thinking, drafts, or preamble. Output ONLY your final response to the user.
If discussing medications, end with:
Disclaimer; Educational only. Not medical advice.`
      },
      {
        role: "user",
        content: `Reference Information:
Vitamin C and Augmentin: No known severe interactions; safe to take during same course.
Vitamin C and Paracetamol: Generally safe; no major interactions.

User Question: is it okay to take vitamin c with augmentin or paracetamol`
      }
    ],
    temperature: 0.1,
    max_tokens: 600
  });

  console.log("=== RAW LLM RESPONSE ===");
  console.log(res.content);
  console.log("\n=== BACKWARDS EXTRACTED RESPONSE ===");
  function extractFinalResponse(raw: string): string {
    const rawParas = raw.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const candidateParas: string[] = [];

    for (let i = rawParas.length - 1; i >= 0; i--) {
      let p = rawParas[i];
      // strip wrapping quotes
      if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
        p = p.slice(1, -1).trim();
      }
      // If this paragraph is a reasoning/draft block, skip it
      if (/^\s*\*?\s*(?:User Question|Reference Info|Constraints?|Role|Format|No internal|Output ONLY|End with|Draft|Refining|Sentence \d+|Content|Spelling check|User(?:'s)?\s+(?:Input|Question|problem|says|asks)|Context:?|Goal:?)/i.test(p)) {
        continue;
      }
      if (/\?\s+(?:Yes|No|N\/A|Done)\b/i.test(p)) {
        continue;
      }
      if (/^\s*[\*\-•]\s+(?:Rule\s*\d+|Constraint|Check|Draft|Self-Correction)\b/i.test(p)) {
        continue;
      }

      candidateParas.unshift(p);
      // Once we have a substantive paragraph (>= 40 chars) + disclaimer, we are done
      if (p.length >= 40 && !p.startsWith("Disclaimer")) {
        break;
      }
    }

    let result = candidateParas.join("\n\n").trim();
    // Strip leading quoted draft when followed by clean text
    result = result.replace(/^"[^"]+"\s*(?=[A-Z])/g, "").trim();
    result = result.replace(/\*\*([^*]+)\*\*/g, "$1");
    result = result.replace(/^\s*[\*•]\s+/gm, "");
    if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) {
      result = result.slice(1, -1).trim();
    }
    return result;
  }

  console.log(extractFinalResponse(res.content));
}

main();
