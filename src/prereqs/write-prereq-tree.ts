import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { PrereqParseStatus } from "./types";
import type { ResolvedNode } from "./resolve-courses";

type PrereqRow = Database["public"]["Tables"]["catalog_course_prerequisites"]["Insert"];

function flatten(node: ResolvedNode, courseId: string, parentId: string | null, sortOrder: number, rows: PrereqRow[]): void {
  const id = randomUUID();
  if (node.nodeType === "group") {
    rows.push({
      id,
      course_id: courseId,
      parent_id: parentId,
      node_type: "group",
      logic: node.logic,
      is_corequisite: false,
      sort_order: sortOrder,
    });
    node.children.forEach((child, index) => flatten(child, courseId, id, index, rows));
    return;
  }
  if (node.nodeType === "course") {
    rows.push({
      id,
      course_id: courseId,
      parent_id: parentId,
      node_type: "course",
      required_course_id: node.requiredCourseId,
      min_grade: node.minGrade,
      is_corequisite: node.isCorequisite,
      sort_order: sortOrder,
    });
    return;
  }
  rows.push({
    id,
    course_id: courseId,
    parent_id: parentId,
    node_type: "unparsed",
    raw_fragment: node.rawFragment,
    is_corequisite: node.isCorequisite,
    sort_order: sortOrder,
  });
}

/** Replaces one course's prerequisite tree (delete + reinsert — idempotent
 * across re-runs of scripts/parse-prereqs.ts) and stamps its parse status. */
export async function writePrereqTree(
  client: SupabaseClient<Database>,
  params: { courseId: string; status: PrereqParseStatus; tree: ResolvedNode | null },
): Promise<void> {
  const { courseId, status, tree } = params;

  const { error: deleteError } = await client.from("catalog_course_prerequisites").delete().eq("course_id", courseId);
  if (deleteError) throw deleteError;

  if (tree) {
    const rows: PrereqRow[] = [];
    flatten(tree, courseId, null, 0, rows);
    if (rows.length > 0) {
      const { error: insertError } = await client.from("catalog_course_prerequisites").insert(rows);
      if (insertError) throw insertError;
    }
  }

  const { error: updateError } = await client
    .from("catalog_courses")
    .update({ prereq_parse_status: status, prereq_parsed_at: new Date().toISOString() })
    .eq("id", courseId);
  if (updateError) throw updateError;
}
