// Parses one class-search response page into course-level records,
// deduplicated on courseId — results are section-level (brief's explicit
// warning: "142 CSCI results ≠ 142 courses"). Field shapes confirmed by a
// live fetch during Task 3 implementation — see
// tests/fixtures/tigercenter/class-search-csci-page0.json.
//
// Attribute correlation: class-search also returns attributeKeys/
// attributeDescriptions/attributeValues as separate flat arrays. Verified
// against multiple live courses that these are NOT positionally aligned
// with each other (e.g. ARTH-135: attributeDescriptions[0] = "GE: Artistic
// Perspective" but attributeValues[0] = "GENED ELEC", which is GE's code,
// not PERS's) — a genuine API quirk, not a parsing bug on our end. The only
// trustworthy field is `attributes`, an object keyed by group code with an
// array of free-text descriptions per group. This module only extracts and
// unions that; matching descriptions to specific attribute value codes
// happens in match-attributes.ts, against the vocabulary, with an
// unmatched description logged rather than guessed (CLAUDE.md: never warn
// from — or here, record — an inference you can't stand behind).
import type { TigerCenterCourseIR } from "@/ingest/types";

type ClassSearchResult = {
  subject: string;
  catalogNumber: string;
  courseId: string;
  courseTitleLong: string;
  courseDescription?: string;
  minimumUnits?: number | null;
  maximumUnits?: number | null;
  academicCareer?: "UGRD" | "GRAD" | null;
  academicGroup?: string | null;
  preReqDescrsLong?: string[];
  attributes?: Record<string, string[]>;
};

type ClassSearchResponse = {
  found: number;
  searchResults: ClassSearchResult[];
};

export function parseClassSearchPage(json: string): { found: number; results: ClassSearchResult[] } {
  const parsed = JSON.parse(json) as ClassSearchResponse;
  return { found: parsed.found, results: parsed.searchResults ?? [] };
}

function mergeAttributeDescriptions(
  target: Record<string, string[]>,
  incoming: Record<string, string[]> | undefined,
): void {
  if (!incoming) return;
  for (const [groupCode, descriptions] of Object.entries(incoming)) {
    const existing = target[groupCode] ?? [];
    for (const description of descriptions) {
      if (!existing.includes(description)) existing.push(description);
    }
    target[groupCode] = existing;
  }
}

/** Deduplicates section-level results on courseId, unioning attribute
 * descriptions across sections (different sections of the same course can
 * carry different Access Services tags — see CSCI-141 in the fixture,
 * where only some sections have the Caption Services tag). */
export function dedupeCourses(results: ClassSearchResult[]): TigerCenterCourseIR[] {
  const byCourseId = new Map<string, TigerCenterCourseIR>();

  for (const result of results) {
    const existing = byCourseId.get(result.courseId);
    if (existing) {
      existing.sectionCount += 1;
      mergeAttributeDescriptions(existing.attributeDescriptionsByGroup, result.attributes);
      continue;
    }
    const attributeDescriptionsByGroup: Record<string, string[]> = {};
    mergeAttributeDescriptions(attributeDescriptionsByGroup, result.attributes);
    byCourseId.set(result.courseId, {
      courseId: result.courseId,
      subjectCode: result.subject,
      catalogNumber: result.catalogNumber,
      title: result.courseTitleLong,
      description: result.courseDescription ?? null,
      creditsMin: result.minimumUnits ?? null,
      creditsMax: result.maximumUnits ?? null,
      career: result.academicCareer ?? null,
      collegeCode: result.academicGroup ?? null,
      prereqText: result.preReqDescrsLong?.length ? result.preReqDescrsLong.join(" ") : null,
      attributeDescriptionsByGroup,
      sectionCount: 1,
    });
  }

  return [...byCourseId.values()];
}
