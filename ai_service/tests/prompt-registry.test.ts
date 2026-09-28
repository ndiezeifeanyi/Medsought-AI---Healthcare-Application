import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/configuration/config.ts";
import { PROMPT_KEYS, PromptRegistry } from "../src/prompts/prompt-registry.ts";

test("loads every required versioned prompt", () => {
  const config = loadConfig({});
  const registry = new PromptRegistry(config.prompt_dir);

  for (const key of PROMPT_KEYS) {
    const prompt = registry.load(key);
    assert.equal(prompt.key, key);
    assert.equal(prompt.version, "v1");
    assert.ok(prompt.template.length > 20);
  }
});

test("drug prompts require approved evidence instead of internal model knowledge", () => {
  const config = loadConfig({});
  const registry = new PromptRegistry(config.prompt_dir);

  const prompt = registry.load("drug_information_response").template;
  assert.match(prompt, /approved retrieved source material/i);
  assert.match(prompt, /Do not add medical facts/i);
});
