import type { Intent, ExternalIntent } from "../schemas/contracts.ts";
import { toExternalIntent } from "../schemas/contracts.ts";

export { toExternalIntent };

export interface IntentClassification {
  intent: Intent;
  confidence: number;
  entities: {
    medicines: string[];
  };
}

export function classifyIntentFallback(message: string): IntentClassification {
  const lower = message.trim().toLowerCase();
  const medicines = extractMedicineCandidates(message);

  // 0. [SYSTEM]-prefixed messages are backend-delivered reminders
  if (/^\[SYSTEM\]/i.test(message.trim())) {
    return { intent: "reminder_delivery", confidence: 0.99, entities: { medicines } };
  }

  // ⭐ CRITICAL OVERRIDE 1: FORCE EMERGENCY SEVERITY ROUTING UPFRONT
  // Detects acute life-threatening safety concerns instantly (including severe hypertensive crisis BP >= 180)
  const bpMatch = lower.match(/\b(?:blood pressure|bp)\s*(?:is\s*(?:at\s*)?)?(?:over\s*|above\s*)?([1-2]\d{2})\b/i);
  const isHighBpCrisis = bpMatch && parseInt(bpMatch[1], 10) >= 180;

  if (isHighBpCrisis || /\b(bleeding internally|internal bleeding|bleeding severely|severe(?:ly)? bleeding|bleeding profusely|profuse bleeding|heavy bleeding|coughing blood|vomiting blood|blood in stool|blood in urine|chest pain|heart attack|stroke|cannot breathe|can'?t breathe|difficulty breathing|shortness of breath|anaphylaxis|seizure|seizures|overdose|unconscious|loss of consciousness|passed out|suicidal|kill myself|end my life|poisoning|poisoned)\b/i.test(lower)) {
    return {
      intent: "emergency",
      confidence: 0.95,
      entities: { medicines }
    };
  }

  // ⭐ CRITICAL OVERRIDE 2: FORCE PHARMACIST CONSULTATION UPFRONT
  // Intercepts ANY request or intention to consult a pharmacist, pharmacy, or clinical professional
  const isPharmacistConsultRequest =
    /\b(?:pharmacist|pharmacists|pharmacy|pharmacies)\b/i.test(lower) &&
    /\b(?:consult|consults|consulted|consulting|consultation|consultations|access|speak|talk|talking|call|calling|reach|reaching|contact|contacting|connect|connecting|see|seeing|visit|visiting|meet|meeting|appointment|appointments|book|booking|discuss|discussing|ask|asking|advice|advise|guidance|question|questions|help|need|want|get|schedule)\b/i.test(lower);

  const isDoseGuidanceRequest =
    /\b(?:forgot\s+(?:my\s+)?(?:drug\s+)?dosage|how\s+to\s+take\s+(?:the|my)\s+dosage|how\s+should\s+i\s+take\s+my|drugs?\s+(?:just\s+)?finished|medications?\s+finished)\b/i.test(lower);

  if (isPharmacistConsultRequest || isDoseGuidanceRequest || /\b(?:pharmacist|pharmacy)\s+consultations?\b/i.test(lower)) {
    return {
      intent: "pharmacist_consultation",
      confidence: 0.95,
      entities: { medicines }
    };
  }

  // ⭐ CRITICAL OVERRIDE 3: TECHNICAL, META-FEEDBACK & NON-MEDICAL INQUIRIES
  if (/\b(?:prompt\s+inject|llm\s+api|api\s+access|system\s+prompt|give\s+me\s+access|search\s+for\s+job|job\s+search|employment|hallucinat|broken|automated\s+background|database\s+inventory|live\s+mapping|zip\s+code)\b/i.test(lower)) {
    return { intent: "general_inquiry", confidence: 0.9, entities: { medicines: [] } };
  }

  // 1. Greeting detection & polite acknowledgments
  if (/^\s*(hi+|hello+|hey+|good (morning|afternoon|evening|night)|howdy|greetings|what'?s up|sup|hiya|yo|thank you|thanks|thank u|thankyou|appreciate it|much appreciated|welcome|you'?re welcome|bye|goodbye|cheers)\b/i.test(lower) && lower.length < 70) {
    return { intent: "greeting", confidence: 0.9, entities: { medicines } };
  }

  // 2. Cancel or modify an existing reminder
  if (/\b(cancel (my |the )?reminder|delete (my |the )?reminder|remove (my |the )?reminder|stop (my |the )?reminder|modify (my |the )?reminder|change (my |the )?reminder|update (my |the )?reminder|reschedule (my |the )?reminder)\b/i.test(lower)) {
    return { intent: "cancel_or_modify_reminder", confidence: 0.85, entities: { medicines } };
  }

  // 3. Setting a new reminder
  if (/\b(remind me to|remind me at|remind me in|remind me on|remind me daily|schedule a reminder|set a reminder|set an alarm|schedule an alarm|set a daily)\b/i.test(message)) {
    return { intent: "schedule_reminder", confidence: 0.8, entities: { medicines } };
  }

  // 4. Medication adherence / reminder replies (must not contain a co-administration question)
  const isCoAdminQuestion = /\b(can i|is it safe|should i|could i|may i|is it okay|advisable)\b/i.test(message);
  if (!isCoAdminQuestion && /\b(taken it|i'?ve taken|took it|done|missed it|skipped|forgot|haven't taken|snooze|remind me later|refill|already took my medicine|already took my medication|did\s+not\s+(?:later\s+)?remind|didn'?t\s+remind|never\s+reminded|forgot\s+to\s+remind)\b/i.test(message)) {
    return { intent: "reminder_response", confidence: 0.75, entities: { medicines } };
  }

  // 5. Symptom report (non-emergency health symptoms, normal vitals updates)
  if (/\b(i have a|i'?ve been|i feel|i am feeling|i'?m feeling|i'?m experiencing|i suffer|i'?ve had|my .{0,20} (hurts?|is sore|is swollen|is painful|is tender|feels?)|headache|nausea|vomiting|dizziness|diarrhea|rash|fever|fatigue|pain|ache|cough|sore throat|runny nose|itching|bp is back to normal|blood pressure is (?:back to )?normal|normal bp|feeling better|bloated|bloating|purging|purge|stomach|cramps|cramping|constipation|indigestion|heartburn|stooling|watery stool)\b/i.test(lower) && medicines.length === 0) {
    return { intent: "symptom_report", confidence: 0.7, entities: { medicines } };
  }

  // 6. Medicine availability / pharmacy search
  if (/\b(where|find|buy|get|available|stock|nibo|ina ne|ebee|zuta|zụta|ra|ri|samu)\b/i.test(lower)) {
    return { intent: "medicine_search", confidence: 0.55, entities: { medicines } };
  }

  // 7. Side effects & adverse reactions
  if (/\b(side effects?|adverse effects?|complications?|adverse reactions?|what are the side effects|illa|ipa buburu|nsogbu)\b/i.test(lower)) {
    return { intent: "side_effects", confidence: 0.7, entities: { medicines } };
  }

  // 8. Drug interaction & co-administration
  const isExplicitInteraction = /\b(interaction|interactions|interact|interacts|interacting|interfere|interferes|interfering|interference|incompatibility|incompatible|advisable|bad combination|good combination|safe combination|combine them|take them together|mix them|affect(?:s|ed|ing)?\s+(?:the\s+)?absorption|binding\s+to|impair(?:s|ed|ing)?\s+(?:the\s+)?absorption)\b/i.test(lower);
  const isCoAdminPattern =
    /\b(take|taking|took|taken|drink|drank|drinking|drunk|have|had|having|use|using|used|combine|combining|combined|mix|mixing|mixed|blend|blending|blended|co-administer|co-administered|coadminister|coadministered|administered|administer)\b.*\b(after|before|with|along with|alongside|together|plus|while taking|while on|and)\b/i.test(lower) ||
    /\b(can i|is it safe|should i|could i|safe to|okay to|advisable to)\s+(?:take|drink|have|mix|use|combine)\b.*\b(?:with|after|before|and|together|along with|if i (?:already )?(?:took|taken|had|drank|used))\b/i.test(lower) ||
    /\b(?:already took|have taken|took)\b.*\b(?:can i|is it safe to|should i|could i)\s+(?:take|drink|have|use|combine)\b/i.test(lower) ||
    /\b(?:these (?:medicines|drugs|pills|medications)|both)\s+(?:together|at the same time|interact|interacts)\b/i.test(lower) ||
    /\b(?:mixed with|combined with|taken with|used with|drunk with|together advisable|together safe|together okay|bad combination)\b/i.test(lower) ||
    /\b[a-z]{3,20}\s+and\s+[a-z]{3,20}\s+(?:together\s+)?advisable\b/i.test(lower) ||
    /\b(tare da|gwakota|gwakọta|po|gbapo|gbapọ)\b/i.test(lower);

  if (isExplicitInteraction || (isCoAdminPattern && (medicines.length >= 2 || /\b(alcohol|beer|wine|liquor|milk|together|these|both|advisable|combination|antibiotics?|antacids?)\b/i.test(lower)))) {
    return { intent: "drug_interaction", confidence: 0.7, entities: { medicines } };
  }

  // 9. General drug information / overview / usage inquiries
  if (/\b(tell me about|tell me more about|what about|how about|what is|what are|what does|how does|how do|information about|info on|details on|explain|cure|treat|treats|curing|good drug|safe drug|take|taking|with food|empty stomach|how do i take|menene|kini|kedu|gini bu)\b/i.test(lower) && (medicines.length >= 1 || /\b(drug|drugs|medicine|medicines|medication|medications|pill|pills|tablet|tablets|antibiotic|antibiotics|antacid|antacids)\b/i.test(lower))) {
    return { intent: "drug_information", confidence: 0.6, entities: { medicines } };
  }

  if (/\b(drug|medicine|medication|dose|dosage|warnings?|pregnancy|storage|indications?|contraindications?|magani|oogun|ogwu)\b/i.test(lower) && medicines.length >= 1) {
    return { intent: "drug_information", confidence: 0.55, entities: { medicines } };
  }

  // If valid candidate medicines exist and the message is short or drug-oriented (e.g. "ciprofloxacin", "what about lonart drugs")
  if (medicines.length >= 1 && (lower.split(/\s+/).length <= 5 || /\b(uses?|indication|take|use|benefit|work|works|amfani|lilo|uru|advisable|drug|drugs)\b/i.test(lower))) {
    return { intent: "drug_information", confidence: 0.5, entities: { medicines } };
  }

  // 10. General inquiry (default for general/math/chit-chat questions)
  return { intent: "general_inquiry", confidence: 0.3, entities: { medicines } };
}

const KNOWN_DRUGS = new Set([
  "augmentin", "amoxicillin", "clavulanate", "clavulanic", "paracetamol", "acetaminophen",
  "ibuprofen", "advil", "motrin", "tylenol", "panadol", "aspirin", "artemether", "lumefantrine",
  "lumenfatrine", "ciprofloxacin", "cipro", "lonart", "coartem", "metformin", "glipizide",
  "metronidazole", "flagyl", "omeprazole", "lisinopril", "amlodipine", "atorvastatin",
  "azithromycin", "doxycycline", "clotrimazole", "hydrochlorothiazide", "losartan",
  "ciprotab", "fansidar", "chloroquine", "quinine", "artesunate", "proguanil", "atovaquone",
  "malaria", "typhoid", "insulin", "albuterol", "salbutamol", "cetirizine", "loratadine",
  "folic acid", "cyclosporine", "cyanocobalamin", "calcitriol", "spironolactone", "warfarin",
  "cimetidine", "dolutegravir", "digoxin", "clarithromycin", "methotrexate", "simvastatin", "amiodarone",
  "antacid", "antacids", "antibiotic", "antibiotics", "tetracycline", "tetracyclines", "fluoroquinolone", "fluoroquinolones"
]);

const PHARMA_STEMS = /(?:cillin|mycin|micin|statin|olol|pril|sartan|tidine|prazole|floxacin|zole|dipine|quine|drine|phine|fenac|mab|nib|pine|zine|dine|line|mine|done|vudine|navir|vir|sone|lone|zide|ide|caine|coxib|lukast|triptan|semide|artan|tinib|gliflozin|gliptin)$/i;

export function extractMedicineCandidates(message: string): string[] {
  const commonWords = new Set([
    "can", "could", "should", "would", "must", "shall", "will", "may", "might",
    "do", "does", "did", "doing", "done",
    "drug", "drugs", "medicine", "medicines", "medication", "medications",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
    "my", "your", "his", "their", "our", "its", "mine", "yours", "hers", "theirs", "ours",
    "is", "am", "are", "was", "were", "be", "been", "being",
    "tell", "tells", "told", "telling", "say", "says", "said", "saying", "ask", "asks", "asked", "asking",
    "think", "thinks", "thinking", "thought", "thoughts", "mind", "minds", "minding",
    "know", "knows", "knowing", "knew", "known", "feel", "feels", "feeling", "felt", "feelings",
    "want", "wants", "wanting", "wanted", "need", "needs", "needing", "needed",
    "talk", "talks", "talking", "talked", "speak", "speaks", "speaking", "spoke", "spoken",
    "mean", "means", "meaning", "meant", "understand", "understands", "understanding", "understood",
    "look", "looks", "looking", "looked", "see", "sees", "seeing", "saw", "seen",
    "hear", "hears", "hearing", "heard", "listen", "listens", "listening", "listened",
    "read", "reads", "reading", "write", "writes", "writing", "wrote", "written",
    "get", "gets", "getting", "got", "gotten", "give", "gives", "giving", "gave", "given",
    "thank", "thanks", "thankyou", "welcome", "appreciate", "appreciated", "bye", "goodbye", "cheers",
    "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
    "the", "a", "an", "this", "that", "these", "those", "there", "here",
    "about", "around", "above", "below", "under", "over", "between", "during", "through", "along", "with", "without",
    "for", "please", "more", "mix", "mixed", "mixing", "combine", "combined", "combining",
    "blend", "blended", "result", "advisable", "together",
    "describe", "yourself", "myself", "working", "works", "work", "hello", "hi", "hey", "buddy", "friend",
    "build", "chatbot", "assistant", "help", "make", "create", "toy", "real", "system", "app",
    "application", "bot", "ai", "medsought", "not", "some", "good", "bad", "take", "taking", "took", "taken",
    "find", "use", "used", "using", "like", "just", "very", "also", "well",
    "time", "way", "day", "man", "thing", "things", "people", "name", "sentence", "sentences",
    "remind", "reminder", "alarm", "schedule", "mins", "minutes", "hours", "hrs", "daily", "every",
    "set", "add", "put", "setting", "scheduled", "pills", "dose", "doses", "dosage", "dosages", "translated", "translation",
    "book", "booking", "consult", "consulting", "consultation", "consultations", "appointment", "appointments", "schedule", "pm", "am", "clock",
    "access", "reach", "reaching", "contact", "contacting", "connect", "connecting",
    "pharmacist", "pharmacists", "pharmacy", "pharmacies", "doctor", "doctors", "nurse", "nurses", "physician", "physicians",
    "remember", "last", "conversation", "smart", "intelligent",
    "nibo", "kini", "menene", "kedu", "ebee", "ina", "samu", "zuta", "zụta", "ogwu", "magani", "oogun",
    "drink", "drank", "drinking", "already", "after", "before",
    "have", "had", "having", "has", "many", "much", "any", "both", "plus",
    "safe", "safely", "okay", "tablet", "tablets", "capsule", "capsules", "pill", "syrup", "injection",
    "side", "adverse", "effect", "effects", "reaction", "reactions", "water", "food", "meal", "meals",
    "morning", "night", "evening", "afternoon", "today", "yesterday", "tomorrow", "tonight",
    "hospital", "clinic", "treatment", "cure", "problem", "issue", "advice",
    "headache", "nausea", "vomiting", "dizziness", "dizzy", "diarrhea", "rash", "fever", "fatigue",
    "pain", "ache", "cough", "sore", "throat", "runny", "nose", "itching", "itchy", "experiencing",
    "experience", "experienced", "symptoms", "symptom", "suffer", "suffering",
    "bloated", "bloating", "purging", "purge", "stomach", "cramps", "cramping", "constipation", "indigestion", "heartburn", "stooling",
    "days", "weeks", "hours", "months", "two", "three", "four", "five", "six", "seven",
    "blood", "pressure", "normal", "high", "low", "finished", "forgot",
    "later", "never", "ever", "mention", "mentioned", "mentioning", "neither", "either",
    "prompt", "inject", "api", "code", "sql", "database", "inventory", "llm", "model",
    "hallucinate", "hallucinating", "hallucination", "hallucinations", "broken",
    "structure", "structuring", "organizer", "breakfast", "lunch", "dinner", "oily", "greasy", "diet",
    "job", "jobs", "employment", "search", "searching", "locate", "location", "locations", "zip", "city", "state", "map", "maps",
    "cause", "causes", "causing", "caused", "heart", "block", "disease", "cardiac",
    "stop", "cancel", "reschedule", "accurate", "correct", "wrong", "false", "true", "right",
    "bring", "bringing", "unprompted", "introduce", "introducing", "unrelated", "focus",
    "frustration", "frustrated", "confusion", "clarify", "feedback", "review", "test", "testing",
    "responses", "response", "anymore", "still", "always", "sometimes", "never", "nothing", "something", "anything",
    "provide", "provides", "providing", "provided", "guidance", "guide", "guides", "guiding", "guided",
    "decide", "decides", "deciding", "decided", "consider", "considers", "considering", "considered",
    "include", "includes", "including", "included", "inside", "outside", "beside", "besides",
    "online", "offline", "service", "services", "server", "servers", "system", "systems", "setting", "settings"
  ]);

  const candidates: string[] = [];

  // 1. Explicit multi-word vitamins and acid drugs
  const multiWordMatches = message.match(/\b(?:vitamin\s+[a-zA-Z0-9]+|(?:folic|ascorbic|valproic|tranexamic|fusidic|clavulanic|acetylsalicylic)\s+acid)\b/gi) ?? [];
  for (const mwm of multiWordMatches) {
    candidates.push(mwm.trim().toLowerCase());
  }

  let sanitizedMessage = message;
  for (const mwm of multiWordMatches) {
    sanitizedMessage = sanitizedMessage.replace(new RegExp(mwm, "gi"), " ");
  }

  // 2. Explicit take / prescribe patterns e.g. "take Ibuprofen with food"
  const takePattern = /\b(?:take|taking|took|prescribed|dose of|tablet of|tablets of|pills? of|drugs? called|medicine called)\s+([a-zA-Z]{3,25})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = takePattern.exec(sanitizedMessage)) !== null) {
    const candidateWord = match[1].toLowerCase();
    if (!commonWords.has(candidateWord) && candidateWord.length >= 3) {
      candidates.push(match[1]);
    }
  }

  // 3. Context-sensitive proper-noun extraction.
  // Captures Title-Case (or ALL-CAPS) words that appear in an explicit
  // pharmacological sentence position.  This picks up brand / fixture names
  // (e.g. "AlphaMed", "BetaMed") that are not yet in KNOWN_DRUGS but are
  // unambiguously used as medicine names by sentence structure.
  // These patterns are narrow and scoped to the pharma context so they do
  // NOT re-open the ambient hallucination vector.
  const scopedPatterns: RegExp[] = [
    // "side effects of AlphaMed" / "effects of X" / "contraindications of X"
    /\b(?:side\s+effects?|adverse\s+effects?|contraindications?|interactions?|dosage|overdose)\s+(?:of|for)\s+([A-Z][A-Za-z0-9-]{2,24})\b/g,
    // "tell me about AlphaMed" / "about X" / "about X contraindications"
    /\b(?:tell\s+me\s+(?:more\s+)?about|about|regarding|information\s+(?:on|about))\s+([A-Z][A-Za-z0-9-]{2,24})\b/g,
    // "What are AlphaMed contraindications" (subject-first)
    /\bWhat\s+are\s+([A-Z][A-Za-z0-9-]{2,24})\s+(?:contraindications?|side\s+effects?|interactions?|uses?|dosage)\b/g,
    // "Can I take AlphaMed" / "take X with Y"
    /\b(?:can\s+i|is\s+it\s+safe\s+to|should\s+i)\s+take\s+([A-Z][A-Za-z0-9-]{2,24})\b/g,
    // "...with AlphaMed" — picks up the second drug in "take X with AlphaMed"
    /\bwith\s+([A-Z][A-Za-z0-9-]{2,24})\b/g,
  ];
  for (const pat of scopedPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(sanitizedMessage)) !== null) {
      const word = m[1];
      if (!commonWords.has(word.toLowerCase()) && word.length >= 3) {
        candidates.push(word);
      }
    }
  }

  // 4. Known drugs or words with pharmaceutical suffixes (ambient scan)
  const words = sanitizedMessage.match(/\b[a-zA-Z][a-zA-Z0-9-]{2,}\b/g) ?? [];
  for (const w of words) {
    const lower = w.toLowerCase();
    if (commonWords.has(lower)) continue;
    if (KNOWN_DRUGS.has(lower) || (lower.length >= 5 && PHARMA_STEMS.test(lower))) {
      candidates.push(w);
    }
  }

  return [...new Set(candidates)].slice(0, 5);
}