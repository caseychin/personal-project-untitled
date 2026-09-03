import { describe, it, expect } from "vitest";
import { computeObservedConfidence, CATALOG_TEXT_CONFIDENCE, PLAN_OF_STUDY_CONFIDENCE } from "@/availability/confidence";

describe("computeObservedConfidence", () => {
  // This is the Task 5 acceptance criterion, as a regression test: no course
  // may claim confidence > 0.5 on the strength of a single observed term.
  it("keeps a single observed term safely under the 0.5 warn-only bar", () => {
    expect(computeObservedConfidence(1)).toBe(0.3);
    expect(computeObservedConfidence(1)).toBeLessThanOrEqual(0.5);
  });

  it("grows by 0.2 per additional confirming term", () => {
    expect(computeObservedConfidence(2)).toBe(0.5);
  });

  it("caps at 0.7, staying below catalog_text's 0.9", () => {
    expect(computeObservedConfidence(3)).toBe(0.7);
    expect(computeObservedConfidence(4)).toBe(0.7);
    expect(computeObservedConfidence(50)).toBe(0.7);
    expect(computeObservedConfidence(3)).toBeLessThan(CATALOG_TEXT_CONFIDENCE);
  });

  it("throws rather than silently accepting a non-positive term count", () => {
    expect(() => computeObservedConfidence(0)).toThrow();
    expect(() => computeObservedConfidence(-1)).toThrow();
  });
});

describe("flat confidences", () => {
  it("catalog_text is the highest programmatic confidence", () => {
    expect(CATALOG_TEXT_CONFIDENCE).toBe(0.9);
    expect(CATALOG_TEXT_CONFIDENCE).toBeGreaterThan(PLAN_OF_STUDY_CONFIDENCE);
  });

  it("plan_of_study stays weak and under the warn-only bar", () => {
    expect(PLAN_OF_STUDY_CONFIDENCE).toBe(0.2);
    expect(PLAN_OF_STUDY_CONFIDENCE).toBeLessThanOrEqual(0.5);
  });
});
