import test from "node:test";
import assert from "node:assert/strict";
import { RxNormDrugProvider } from "../../../src/knowledge/providers/rxnorm-drug-provider.ts";

test("RxNormDrugProvider: resolveMedicine exact and fuzzy resolution", async (t) => {
  const provider = new RxNormDrugProvider();

  await t.test("resolves correctly-spelled generic 'warfarin' via primary exact path", async () => {
    const res = await provider.resolveMedicine({ medicine_name: "warfarin" });
    assert.equal(res.found, true);
    assert.ok(res.resolved_name.toLowerCase().includes("warfarin"));
    assert.equal(res.confidence, 1.0);
    assert.ok(res.candidates.length >= 1);
  });

  await t.test("resolves correctly-spelled generic 'ciprofloxacin' via primary exact path", async () => {
    const res = await provider.resolveMedicine({ medicine_name: "ciprofloxacin" });
    assert.equal(res.found, true);
    assert.ok(res.resolved_name.toLowerCase().includes("ciprofloxacin"));
    assert.equal(res.confidence, 1.0);
  });

  await t.test("resolves brand name 'advil' via primary exact path", async () => {
    const res = await provider.resolveMedicine({ medicine_name: "advil" });
    assert.equal(res.found, true);
    assert.ok(res.resolved_name.toLowerCase().includes("advil") || res.resolved_name.toLowerCase().includes("ibuprofen"));
    assert.equal(res.confidence, 1.0);
  });

  await t.test("resolves common generic 'metformin' via primary exact path", async () => {
    const res = await provider.resolveMedicine({ medicine_name: "metformin" });
    assert.equal(res.found, true);
    assert.ok(res.resolved_name.toLowerCase().includes("metformin"));
    assert.equal(res.confidence, 1.0);
  });

  await t.test("catches deliberate misspelling 'worfarin' via approximate fallback path", async () => {
    const res = await provider.resolveMedicine({ medicine_name: "worfarin" });
    assert.equal(res.found, true);
    assert.ok(res.resolved_name.toLowerCase().includes("warfarin"));
    assert.ok(res.confidence >= 0.5 && res.confidence <= 0.95);
  });

  await t.test("catches deliberate misspelling 'amoxacillin' via approximate fallback path", async () => {
    const res = await provider.resolveMedicine({ medicine_name: "amoxacillin" });
    assert.equal(res.found, true);
    assert.ok(res.resolved_name.toLowerCase().includes("amoxicillin"));
    assert.ok(res.confidence >= 0.5 && res.confidence <= 0.95);
  });

  await t.test("rejects nonsense string 'xyzabcde123'", async () => {
    const res = await provider.resolveMedicine({ medicine_name: "xyzabcde123" });
    assert.equal(res.found, false);
    assert.equal(res.candidates.length, 0);
  });

  await t.test("rejects empty string input", async () => {
    const res = await provider.resolveMedicine({ medicine_name: "" });
    assert.equal(res.found, false);
    assert.equal(res.confidence, 0);
  });
});
