// Accumulate-forward only, per instructions — this run only ever records
// what it observed this term. Whether to also backfill historical terms is
// a separate, still-open schema-decisions.md flag, deliberately untouched
// by Task 3.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { TermSeason } from "@/ingest/types";

export async function writeTermOffering(
  client: SupabaseClient<Database>,
  params: { courseId: string; termCode: string; season: TermSeason | null; sectionCount: number },
): Promise<void> {
  const { error } = await client.from("catalog_course_term_offerings").upsert(
    {
      course_id: params.courseId,
      term_code: params.termCode,
      season: params.season,
      section_count: params.sectionCount,
      observed_at: new Date().toISOString(),
    },
    { onConflict: "course_id,term_code" },
  );
  if (error) throw error;
}
