import { describe, it, expect } from "vitest";
import { matchAttributes } from "@/ingest/sources/tigercenter/match-attributes";
import type { AttributeIR } from "@/ingest/types";

// A slice of the real advancedSearchData vocabulary (Task 3 live fetch),
// covering both a single-value group (GE) and multi-value groups (PERS,
// ACCS) whose per-course description text doesn't match value_name
// verbatim — the exact situation this module exists to handle.
const VOCAB: AttributeIR[] = [
  { groupCode: "GE", groupName: "Gen Ed Elective", valueCode: "GENED ELEC", valueName: "GE: Elective" },
  { groupCode: "PERS", groupName: "Gen Ed Perspectives Category", valueCode: "ARTISTIC", valueName: "GE: Artistic Perspective" },
  { groupCode: "PERS", groupName: "Gen Ed Perspectives Category", valueCode: "GLOBAL", valueName: "GE: Global Perspective" },
  { groupCode: "PERS", groupName: "Gen Ed Perspectives Category", valueCode: "MATHEMATIC", valueName: "GE: Mathematical Perspective" },
  { groupCode: "ACCS", groupName: "Access Services", valueCode: "NOTETAKE", valueName: "Access Services: Notetaking" },
  { groupCode: "ACCS", groupName: "Access Services", valueCode: "INTERPRET", valueName: "Access Services: Interpreter" },
  { groupCode: "ACCS", groupName: "Access Services", valueCode: "CAPTION", valueName: "Access Services: Captioning" },
];

describe("matchAttributes", () => {
  it("resolves a single-value group by group code alone, ignoring description text mismatch", () => {
    // Real observed text is "General Education Elective", not the vocabulary's "GE: Elective".
    const { matched, unmatched } = matchAttributes({ GE: ["General Education Elective"] }, VOCAB);
    expect(matched).toEqual([{ groupCode: "GE", valueCode: "GENED ELEC" }]);
    expect(unmatched).toEqual([]);
  });

  it("resolves a multi-value group via case-insensitive substring containment (singular/plural mismatch)", () => {
    // Real observed text is "Mathematical Perspectives" (plural); vocab says "Perspective" (singular).
    const { matched, unmatched } = matchAttributes({ PERS: ["Mathematical Perspectives"] }, VOCAB);
    expect(matched).toEqual([{ groupCode: "PERS", valueCode: "MATHEMATIC" }]);
    expect(unmatched).toEqual([]);
  });

  it("resolves a multi-value group even when the description text differs from the vocab phrasing", () => {
    // Real observed text is "Interpreter Services Available" / "Notetaking Services
    // Available" vs. the vocabulary's "Access Services: Interpreter" / "...Notetaking".
    const { matched, unmatched } = matchAttributes(
      { ACCS: ["Interpreter Services Available", "Notetaking Services Available"] },
      VOCAB,
    );
    expect(matched.sort((a, b) => a.valueCode.localeCompare(b.valueCode))).toEqual([
      { groupCode: "ACCS", valueCode: "INTERPRET" },
      { groupCode: "ACCS", valueCode: "NOTETAKE" },
    ]);
    expect(unmatched).toEqual([]);
  });

  it("reports unmatched, never guesses, when the description text doesn't contain-or-is-contained-by any candidate", () => {
    // Real observed text is "Caption Services Available" vs. vocab "Captioning" —
    // close, but neither string contains the other, so this must NOT be guessed.
    const { matched, unmatched } = matchAttributes({ ACCS: ["Caption Services Available"] }, VOCAB);
    expect(matched).toEqual([]);
    expect(unmatched).toEqual([{ groupCode: "ACCS", description: "Caption Services Available", reason: "ambiguous" }]);
  });

  it("reports unmatched for a group code not present in the vocabulary at all", () => {
    const { matched, unmatched } = matchAttributes({ ZZZZ: ["Something Unknown"] }, VOCAB);
    expect(matched).toEqual([]);
    expect(unmatched).toEqual([{ groupCode: "ZZZZ", description: "Something Unknown", reason: "unknown-group" }]);
  });

  it("dedupes a value code matched more than once", () => {
    const { matched } = matchAttributes({ PERS: ["Mathematical Perspectives", "Mathematical Perspectives"] }, VOCAB);
    expect(matched).toEqual([{ groupCode: "PERS", valueCode: "MATHEMATIC" }]);
  });
});
