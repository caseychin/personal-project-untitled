import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseCurriculum } from "@/ingest/sources/programs-api/parse-curriculum";
import { parseCatalogYear } from "@/ingest/sources/programs-api/parse-catalog-year";
import type { RequirementSlotIR, TermSeason } from "@/ingest/types";

// Acceptance test for Task 2: the CS BS program reconstructs to match
// CSUndergradFlowChart.pdf — same courses, years, terms, co-op placement,
// correct total credits. The PDF is a 2023-2024 snapshot; the fixture below
// is a live 2026-08-28 capture, which turned out to differ from the PDF in
// real, confirmed ways (honors CSCI-262/261 alternatives, the CS Elective
// 1-4 + cluster-footnote structure replacing "CS Elective"/"CS Cluster
// Elective", CSCI-472 now explicitly required rather than a 471-or-472
// choice) — a genuine curriculum revision, not a parser bug. This fixture,
// hand-verified against the raw HTML itself, is the ground truth; the PDF
// confirmed the overall shape (5-year plan, 3 co-op blocks, Gen Ed
// Immersion/Perspective placeholders) but is not asserted against literally.

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../fixtures/programs-api/${name}`, import.meta.url)), "utf8");
}

type ExpectedSlot = Partial<RequirementSlotIR> & Pick<RequirementSlotIR, "kind">;

function term(year: number, season: TermSeason, defs: ExpectedSlot[]): RequirementSlotIR[] {
  return defs.map((d, sortOrder) => ({ yearNumber: year, season, sortOrder, ...d }) as RequirementSlotIR);
}
function course(code: string, courseTitle: string, credits: number, notes?: string): ExpectedSlot {
  const categoryHint = code.startsWith("MATH-")
    ? "Math"
    : code.startsWith("YOPS-")
      ? "First Year Requirement"
      : "CS/SWE";
  return { kind: "course", courseCode: code, courseTitle, credits, notes, categoryHint };
}
function coop(code: string, courseTitle: string): ExpectedSlot {
  return { kind: "coop", courseCode: code, courseTitle, credits: 0, categoryHint: "Co-op" };
}
function placeholder(label: string, credits: number, categoryHint?: string): ExpectedSlot {
  return { kind: "placeholder", label, credits, categoryHint };
}

const EXPECTED_SLOTS: RequirementSlotIR[] = [
  ...term(1, "fall", [
    course("CSCI-141", "Computer Science I", 4),
    course("MATH-181", "Calculus I (fulfills General Education: Mathematical Perspective A)", 4),
    placeholder("General Education: First Year Writing (WI)", 3, "Gen Ed"),
    placeholder("General Education: Artistic Perspective", 3, "Gen Ed"),
    placeholder("General Education: Global Perspective", 3, "Gen Ed"),
    course("YOPS-10", "RIT 365: RIT Connections", 0),
  ]),
  ...term(1, "spring", [
    course("CSCI-142", "Computer Science II", 4),
    course("MATH-182", "Calculus II (fulfills General Education: Mathematical Perspective B)", 4),
    course("MATH-190", "Discrete Mathematics for Computing (General Education: Elective)", 3),
    placeholder("General Education: Ethical Perspective", 3, "Gen Ed"),
    placeholder("General Education: Social Perspective", 3, "Gen Ed"),
  ]),
  ...term(2, "fall", [
    course("CSCI-99", "Undergraduate Cooperative Education Seminar", 0),
    course("CSCI-243", "The Mechanics of Programming", 3),
    course(
      "CSCI-262",
      "Introduction to Computer Science Theory",
      3,
      "or CSCI-263 (Honors Introduction to Computer Science Theory)",
    ),
    course("MATH-251", "Probability and Statistics (General Education: Elective)", 3),
    placeholder("General Education: Natural Science Inquiry Perspective (Lab Science 1)", 4, "Science"),
    placeholder("General Education: Elective", 3, "Gen Ed"),
  ]),
  ...term(2, "spring", [
    course("CSCI-261", "Analysis of Algorithms", 3, "or CSCI-264 (Honors Analysis of Algorithms)"),
    course("MATH-241", "Linear Algebra (General Education: Elective)", 3),
    course("SWEN-261", "Introduction to Software Engineering", 3),
    placeholder("General Education: Scientific Principles Perspective", 3, "Gen Ed"),
    placeholder("General Education: Elective (Lab Science 2)", 4, "Science"),
  ]),
  ...term(2, "summer", [coop("CSCI-488", "CS Undergraduate Summer Co-op")]),
  ...term(3, "fall", [
    course("CSCI-250", "Concepts of Computer Systems", 3),
    course("CSCI-320", "Principles of Data Management", 3),
    course("CSCI-331", "Introduction to Artificial Intelligence", 3),
    placeholder("General Education: Immersion 1 (WI)", 3, "Gen Ed"),
    placeholder("Open Elective", 3, "Open Elective"),
  ]),
  ...term(3, "spring", [coop("CSCI-499", "Computer Science Undergraduate Co-op")]),
  ...term(4, "fall", [
    course("CSCI-251", "Concepts of Parallel and Distributed Systems", 3),
    course("CSCI-344", "Programming Language Concepts", 3),
    placeholder("CS Elective Course 1", 3, "CS/SWE"),
    placeholder("General Education: Immersion 2", 3, "Gen Ed"),
    placeholder("Open Elective", 3, "Open Elective"),
  ]),
  ...term(4, "spring", [
    course("CSCI-472", "Historical & Current Perspectives in Computer Science (WI-PR)", 3),
    placeholder("CS Elective Course 2", 3, "CS/SWE"),
    placeholder("CS Elective Course 3", 3, "CS/SWE"),
    placeholder("Open Electives", 6, "Open Elective"),
  ]),
  ...term(5, "fall", [coop("CSCI-499", "Computer Science Undergraduate Co-op")]),
  ...term(5, "spring", [
    placeholder("CS Elective Course 4", 3, "CS/SWE"),
    placeholder("General Education: Immersion 3", 3, "Gen Ed"),
    placeholder("General Education: Elective", 3, "Gen Ed"),
    placeholder("Open Electives", 6, "Open Elective"),
  ]),
];

describe("parseCurriculum: Computer Science BS", () => {
  const html = fixture("computer-science-bs-curriculum.html");
  const parsed = parseCurriculum(html, "computer-science-bs");

  it("extracts the program name and degree", () => {
    expect(parsed.name).toBe("Computer Science BS");
    expect(parsed.degree).toBe("BS");
  });

  it("reconstructs every slot: same courses, years, terms, and co-op placement as the source curriculum", () => {
    expect(parsed.slots).toEqual(EXPECTED_SLOTS);
  });

  it("sums to the correct total credits", () => {
    expect(parsed.totalCredits).toBe(126);
  });

  it("places co-op blocks exactly where the reference PDF shows them: one Summer co-op after year 2, two Semester co-ops (year 3 spring, year 5 fall)", () => {
    const coops = parsed.slots.filter((s) => s.kind === "coop");
    expect(coops).toEqual([
      { yearNumber: 2, season: "summer", sortOrder: 0, ...coop("CSCI-488", "CS Undergraduate Summer Co-op") },
      { yearNumber: 3, season: "spring", sortOrder: 0, ...coop("CSCI-499", "Computer Science Undergraduate Co-op") },
      { yearNumber: 5, season: "fall", sortOrder: 0, ...coop("CSCI-499", "Computer Science Undergraduate Co-op") },
    ]);
  });
});

describe("parseCatalogYear", () => {
  it("extracts the catalog year from the marketing page's 'Curriculum for {year}' heading", () => {
    const html = fixture("computer-science-bs-marketing.html");
    expect(parseCatalogYear(html, "computer-science-bs")).toBe("2026-2027");
  });
});
