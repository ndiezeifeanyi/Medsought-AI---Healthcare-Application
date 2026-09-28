import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/configuration/config.ts";
import { ConversationProcessor } from "../src/conversation/processor.ts";
import { MockTranslator } from "../src/translation/providers/mock-translator.ts";
import { SyntheticDrugInformationProvider } from "./fixtures/synthetic-drug-information-provider.ts";

test("processes non-English request using translator and preserves medicine terms", async () => {
  const provider = new SyntheticDrugInformationProvider();
  const translator = new MockTranslator();
  const processor = new ConversationProcessor({ config: loadConfig({}), drugInformationProvider: provider, translator });

  // Simulate user sending Yoruba text but containing a medicine name
  const result = await processor.process({
    conversation_id: "conv-multi",
    user_id: "user-1",
    message: "Nibo ni MO ti le ri Augmentin?",
    message_type: "text",
    language: "yo",
    context: {}
  });

  assert.equal(result.intent, "medicine_search");
  // Response should be translated back to Yoruba by MockTranslator (it appends [translated->yo])
  assert.match(result.response || "", /translated->yo|Augmentin/);
  assert.equal(result.actions.length, 1);
  // @ts-ignore
  assert.equal(result.actions[0].payload.medicine, "Augmentin");
});
