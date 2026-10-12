import { describe, expectTypeOf, it } from "vitest";
import type { AnomalyResult } from "./anomalies.js";
import type { BetaFitResult } from "./barometric.js";
import type { CorrectedRateInsights } from "./insights.js";
import type { CorrectedRate, DeadFractionResult } from "./live-time.js";
import type { ThresholdSuggestion } from "./noise.js";
import type { Provenance, ResultStatus } from "./provenance.js";
import type { AmplitudeHistogram, MpvFit } from "./spectrum.js";

describe("every exported result type carries status and provenance (CA5)", () => {
  it("has the two fields", () => {
    type R =
      | CorrectedRate
      | DeadFractionResult
      | BetaFitResult
      | AnomalyResult
      | AmplitudeHistogram
      | MpvFit
      | ThresholdSuggestion
      | CorrectedRateInsights;
    expectTypeOf<R["provenance"]>().toEqualTypeOf<Provenance>();
    expectTypeOf<R["status"]>().toEqualTypeOf<ResultStatus>();
  });
});
