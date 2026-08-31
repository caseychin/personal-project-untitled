// Parses advancedSearchData into colleges/subjects/attributes. Shape
// confirmed by a live fetch during Task 3 implementation (not guessed from
// the prose summary in data-sources.md) — see
// tests/fixtures/tigercenter/advanced-search-data.json. Contrary to that
// prose summary, colleges/subjects/attributes are JSON objects keyed by
// code, not arrays, and each college's subjects are nested one level
// deeper, keyed by term code.
import type { AttributeIR, CollegeIR, SubjectIR } from "@/ingest/types";

type AdvancedSearchData = {
  colleges: Record<
    string,
    { id: string; description: string; subjects?: Record<string, Record<string, string>> }
  >;
  attributes: Record<string, { id: string; description: string; attributeValues: Record<string, string> }>;
};

export type ParsedVocabulary = {
  colleges: CollegeIR[];
  subjects: SubjectIR[];
  attributes: AttributeIR[];
};

export function parseAdvancedSearchData(json: string, activeTermCode: string): ParsedVocabulary {
  const parsed = JSON.parse(json) as AdvancedSearchData;

  const colleges: CollegeIR[] = [];
  // A handful of subjects (e.g. COGS, ILLM) are genuinely cross-listed under
  // two colleges in RIT's own data — confirmed live during Task 3
  // implementation, not a parsing bug. Dedupe on subject code, first-wins in
  // college-code sorted order, since subject_code is catalog_subjects'
  // primary key and college affiliation is secondary metadata here, not
  // something either listing is more "correct" about.
  const subjectsByCode = new Map<string, SubjectIR>();
  for (const collegeCode of Object.keys(parsed.colleges).sort()) {
    const college = parsed.colleges[collegeCode];
    colleges.push({ code: collegeCode, name: college.description });
    const subjectsForTerm = college.subjects?.[activeTermCode] ?? {};
    for (const [subjectCode, subjectName] of Object.entries(subjectsForTerm)) {
      if (!subjectsByCode.has(subjectCode)) {
        subjectsByCode.set(subjectCode, { code: subjectCode, name: subjectName, collegeCode });
      }
    }
  }
  const subjects = [...subjectsByCode.values()];

  const attributes: AttributeIR[] = [];
  for (const [groupCode, group] of Object.entries(parsed.attributes)) {
    for (const [valueCode, valueName] of Object.entries(group.attributeValues)) {
      attributes.push({ groupCode, groupName: group.description, valueCode, valueName });
    }
  }

  return { colleges, subjects, attributes };
}
