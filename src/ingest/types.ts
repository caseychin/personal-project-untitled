// Shared intermediate representation for a parsed program curriculum,
// independent of which source produced it. A parser turns raw source HTML
// into this shape; write-catalog.ts turns this shape into catalog_* rows.

export type TermSeason = "fall" | "spring" | "summer" | "intersession";
export type SlotKind = "course" | "placeholder" | "coop";

export type RequirementGroupIR = {
  localId: string;
  title?: string;
  selectCount?: number;
  credits?: number;
  sortOrder: number;
};

export type RequirementSlotIR = {
  yearNumber: number;
  season: TermSeason | null;
  sortOrder: number;
  kind: SlotKind;
  /** kind='course' only */
  courseCode?: string;
  /** kind='course' only — display title as shown in the grid, used to seed a stub catalog_courses row */
  courseTitle?: string;
  /** placeholder/coop, or extra context on a course slot (e.g. an honors alternative) */
  label?: string;
  credits?: number;
  categoryHint?: string;
  notes?: string;
  groupLocalId?: string;
};

export type ParsedProgram = {
  slug: string;
  name: string;
  degree?: string;
  catalogYear: string;
  totalCredits?: number;
  groups: RequirementGroupIR[];
  slots: RequirementSlotIR[];
};

export type ImmersionListingEntry = {
  slug: string;
  name: string;
};

export type ImmersionEntity = {
  slug: string;
  name: string;
  catalogYear: string;
  totalCredits?: number;
};

// TigerCenter IR — a parser turns raw JSON into this shape; a writer turns
// this shape into catalog_* rows. Kept separate from the Programs API IR
// above because the two sources model genuinely different things (course
// facts vs. curriculum structure), not because of a naming collision.

export type TermIR = {
  code: string; // PeopleSoft `strm`, e.g. '2261'
  description: string; // '2026-27 Fall (2261)'
  season: TermSeason | null;
  academicYear: string | null;
  isActive: boolean;
};

export type CollegeIR = { code: string; name: string };
export type SubjectIR = { code: string; name: string; collegeCode: string | null };

export type AttributeIR = {
  groupCode: string;
  groupName: string;
  valueCode: string;
  valueName: string;
};

// One row per (subject, catalogNumber) after deduplicating class-search's
// section-level results on courseId. attributeDescriptions is the union of
// every free-text description seen across that course's sections — matching
// against the vocabulary happens later (see match-attributes.ts), not here.
export type TigerCenterCourseIR = {
  courseId: string; // TigerCenter's numeric id, e.g. '113060'
  subjectCode: string;
  catalogNumber: string;
  title: string;
  description: string | null;
  creditsMin: number | null;
  creditsMax: number | null;
  career: "UGRD" | "GRAD" | null;
  collegeCode: string | null;
  prereqText: string | null;
  attributeDescriptionsByGroup: Record<string, string[]>;
  sectionCount: number;
};
