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
