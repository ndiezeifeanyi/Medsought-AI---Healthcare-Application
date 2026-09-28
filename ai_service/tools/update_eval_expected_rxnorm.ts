import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { RxNormDrugProvider } from "../src/knowledge/providers/rxnorm-drug-provider.ts";

async function run() {
  const path = resolve("ai_service/evals/whatsapp-eval.json");
  const raw = readFileSync(path, "utf8");
  const examples = JSON.parse(raw);

  const provider = new RxNormDrugProvider();

  for (const ex of examples) {
    const expected = ex.expected;
    if (expected.medicine) {
      try {
        const res = await provider.resolveMedicine({ medicine_name: expected.medicine, language: "en" });
        if (res.found && res.resolved_name) expected.medicine = res.resolved_name;
      } catch {
        // leave as-is on failure
      }
    }
    if (expected.medicines && Array.isArray(expected.medicines)) {
      for (let i = 0; i < expected.medicines.length; i++) {
        try {
          const res = await provider.resolveMedicine({ medicine_name: expected.medicines[i], language: "en" });
          if (res.found && res.resolved_name) expected.medicines[i] = res.resolved_name;
        } catch {
          // ignore
        }
      }
    }
  }

  const out = resolve("ai_service/evals/whatsapp-eval.updated.json");
  writeFileSync(out, JSON.stringify(examples, null, 2), "utf8");
  console.log(`Wrote updated eval file to ${out}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
