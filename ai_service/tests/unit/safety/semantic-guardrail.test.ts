import test from "node:test";
import assert from "node:assert/strict";
import { DrugInteractionSemanticGuardrail } from "../../../src/safety/semantic-guardrail.ts";
import type { LlmProvider, LlmGenerateRequest, LlmGenerateResponse } from "../../../src/llm/interface.ts";

test("SemanticGuardrail correctly flags known Folic Acid + Omeprazole false reassurance failure", async () => {
  // Mock LLM provider that simulates the auditor output
  const mockLlm: LlmProvider = {
    name: "mock-auditor",
    async generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
      const promptText = (request as any).messages?.map((m: any) => m.content).join("\n") || (request as any).prompt || "";
      assert.match(promptText, /Folic acid/i);
      assert.match(promptText, /Omeprazole/i);
      assert.match(promptText, /commonly taken together without issue/i);
      
      return {
        content: JSON.stringify({
          has_false_reassurance: true,
          reasoning: "The draft response explicitly claims the drugs do not interfere and can be commonly taken together without issue, which inappropriately reassures the patient despite unclassified database status."
        }),
        tokens_used: 120
      };
    }
  };

  const guardrail = new DrugInteractionSemanticGuardrail(mockLlm);
  const failingDraft = "Folic acid generally does not interfere with your omeprazole prescription, and these two medications are commonly taken together without issue. Omeprazole reduces stomach acid, which can sometimes affect the absorption of certain nutrients like vitamin B12 over long-term use, but it typically does not block folic acid. However, it is always best to double-check with your prescribing doctor or local pharmacist to ensure your specific regimen is safe.";

  const result = await guardrail.auditResponse({
    medicines: ["folic acid", "omeprazole"],
    severityStatus: "Documented clinical interaction (severity unclassified in source data)",
    draftResponse: failingDraft
  });

  assert.equal(result.hasFalseReassurance, true);
  assert.match(result.reasoning, /falsely|reassures|inappropriately|without issue/i);
});

test("SemanticGuardrail passes an appropriately cautious response", async () => {
  const mockLlm: LlmProvider = {
    name: "mock-auditor",
    async generate(): Promise<LlmGenerateResponse> {
      return {
        content: JSON.stringify({
          has_false_reassurance: false,
          reasoning: "The response correctly explains potential interactions and advises professional consultation without asserting safety."
        }),
        tokens_used: 110
      };
    }
  };

  const guardrail = new DrugInteractionSemanticGuardrail(mockLlm);
  const safeDraft = "Cyclosporine and metformin can interact because cyclosporine impacts kidney function, potentially altering how metformin is processed. Because this combination requires careful monitoring by a healthcare professional, you should speak with your doctor or pharmacist.";

  const result = await guardrail.auditResponse({
    medicines: ["cyclosporine", "metformin"],
    severityStatus: "Documented interaction with Unknown severity",
    draftResponse: safeDraft
  });

  assert.equal(result.hasFalseReassurance, false);
});
