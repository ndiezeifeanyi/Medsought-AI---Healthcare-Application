import type {
  DrugInformationProvider,
  DrugInformationResult,
  DrugInteractionLookupRequest,
  DrugInteractionResult,
  DrugLookupRequest,
  MedicineResolutionRequest,
  MedicineResolutionResult
} from "../../src/knowledge/drug-information-provider.ts";

const SYNTHETIC_SOURCE = {
  source_id: "synthetic-phase2-fixture",
  source_name: "Synthetic Phase 2 Test Fixture",
  retrieved_at: "2026-08-16T00:00:00.000Z"
};

export class SyntheticDrugInformationProvider implements DrugInformationProvider {
  readonly name = "synthetic-fixture";

  async resolveMedicine(request: MedicineResolutionRequest): Promise<MedicineResolutionResult> {
    if (/^alphamed$/i.test(request.medicine_name) || /^alphamd$/i.test(request.medicine_name)) {
      return {
        input: request.medicine_name,
        found: true,
        resolved_name: "AlphaMed",
        confidence: /^alphamed$/i.test(request.medicine_name) ? 0.98 : 0.82,
        candidates: [{ name: "AlphaMed", confidence: 0.82 }],
        source_name: SYNTHETIC_SOURCE.source_name
      };
    }

    if (/^betamed$/i.test(request.medicine_name)) {
      return {
        input: request.medicine_name,
        found: true,
        resolved_name: "BetaMed",
        confidence: 0.97,
        candidates: [{ name: "BetaMed", confidence: 0.97 }],
        source_name: SYNTHETIC_SOURCE.source_name
      };
    }

    if (/^nodatamed$/i.test(request.medicine_name)) {
      return {
        input: request.medicine_name,
        found: true,
        resolved_name: "NoDataMed",
        confidence: 0.97,
        candidates: [{ name: "NoDataMed", confidence: 0.97 }],
        source_name: SYNTHETIC_SOURCE.source_name
      };
    }

    if (/^emptyinfo$/i.test(request.medicine_name)) {
      return {
        input: request.medicine_name,
        found: true,
        resolved_name: "EmptyInfo",
        confidence: 0.98,
        candidates: [],
        source_name: SYNTHETIC_SOURCE.source_name
      };
    }

    return {
      input: request.medicine_name,
      found: false,
      confidence: 0,
      candidates: [],
      source_name: SYNTHETIC_SOURCE.source_name
    };
  }

  async getDrugInformation(request: DrugLookupRequest): Promise<DrugInformationResult> {
    if (request.medicine_name === "EmptyInfo") {
      return {
        medicine_name: request.medicine_name,
        normalized_name: request.medicine_name,
        found: true,
        topics: {},
        citations: [SYNTHETIC_SOURCE]
      };
    }

    if (request.medicine_name !== "AlphaMed" && request.medicine_name !== "BetaMed" && request.medicine_name !== "NoDataMed") {
      return {
        medicine_name: request.medicine_name,
        found: false,
        topics: {},
        citations: []
      };
    }

    if (request.medicine_name === "NoDataMed") {
      return {
        medicine_name: request.medicine_name,
        normalized_name: "NoDataMed",
        found: true,
        topics: {
          overview: "Synthetic approved overview text for NoDataMed."
        },
        citations: [SYNTHETIC_SOURCE]
      };
    }

    return {
      medicine_name: request.medicine_name,
      normalized_name: request.medicine_name,
      found: true,
      topics: {
        overview: `Synthetic approved overview text for ${request.medicine_name}.`,
        uses: `Synthetic approved uses text for ${request.medicine_name}.`,
        side_effects: `Synthetic approved side-effect text for ${request.medicine_name}.`,
        contraindications: `Synthetic approved contraindication text for ${request.medicine_name}.`,
        pregnancy_warnings: `Synthetic approved pregnancy-warning text for ${request.medicine_name}.`,
        storage: `Synthetic approved storage text for ${request.medicine_name}.`,
        dosage: `Synthetic approved dosage text for ${request.medicine_name}.`
      },
      citations: [SYNTHETIC_SOURCE]
    };
  }

  async getDrugInteractions(request: DrugInteractionLookupRequest): Promise<DrugInteractionResult> {
    const medicines = [...request.medicines].sort();
    if (medicines.includes("NoDataMed")) {
      return {
        medicines: request.medicines,
        found: false,
        citations: []
      };
    }

    if (medicines.join("|") === "AlphaMed|BetaMed") {
      return {
        medicines: request.medicines,
        found: true,
        summary: "Synthetic approved interaction summary for AlphaMed and BetaMed.",
        citations: [SYNTHETIC_SOURCE]
      };
    }

    return {
      medicines: request.medicines,
      found: false,
      citations: []
    };
  }
}
