/**
 * Sequential API end-to-end test covering all 9 scenarios from the requirements.
 * Run AFTER: node ai_service/api/server.js  (port 3000)
 */
import { startServer } from "../api/server.ts";

const BASE = "http://localhost:3000/api/v1/ai/chat";
let pass = 0;
let fail = 0;

function check(label: string, actual: string, predicate: (s: string) => boolean) {
  const ok = predicate(actual);
  const icon = ok ? "✅" : "❌";
  console.log(`  ${icon} ${label}`);
  if (!ok) {
    console.log(`     got: "${actual.slice(0, 120)}..."`);
    fail++;
  } else {
    pass++;
  }
}

async function turn(srv: any, userId: string, conversationId: string, message: string): Promise<any> {
  const res = await fetch(`http://localhost:${srv.port}/api/v1/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, conversationId, message })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function run() {
  const srv = await startServer({ port: 0 });
  console.log(`\nServer started on port ${srv.port}\n`);

  // ─── TEST 1: Same-subject follow-up ────────────────────────────────────────
  console.log("TEST 1 — Same-subject follow-up (Cidarcool soap)");
  {
    const u = "t1-user"; const c = "t1-conv";
    const r1 = await turn(srv, u, c, "Do you know about Cidarcool soap?");
    console.log(`  Turn 1 message (truncated): ${r1.message.slice(0, 80)}...`);
    const r2 = await turn(srv, u, c, "How long does it take to work?");
    console.log(`  Turn 2 message (truncated): ${r2.message.slice(0, 80)}...`);
    const lower = r2.message.toLowerCase();
    check("Does NOT switch to Aqua Glycolic",    r2.message, m => !m.toLowerCase().includes("aqua glycolic"));
    check("Does NOT switch to Ciclopirox",        r2.message, m => !m.toLowerCase().includes("ciclopirox"));
    check("Mentions soap/cidarcool/skin or work", r2.message, m => /cidarcool|soap|skin|work|time|days|weeks/i.test(m));
  }

  // ─── TEST 2: Subject change ────────────────────────────────────────────────
  console.log("\nTEST 2 — Subject change (Cidarcool → Augmentin → follow-up)");
  {
    const u = "t2-user"; const c = "t2-conv";
    await turn(srv, u, c, "Tell me about Cidarcool soap.");
    const r2 = await turn(srv, u, c, "What about Augmentin composition?");
    const r3 = await turn(srv, u, c, "What is it used for?");
    console.log(`  Turn 3 message (truncated): ${r3.message.slice(0, 80)}...`);
    check("Refers to Augmentin, not Cidarcool", r3.message, m =>
      /augmentin|amoxicillin|antibiotic|bacteria|infection/i.test(m) &&
      !m.toLowerCase().includes("cidarcool")
    );
  }

  // ─── TEST 3: Unrelated question after subject ──────────────────────────────
  console.log("\nTEST 3 — Unrelated question (Eva soap → limitations)");
  {
    const u = "t3-user"; const c = "t3-conv";
    await turn(srv, u, c, "Tell me about Eva soap.");
    const r2 = await turn(srv, u, c, "What are your system limitations?");
    console.log(`  Turn 2 message (truncated): ${r2.message.slice(0, 80)}...`);
    check("Does NOT mention Eva soap", r2.message, m => !m.toLowerCase().includes("eva soap") && !m.toLowerCase().includes("eva"));
    check("Responds about limitations / scope", r2.message, m =>
      /limit|cannot|can't|don't|medical advice|medication|pharmacy|health/i.test(m)
    );
  }

  // ─── TEST 4: Greeting after subject ───────────────────────────────────────
  console.log("\nTEST 4 — Greeting after subject (Augmentin → Hi buddy)");
  {
    const u = "t4-user"; const c = "t4-conv";
    await turn(srv, u, c, "Tell me about Augmentin.");
    const r2 = await turn(srv, u, c, "Hi buddy");
    console.log(`  Turn 2 message (truncated): ${r2.message.slice(0, 80)}...`);
    check("Returns greeting intent",         r2, r => r.intent === "greeting");
    check("Does NOT mention Augmentin",      r2.message, m => !/augmentin/i.test(m));
    check("Does NOT mention amoxicillin",    r2.message, m => !/amoxicillin/i.test(m));
  }

  // ─── TEST 5: User isolation ────────────────────────────────────────────────
  console.log("\nTEST 5 — User isolation (User A & B share conversationId)");
  {
    const convId = "shared-conv-isolation";
    const uA = "user-alpha-iso"; const uB = "user-beta-iso";
    await turn(srv, uA, convId, "Tell me about paracetamol.");
    await turn(srv, uB, convId, "Tell me about malaria.");
    const rA = await turn(srv, uA, convId, "What are its side effects?");
    console.log(`  User A Turn 3 (truncated): ${rA.message.slice(0, 80)}...`);
    check("User A: mentions paracetamol side effects", rA.message, m =>
      /paracetamol|acetaminophen|liver|nausea|allerg/i.test(m)
    );
    check("User A: does NOT mention malaria",          rA.message, m => !/malaria/i.test(m));
  }

  // ─── TEST 6: RAG with relevant evidence ───────────────────────────────────
  console.log("\nTEST 6 — RAG with relevant evidence (augmentin drug info)");
  {
    const u = "t6-user"; const c = "t6-conv";
    const r = await turn(srv, u, c, "Tell me about Augmentin.");
    console.log(`  Response (truncated): ${r.message.slice(0, 80)}...`);
    check("Returns medication_question intent", r, r2 => r2.intent === "medication_question");
    check("Response is non-empty",              r.message, m => m.length > 30);
  }

  // ─── TEST 7: RAG with no relevant evidence ────────────────────────────────
  console.log("\nTEST 7 — RAG with no matching evidence (obscure product)");
  {
    const u = "t7-user"; const c = "t7-conv";
    const r = await turn(srv, u, c, "What is zxqylothrin used for?");
    console.log(`  Response (truncated): ${r.message.slice(0, 80)}...`);
    check("Does NOT crash (non-empty response)", r.message, m => m.length > 20);
    check("Does not invent unrelated product",   r.message, m => !m.toLowerCase().includes("aqua glycolic"));
  }

  // ─── TEST 8: No context contamination chain ───────────────────────────────
  console.log("\nTEST 8 — No context contamination chain");
  {
    const u = "t8-user"; const c = "t8-conv";
    await turn(srv, u, c, "Tell me about Eva soap.");
    await turn(srv, u, c, "What drug should I take to stop gagging?");
    await turn(srv, u, c, "Do you have any limiting factor that will hinder your responses?");
    const r4 = await turn(srv, u, c, "What about photochromic lenses?");
    const r5 = await turn(srv, u, c, "Hello!");

    console.log(`  Turn 4 (photochromic, truncated): ${r4.message.slice(0, 80)}...`);
    console.log(`  Turn 5 (greeting, truncated):     ${r5.message.slice(0, 80)}...`);

    check("Turn 5 is greeting intent",          r5, r => r.intent === "greeting");
    check("Turn 5 does NOT mention Eva soap",   r5.message, m => !/eva soap/i.test(m));
    check("Turn 5 does NOT mention photochromic", r5.message, m => !/photochromic/i.test(m));
  }

  // ─── TEST 9: Anaphoric carry across 2 turns ───────────────────────────────
  console.log("\nTEST 9 — Anaphoric carry is preserved when correct");
  {
    const u = "t9-user"; const c = "t9-conv";
    await turn(srv, u, c, "Do you know about Cidarcool soap?");
    const r2 = await turn(srv, u, c, "How many days or months does it take to work?");
    console.log(`  Turn 2 (truncated): ${r2.message.slice(0, 80)}...`);
    check("Stays on Cidarcool topic", r2.message, m =>
      /cidarcool|soap|skin|work|days|weeks|months/i.test(m)
    );
    check("Does NOT switch to Aqua Glycolic", r2.message, m => !m.toLowerCase().includes("aqua glycolic"));
  }

  await srv.stop();

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
