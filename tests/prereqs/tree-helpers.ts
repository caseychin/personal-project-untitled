import type { PrereqNode } from "@/prereqs/types";

export function course(code: string, minGrade: string | null = null, isCorequisite = false): PrereqNode {
  return { nodeType: "course", code, minGrade, isCorequisite };
}

export function unparsed(rawFragment: string, isCorequisite = false): PrereqNode {
  return { nodeType: "unparsed", rawFragment, isCorequisite };
}

export function group(logic: "AND" | "OR", children: PrereqNode[]): PrereqNode {
  return { nodeType: "group", logic, children };
}
