// Resolves course-code leaves (parse-prereq-text.ts's pure output) against
// catalog_courses. A code that doesn't resolve — either because it's a
// numeric non-RIT code ("4003-334"), or because it's a syntactically valid
// RIT course code whose subject was never ingested (confirmed real during
// Task 4 planning: NMTH-260, CSEC-124, IDAI-202 and others reference
// subjects outside the 12 TigerCenter ever pulled) — is demoted to an
// unparsed leaf, never fabricated as a course row. This does not change
// prereq_parse_status: whether a code resolves is a catalog-inventory fact,
// not a parsing outcome (see parse-prereq-text.ts's status contract).
import type { PrereqNode } from "./types";

export type ResolvedNode =
  | { nodeType: "group"; logic: "AND" | "OR"; children: ResolvedNode[] }
  | { nodeType: "course"; requiredCourseId: string; minGrade: string | null; isCorequisite: boolean }
  | { nodeType: "unparsed"; rawFragment: string; isCorequisite: boolean };

export function resolveCourseLeaves(node: PrereqNode, codeToId: ReadonlyMap<string, string>): ResolvedNode {
  if (node.nodeType === "group") {
    return { nodeType: "group", logic: node.logic, children: node.children.map((child) => resolveCourseLeaves(child, codeToId)) };
  }
  if (node.nodeType === "course") {
    const id = codeToId.get(node.code);
    if (id) {
      return { nodeType: "course", requiredCourseId: id, minGrade: node.minGrade, isCorequisite: node.isCorequisite };
    }
    return { nodeType: "unparsed", rawFragment: node.code, isCorequisite: node.isCorequisite };
  }
  return { nodeType: "unparsed", rawFragment: node.rawFragment, isCorequisite: node.isCorequisite };
}
