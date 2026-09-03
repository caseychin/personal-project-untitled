// Shared conflict-resolution for catalog_course_availability, used by all
// three programmatic sources (catalog_text, plan_of_study, observed).
//
// The seeding priority in db/schema.sql's table comment — catalog_text ->
// plan_of_study -> observed -> manual — is a strict waterfall, not a
// max-confidence merge: a higher-priority source's claim is never
// overwritten by a lower-priority one. `manual` is written only by hand
// (never by this function) and always wins.
//
// Supabase-js's upsert() can't express "only update if the existing row's
// source is at or below my rank" — there's no way to attach a WHERE
// predicate to the ON CONFLICT DO UPDATE it generates. So this does a manual
// select-then-branch, the same pattern write-course-attributes.ts uses for
// a related upsert() limitation (partial unique indexes).
//
// One nuance: a source is allowed to overwrite an *existing row of its own
// source* (rank comparison is `<=`, not `<`). This is what lets `observed`
// refresh its confidence across repeated runs as more terms accumulate,
// without that self-refresh ever letting it clobber a higher-priority
// source.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

type AvailabilitySource = Database["public"]["Enums"]["availability_source"];
type TermSeason = Database["public"]["Enums"]["term_season"];

const PROGRAMMATIC_RANK: Record<Exclude<AvailabilitySource, "manual">, number> = {
  catalog_text: 1,
  plan_of_study: 2,
  observed: 3,
};

export type AvailabilityClaim = {
  courseId: string;
  season: TermSeason;
  source: Exclude<AvailabilitySource, "manual">;
  confidence: number;
  evidenceNote: string;
};

export type UpsertOutcome = "inserted" | "updated" | "skipped";

export async function upsertAvailabilityClaim(
  client: SupabaseClient<Database>,
  claim: AvailabilityClaim,
): Promise<UpsertOutcome> {
  const { data: existing, error: selectError } = await client
    .from("catalog_course_availability")
    .select("source")
    .eq("course_id", claim.courseId)
    .eq("season", claim.season)
    .maybeSingle();
  if (selectError) throw selectError;

  const row = {
    course_id: claim.courseId,
    season: claim.season,
    is_offered: true,
    source: claim.source,
    confidence: claim.confidence,
    evidence_note: claim.evidenceNote,
    updated_at: new Date().toISOString(),
  };

  if (!existing) {
    const { error } = await client.from("catalog_course_availability").insert(row);
    if (error) throw error;
    return "inserted";
  }

  if (existing.source === "manual") return "skipped";
  if (PROGRAMMATIC_RANK[claim.source] > PROGRAMMATIC_RANK[existing.source as Exclude<AvailabilitySource, "manual">]) {
    return "skipped";
  }

  const { error } = await client
    .from("catalog_course_availability")
    .update(row)
    .eq("course_id", claim.courseId)
    .eq("season", claim.season);
  if (error) throw error;
  return "updated";
}
