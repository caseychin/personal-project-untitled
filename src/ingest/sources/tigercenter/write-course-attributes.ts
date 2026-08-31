// Manual check-then-insert rather than upsert: the uniqueness rule for
// tigercenter-sourced rows lives on a PARTIAL unique index
// (catalog_course_attributes_term_scoped_uniq, where source='tigercenter'),
// and Supabase's upsert() can only target ON CONFLICT against a full
// (non-partial) index/constraint — it has no way to express the index's
// predicate. See migration 0002.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { AttributeMatch } from "@/ingest/sources/tigercenter/match-attributes";

export async function writeCourseAttributes(
  client: SupabaseClient<Database>,
  params: {
    courseId: string;
    termCode: string;
    matches: AttributeMatch[];
    attributeIdByGroupAndValue: Map<string, string>;
  },
): Promise<void> {
  for (const match of params.matches) {
    const attributeId = params.attributeIdByGroupAndValue.get(`${match.groupCode} ${match.valueCode}`);
    if (!attributeId) continue;

    const { data: existing, error: selectError } = await client
      .from("catalog_course_attributes")
      .select("id")
      .eq("course_id", params.courseId)
      .eq("attribute_id", attributeId)
      .eq("term_code", params.termCode)
      .eq("source", "tigercenter")
      .maybeSingle();
    if (selectError) throw selectError;
    if (existing) continue;

    const { error: insertError } = await client.from("catalog_course_attributes").insert({
      course_id: params.courseId,
      attribute_id: attributeId,
      term_code: params.termCode,
      source: "tigercenter",
    });
    if (insertError) throw insertError;
  }
}
