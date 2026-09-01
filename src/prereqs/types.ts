// In-memory prerequisite tree shape, before DB ids are assigned and before
// course codes are resolved against catalog_courses. Mirrors the shape of
// catalog_course_prerequisites (db/schema.sql) minus id/course_id/parent_id.

export type PrereqParseStatus = "none" | "parsed" | "partial" | "failed";

export interface CourseLeaf {
  nodeType: "course";
  /** Normalized course code, e.g. "CSCI-243". Resolved against catalog_courses
   * by resolve-courses.ts — not guaranteed to exist yet at parse time. */
  code: string;
  minGrade: string | null;
  isCorequisite: boolean;
}

export interface UnparsedLeaf {
  nodeType: "unparsed";
  /** The exact substring this leaf came from — always retained, per
   * CLAUDE.md's "never silently drop" rule. */
  rawFragment: string;
  isCorequisite: boolean;
}

export interface GroupNode {
  nodeType: "group";
  logic: "AND" | "OR";
  children: PrereqNode[];
}

export type PrereqNode = CourseLeaf | UnparsedLeaf | GroupNode;

export interface ParseResult {
  status: PrereqParseStatus;
  /** null only when status === "none" (nothing to represent). */
  tree: PrereqNode | null;
}
