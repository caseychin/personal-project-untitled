// Confidence values for catalog_course_availability, per the seeding
// priority documented in db/schema.sql's catalog_course_availability
// comment and schema-decisions.md Decision 6. catalog_text/plan_of_study are
// flat; manual is never computed here (human-only, always 1.0). observed is
// the only source that grows — the formula's shape ("0.3 + 0.2 per
// additional confirming term, capped") is from the schema comment; the 0.7
// cap is chosen here so `observed` never reaches catalog_text's 0.9, even
// after many terms — explicit catalog text always outranks inferred section
// history.
//
// The one hard acceptance bar (Task 5): a single observed term must never
// produce confidence > 0.5. 0.3 for termCount=1 satisfies this with room to
// spare — see tests/availability/confidence.test.ts.
export const CATALOG_TEXT_CONFIDENCE = 0.9;
export const PLAN_OF_STUDY_CONFIDENCE = 0.2;

const OBSERVED_BASE = 0.3;
const OBSERVED_STEP = 0.2;
const OBSERVED_CAP = 0.7;

export function computeObservedConfidence(termCount: number): number {
  if (termCount < 1) throw new Error(`termCount must be >= 1, got ${termCount}`);
  const raw = OBSERVED_BASE + OBSERVED_STEP * (termCount - 1);
  return Math.min(raw, OBSERVED_CAP);
}
