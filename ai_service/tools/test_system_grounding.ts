import { loadConfig } from "../src/configuration/config.ts";
import { resolveLlmProvider } from "../src/llm/factory.ts";

async function main() {
  const config = loadConfig(process.env);
  config.geminiModel = "gemini-2.0-flash";
  const llm = resolveLlmProvider(config);

  const res = await llm.generate({
    messages: [
      {
        role: "system",
        content: `You are MedSought AI, a helpful medical support assistant for patients.
Respond to the patient's message directly in 2 to 3 concise, friendly sentences.
Do not output any internal notes, reasoning, or drafts.
End medication advice with:
Disclaimer; Educational only. Not medical advice.`
      },
      {
        role: "user",
        content: `Reference:
Vitamin C and Augmentin: No known severe interactions; safe to take during same course.
Vitamin C and Paracetamol: Generally safe; no major interactions.

Question: is it okay to take vitamin c with augmentin or paracetamol`
      }
    ],
    temperature: 0.1,
    max_tokens: 800
  });

  console.log("=== RAW LLM RESPONSE ===");
  console.log(res.content);

  const turn3Raw = `User Question: "if i mix augmentin with ciprofloxacin"
Context Provided (RAG): Information on Augmentin, Vitamin C, Alcohol, Metformin, and Artemether/Lumefantrine.
Constraint Check:
Role: MedSought AI (empathetic, concise, professional).
Length: 2 to 4 sentences.
Direct answer: Yes.
Disclaimer: "Disclaimer; Educational only. Not medical advice."
No markdown asterisks/bullets.
No internal monologue.
The provided RAG text *does not* contain information about the interaction between Augmentin and Ciprofloxacin.
However, as an AI, I must address the user's question based on the provided context or general medical knowledge if the context is insufficient, but I must be careful not to provide medical advice.
Actually, the prompt says "Grounded Medical Context from Approved Source". If the information isn't in the context, I should ideally advise the user to consult a professional.
Standard medical knowledge: Combining Augmentin (Amoxicillin/Clavulanate) and Ciprofloxacin (a fluoroquinolone) is generally not a common practice unless specifically directed by a doctor for a complex infection, as they are both broad-spectrum antibiotics. There isn't a specific "lethal" interaction mentioned in the RAG, but mixing antibiotics without guidance is risky.
Since the RAG doesn't cover this specific combination, the safest and most professional response is to direct the user to their doctor or pharmacist.
* I do not have specific information in my current database regarding the interaction between Augmentin and Ciprofloxacin. You should consult your prescribing doctor or a pharmacist before combining these two antibiotics to ensure it is safe and appropriate for your condition.
*   2-4 sentences.
Direct answer.
No markdown.
Disclaimer included.
* I do not have specific information regarding the interaction between Augmentin and Ciprofloxacin in my current medical context. Please consult your prescribing doctor or a pharmacist before taking these two medications together to ensure they are safe for your specific treatment plan.
*Wait, let me check if I can provide a general answer.* Combining different classes of antibiotics can increase the risk of side effects like gastrointestinal upset or changes in gut bacteria. However, because this specific combination is not in the provided text, I must prioritize professional consultation.
*
        I do not have specific information regarding the interaction between Augmentin and Ciprofloxacin in the provided medical context. You should contact your prescribing doctor or a pharmacist immediately to discuss whether taking these two antibiotics together is safe for your specific infection.
*Check against constraints:*
        - 2-4 sentences? Yes (2 sentences).
        - Direct answer? Yes.
        - No markdown? Yes.
        - Disclaimer? Yes.
*Wait, looking at the RAG again.* It doesn't mention Ciprofloxacin.
*Response:* I do not have specific information regarding the interaction between Augmentin and Ciprofloxacin in my current medical resources. Please consult your prescribing doctor or a pharmacist before combining these medications to ensure they are appropriate for your treatment.
*Wait, I should check if I can answer based on general knowledge if the RAG is silent.* The instructions say "Directly answer the user's CURRENT message". If the RAG is the *only* source I'm allowed to use (implied by "Grounded Medical Context"), I must state I don't have that info.
*Let's try to be more helpful while staying within bounds.*
        "I do not have specific information regarding the interaction between Augmentin and Ciprofloxacin in my current medical context. Please consult your prescribing doctor or a pharmacist before combining these antibiotics to ensure it is safe and appropriate for your specific condition."
*Actually, I'll provide a slightly more direct guidance.*
        "I do not have specific information regarding the interaction between Augmentin and Ciprofloxacin in my current medical context. You should contact your doctor or pharmacist directly to confirm if these medications can be taken together safely for your specific needs."
*Wait, I'll check if there's a general rule.* Combining antibiotics can sometimes lead to increased side effects or resistance issues.
*Let's stick to the "Consult a professional" route since

Disclaimer; Educational only. Not medical advice.`;

  console.log("\n=== TESTING SANITIZER ON TURN 3 RAW ===");
  console.log(extractCleanParagraphs(turn3Raw));

  console.log("\n=== EXTRACT CLEAN PARAGRAPHS OUTPUT ===");
  function extractCleanParagraphs(raw: string): string {
    if (!raw) return "";
    let clean = raw.trim();
    // 1. Strip thought blocks
    clean = clean.replace(/<thought>[\s\S]*?<\/thought>/gi, "").trim();

    // 2. Extract explicit quoted response or response label if present
    const responseHeaderMatch = clean.match(/(?:\*?(?:Final Polish|Final Draft|Revised Draft|Final version|Final response|Revised Response|Final answer|Refined Answer|Response structure|Direct Conversational Reply|Conversational Reply|Response)\*?:?\s*)(?:["“]([\s\S]+?)["”]|([^\n]+(?:\n[^\n]+)?))/i);
    if (responseHeaderMatch) {
      const captured = (responseHeaderMatch[1] || responseHeaderMatch[2] || "").trim();
      if (captured.length >= 20 && !/^(?:Rule|Draft|Sentence|Check|Constraint|Role|Persona)/i.test(captured)) {
        clean = captured;
      }
    }

    // 3. Line-by-line meta-reasoning filter
    const lines = clean.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const validLines: string[] = [];

    const metaLinePatterns = [
      /^\s*\*?\s*(?:User(?:'s)?\s+(?:Question|Input|problem|says|asks)|Context(?:\s+Provided)?:?|Goal:?|Constraints?:?|Role:?|Persona:?|Length:?|Format:?|No\s+internal|Output\s+ONLY|End\s+with|Content:?|Spelling\s+check:?|Address\s+|Combine\s+into)/i,
      /^\s*\*?\s*(?:Constraint\s+Check|Safety\s+Check|Safety\s+Protocol|Required\s+Action|Direct\s+answer|Disclaimer:?|No\s+markdown|No\s+asterisk|No\s+internal\s+monologue)/i,
      /^\s*\*?\s*(?:The\s+provided\s+RAG|However,\s+as\s+an\s+AI|Actually,\s+the\s+prompt|Standard\s+medical\s+knowledge:|Since\s+the\s+RAG|Standard\s+medical\s+advice|Decision:|Check\s+against\s+constraints)/i,
      /^\s*\*?\s*(?:Wait,\s*let|Wait,\s*I|Wait,\s*looking|Sentence\s*\d+|Draft\s*\d+|Rule\s*\d+|Refining|Reference\s+provided|Self-Correction|Construction:)/i,
      /^\s*\*?\s*(?:Let's\s+stick|Let's\s+try|Actually,\s*I'll|Actually,\s*I|I\s+will\s+provide|I\s+should\s+check|Check\s+length|Final\s+check)/i,
      /^\s*[\*\-•]\s+(?:Rule\s*\d+|Constraint|Check|Draft|Self-Correction|Confidence\s+Score|Sentence\s*\d+|\d+-\d+\s+sentences|Direct\s+answer|No\s+markdown|Disclaimer\s+included)\b/i,
      /\?\s+(?:Yes|No|N\/A|Done)\b/i,
      /(?:route\s+since|because\s+this|route\s+because)\s*$/i
    ];

    for (const line of lines) {
      let l = line.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/^[\*•\-]\s*/, "").trim();
      if ((l.startsWith('"') && l.endsWith('"')) || (l.startsWith("'") && l.endsWith("'"))) {
        l = l.slice(1, -1).trim();
      }

      // Check if line is meta-thought
      const isMeta = metaLinePatterns.some(pat => pat.test(line) || pat.test(l));
      if (isMeta) continue;

      // Skip disclaimer lines during body collection
      if (/^\s*Disclaimer;?/i.test(l)) continue;
      if (/^\s*Educational only\.?/i.test(l)) continue;
      if (/^\s*Not medical advice\.?/i.test(l)) continue;

      if (l.length > 0) {
        validLines.push(l);
      }
    }

    let result = validLines.join(" ").trim();

    // 4. Strip duplicate quoted draft if immediately followed by unquoted text
    result = result.replace(/^"[^"]+"\s*(?=[A-Z])/g, "").trim();

    // 5. Strip any leftover asterisks and quote wraps
    result = result.replace(/\*+/g, "").replace(/^["']+/g, "").replace(/["']+$/g, "").trim();

    // 6. Deduplicate repeated consecutive sentences
    const sentences = result.split(/(?<=[.!?])\s+/);
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const s of sentences) {
      const norm = s.trim().toLowerCase();
      if (!seen.has(norm)) {
        seen.add(norm);
        unique.push(s.trim());
      }
    }
    result = unique.join(" ").trim();

    // 7. Strip leading disclaimer fragments
    result = result.replace(/^\s*(?:Disclaimer;?|Educational only\.?|Not medical advice\.?)+\s*/gi, "").trim();
    // Strip trailing disclaimer fragments
    result = result.replace(/(?:\s*\b(?:Disclaimer;?|Educational only\.?|Not medical advice\.?)\s*)+$/gi, "").trim();

    // 8. If empty or cut-off after filtering, fallback to safe professional advisory guidance
    if (!result || result.length < 15) {
      result = "Please consult your prescribing doctor or local pharmacist directly for specific instructions and guidance regarding your medication.";
    }

    // 9. Append disclaimer if discussion involved medications
    if (/disclaimer/i.test(raw)) {
      result += "\n\nDisclaimer; Educational only. Not medical advice.";
    }

    return result;
  }

  console.log(extractCleanParagraphs(res.content));
}

main();
