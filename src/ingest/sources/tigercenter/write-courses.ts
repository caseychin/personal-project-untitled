// Enriches/reconciles catalog_courses from TigerCenter data. Reconciliation
// is just the upsert itself: Decision 4 (schema-decisions.md) already made
// (subject_code, catalog_number) the business key both sources agree on, so
// matching an existing Task 2 stub row IS looking it up by that key — no
// separate matching step needed. A stub row gets its real fields filled in;
// a course TigerCenter finds that Task 2 never stubbed gets inserted fresh.
//
// `source` is deliberately left untouched on an update — it records which
// adapter created the row, not which adapter last touched it.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { TigerCenterCourseIR } from "@/ingest/types";

export type WriteCourseResult = { courseId: string; isNew: boolean };

export async function writeCourseFromTigerCenter(
  client: SupabaseClient<Database>,
  course: TigerCenterCourseIR,
  termCode: string,
): Promise<WriteCourseResult> {
  const { error: subjectError } = await client
    .from("catalog_subjects")
    .upsert(
      { code: course.subjectCode, name: course.subjectCode },
      { onConflict: "code", ignoreDuplicates: true },
    );
  if (subjectError) throw subjectError;

  const { data: existing, error: selectError } = await client
    .from("catalog_courses")
    .select("id")
    .eq("subject_code", course.subjectCode)
    .eq("catalog_number", course.catalogNumber)
    .maybeSingle();
  if (selectError) throw selectError;

  const enrichedFields = {
    title: course.title,
    description: course.description,
    credits_min: course.creditsMin,
    credits_max: course.creditsMax,
    career: course.career,
    college_code: course.collegeCode,
    prereq_text: course.prereqText,
    tigercenter_course_id: course.courseId,
    last_seen_term: termCode,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error: updateError } = await client.from("catalog_courses").update(enrichedFields).eq("id", existing.id);
    if (updateError) throw updateError;
    return { courseId: existing.id, isNew: false };
  }

  const { data: inserted, error: insertError } = await client
    .from("catalog_courses")
    .insert({
      subject_code: course.subjectCode,
      catalog_number: course.catalogNumber,
      source: "tigercenter",
      ...enrichedFields,
    })
    .select("id")
    .single();
  if (insertError || !inserted) throw insertError ?? new Error("catalog_courses insert returned no row");
  return { courseId: inserted.id, isNew: true };
}
