// Derives catalog_course_availability rows from where a program template
// places a course in catalog_requirement_slots — free, already ingested by
// Task 2, no fetching. Weak evidence (0.2): a course being placed in a Fall
// slot doesn't mean it's ONLY offered in Fall, just that it's plausible.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { upsertAvailabilityClaim, type UpsertOutcome } from "@/availability/upsert-availability-claim";
import { PLAN_OF_STUDY_CONFIDENCE } from "@/availability/confidence";

export type DerivePlanOfStudyStats = {
  pairsConsidered: number;
  outcomes: Record<UpsertOutcome, number>;
};

export async function derivePlanOfStudyAvailability(
  client: SupabaseClient<Database>,
): Promise<DerivePlanOfStudyStats> {
  const { data, error } = await client
    .from("catalog_requirement_slots")
    .select("course_id, season")
    .eq("kind", "course")
    .not("course_id", "is", null)
    .not("season", "is", null);
  if (error) throw error;

  const pairs = new Map<string, { courseId: string; season: Database["public"]["Enums"]["term_season"] }>();
  for (const row of data ?? []) {
    if (!row.course_id || !row.season) continue;
    pairs.set(`${row.course_id}|${row.season}`, { courseId: row.course_id, season: row.season });
  }

  const stats: DerivePlanOfStudyStats = {
    pairsConsidered: pairs.size,
    outcomes: { inserted: 0, updated: 0, skipped: 0 },
  };

  for (const { courseId, season } of pairs.values()) {
    const outcome = await upsertAvailabilityClaim(client, {
      courseId,
      season,
      source: "plan_of_study",
      confidence: PLAN_OF_STUDY_CONFIDENCE,
      evidenceNote: "Placed in this season by a program's plan of study template.",
    });
    stats.outcomes[outcome] += 1;
  }

  return stats;
}
