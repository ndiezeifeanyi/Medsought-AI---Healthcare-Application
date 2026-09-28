/**
 * DDInter Provider — Local MongoDB Implementation Unit Tests
 *
 * Tests the local MongoDB-backed DDInterProvider against the synced
 * `drug_interactions` and `drug_aliases` collections.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DDInterProvider } from "../../../src/knowledge/interaction/ddinter-provider.ts";
import type {
  DrugInteractionCheckResult,
  InteractionQueryStatus,
} from "../../../src/knowledge/interaction/drug-interaction-provider.ts";
import { detectMetaPromptLeak, detectFalseReassurance } from "../../../src/safety/validator.ts";

test("DDInterProvider (Local MongoDB)", async (t) => {
  const provider = new DDInterProvider();

  t.after(async () => {
    await provider.close();
  });

  await t.test("healthCheck() returns true when dataset is populated in MongoDB", async () => {
    const healthy = await provider.healthCheck();
    assert.equal(healthy, true, "DDInterProvider health check should return true for synced MongoDB collection");
  });

  await t.test("known interaction: warfarin + ciprofloxacin returns found status with Major severity and clean grounding", async () => {
    const result: DrugInteractionCheckResult = await provider.checkInteractions({
      medicines: ["warfarin", "ciprofloxacin"],
      language: "en",
    });

    assert.equal(result.query_status, "found" satisfies InteractionQueryStatus);
    assert.equal(result.source_name, "DDInter 2.0");
    assert.ok(Array.isArray(result.interactions) && result.interactions.length > 0);

    const pair = result.interactions![0];
    assert.equal(pair.severity, "Major");
    assert.ok(pair.drug_a && pair.drug_b);

    // Task 1: Assert that mechanism & management are NOT fabricated by our provider
    assert.equal(pair.mechanism, undefined, "pair.mechanism must be undefined (not fabricated boilerplate)");
    assert.equal(pair.management, undefined, "pair.management must be undefined (not fabricated boilerplate)");

    // Task 3: Assert that structured citation is attached specifically to the severity fact
    assert.ok(pair.citation, "pair.citation must be present");
    assert.equal(pair.citation.source_name, "DDInter 2.0");
    assert.equal(pair.citation.url, "https://ddinter2.scbdd.com");
    assert.ok(pair.citation.source_id.includes("+"));

    // Task 1 (clean grounding text): states verified fact and asks for clinical explanation without meta-sourcing instructions
    assert.ok(typeof result.summary === "string");
    assert.ok(result.summary.includes("classified as Major") || result.summary.includes("Major"));
    assert.ok(result.summary.includes("Explain the likely clinical mechanism and appropriate precautions in plain, natural language"));

    // Confirm no inline meta-sourcing disclaimers in grounding text
    assert.equal(
      result.summary.includes("DDInter's dataset does not provide"),
      false,
      "Grounding text must not ask model to comment on missing data"
    );
    assert.equal(
      result.summary.includes("using your own medical knowledge"),
      false,
      "Grounding text must not ask model to self-disclose knowledge origin inline"
    );
    assert.equal(
      result.summary.includes("Mechanism: Documented clinical interaction"),
      false,
      "summary must never contain old fabricated mechanism text"
    );
    assert.equal(
      result.summary.includes("Management: Consult a healthcare professional"),
      false,
      "summary must never contain old fabricated management text"
    );
  });

  await t.test("direction independence: [ciprofloxacin, warfarin] returns same interaction as [warfarin, ciprofloxacin]", async () => {
    const resA = await provider.checkInteractions({
      medicines: ["warfarin", "ciprofloxacin"],
      language: "en",
    });
    const resB = await provider.checkInteractions({
      medicines: ["ciprofloxacin", "warfarin"],
      language: "en",
    });

    assert.equal(resA.query_status, "found");
    assert.equal(resB.query_status, "found");
    assert.equal(resA.interactions![0].severity, resB.interactions![0].severity);
    assert.equal(resA.interactions![0].mechanism, undefined);
    assert.equal(resB.interactions![0].mechanism, undefined);
  });

  await t.test("known interaction: warfarin + ibuprofen returns Major severity without fabricated text", async () => {
    const result = await provider.checkInteractions({
      medicines: ["warfarin", "ibuprofen"],
      language: "en",
    });

    assert.equal(result.query_status, "found");
    assert.ok(result.interactions && result.interactions.length > 0);
    assert.equal(result.interactions[0].severity, "Major");
    assert.equal(result.interactions[0].mechanism, undefined);
    assert.equal(result.interactions[0].management, undefined);
  });

  await t.test("known interaction: metformin + cimetidine returns Moderate severity without fabricated text", async () => {
    const result = await provider.checkInteractions({
      medicines: ["metformin", "cimetidine"],
      language: "en",
    });

    assert.equal(result.query_status, "found");
    assert.ok(result.interactions && result.interactions.length > 0);
    assert.equal(result.interactions[0].severity, "Moderate");
    assert.equal(result.interactions[0].mechanism, undefined);
    assert.equal(result.interactions[0].management, undefined);
  });

  await t.test("synonym / brand alias resolution: 'aspirin' resolves to 'acetylsalicylic acid' and matches interaction with warfarin", async () => {
    const result = await provider.checkInteractions({
      medicines: ["aspirin", "warfarin"],
      language: "en",
    });

    assert.equal(result.query_status, "found");
    assert.ok(result.interactions && result.interactions.length > 0);
    assert.equal(result.interactions[0].severity, "Major");
    assert.equal(result.interactions[0].mechanism, undefined);
  });

  await t.test("unknown drug names return not_found (not unreachable)", async () => {
    const result = await provider.checkInteractions({
      medicines: ["xyzzy_drug_that_does_not_exist_12345", "foobar_nonexistent_drug_99999"],
      language: "en",
    });

    assert.equal(result.query_status, "not_found" satisfies InteractionQueryStatus);
    assert.equal(result.interactions, undefined);
  });

  await t.test("ambiguous/unknown severity handling: atorvastatin + metformin generates cautious non-reassuring prompt", async () => {
    const result = await provider.checkInteractions({
      medicines: ["metformin", "atorvastatin"],
      language: "en",
    });

    assert.equal(result.query_status, "found");
    assert.ok(result.interactions && result.interactions.length > 0);
    assert.equal(result.interactions[0].severity, "Unknown");
    assert.ok(typeof result.summary === "string");
    assert.ok(
      result.summary.includes("severity is unclassified") || result.summary.includes("unclassified"),
      "Must state that severity is unclassified"
    );
    assert.ok(
      result.summary.includes("Emphasize that an unclassified severity does not mean the combination is safe or free of risk"),
      "Must explicitly forbid false reassurance"
    );
  });

  await t.test("interface contract: required fields always present and valid", async () => {
    const result = await provider.checkInteractions({
      medicines: ["metformin", "atorvastatin"],
      language: "en",
    });

    assert.ok(Array.isArray(result.medicines));
    assert.ok(["found", "not_found", "unreachable", "unconfigured"].includes(result.query_status));
    assert.equal(typeof result.source_name, "string");
    assert.match(result.retrieved_at, /^\d{4}-\d{2}-\d{2}T/);
  });

  await t.test("automated leak-detection check correctly catches prompt meta-language and paraphrases", () => {
    const leakySamples = [
      "This mechanism is based on general medical knowledge rather than the cited interaction database.",
      "DDInter's dataset does not provide a mechanism for this combination.",
      "According to the cited source, this is major.",
      "I am using my own medical knowledge to explain this.",
      "This explanation is general guidance, not sourced from the database.",
      "As stated, DDInter 2.0 classifies this interaction.",
      "Current data classifies the potential interaction between atorvastatin and metformin as unknown, meaning they are safe.",
      "The database classifies the interaction as unknown.",
      "This information is unspecified in our source data."
    ];

    for (const sample of leakySamples) {
      const check = detectMetaPromptLeak(sample);
      assert.equal(
        check.leaked,
        true,
        `Sample '${sample}' should be flagged as a meta-prompt leak (matched: ${check.matchedPattern})`
      );
    }

    const cleanSamples = [
      "Taking warfarin and ciprofloxacin together carries a major risk of increased bleeding.",
      "Using cimetidine with metformin requires caution because cimetidine can decrease metformin kidney clearance.",
      "Aspirin and warfarin both affect blood clotting, increasing your risk of bleeding.",
      "Please consult your healthcare provider or local pharmacist before taking these medications together."
    ];

    for (const sample of cleanSamples) {
      const check = detectMetaPromptLeak(sample);
      assert.equal(
        check.leaked,
        false,
        `Clean clinical sample '${sample}' should not be flagged as a leak`
      );
    }
  });

  await t.test("false reassurance detector flags unwarranted safety claims for documented interactions", () => {
    const falseReassuranceSamples = [
      "Current data classifies them as unknown, meaning they are generally considered safe to take together.",
      "They are considered safe to combine in all patients.",
      "There is no need to worry about taking these together.",
      "These two drugs do not interfere with each other.",
      "It is fine to take them together without consulting a doctor.",
      "This is a safe combination for daily use."
    ];

    for (const sample of falseReassuranceSamples) {
      const check = detectFalseReassurance(sample);
      assert.equal(
        check.hasFalseReassurance,
        true,
        `Sample '${sample}' should be flagged as false reassurance (matched: ${check.matchedPattern})`
      );
    }

    const cautiousSamples = [
      "Combining these medications requires caution and close monitoring by your doctor.",
      "While an unclassified interaction means the risk level is not fully characterized, you should still consult your pharmacist.",
      "Your physician may adjust your dosage or check kidney function regularly.",
      "Please speak with your prescribing healthcare provider to ensure this combination is appropriate for your health needs."
    ];

    for (const sample of cautiousSamples) {
      const check = detectFalseReassurance(sample);
      assert.equal(
        check.hasFalseReassurance,
        false,
        `Cautious sample '${sample}' should not be flagged as false reassurance`
      );
    }
  });
});
