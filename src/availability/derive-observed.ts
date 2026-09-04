// Derives catalog_course_availability rows from catalog_course_term_offerings
// — actual sections seen in a term. This is the source that "grows per
// term" (db/schema.sql's catalog_course_availability comment): confidence is
// a function of how many distinct terms confirmed this (course, season)
// pair, via computeObservedConfidence. Deliberately accumulate-forward only
// (no historical backfill) — see schema-decisions.md's resolved flag.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { upsertAvailabilityClaim, type UpsertOutcome } from "@/availability/upsert-availability-claim";
import { computeObservedConfidence } from "@/availability/confidence";

export type DeriveObservedStats = {
  pairsConsidered: number;
  outcomes: Record<UpsertOutcome, number>;
};

export async function deriveObservedAvailability(client: SupabaseClient<Database>): Promise<DeriveObservedStats> {
  const { data, error } = await client
    .from("catalog_course_term_offerings")
    .select("course_id, season, term_code")
    .not("season", "is", null);
  if (error) throw error;

  const termCodesByPair = new Map<string, { courseId: string; season: Database["public"]["Enums"]["term_season"]; termCodes: Set<string> }>();
  for (const row of data ?? []) {
    if (!row.season) continue;
    const key = `${row.course_id}|${row.season}`;
    const existing = termCodesByPair.get(key);
    if (existing) {
      existing.termCodes.add(row.term_code);
    } else {
      termCodesByPair.set(key, { courseId: row.course_id, season: row.season, termCodes: new Set([row.term_code]) });
    }
  }

  const stats: DeriveObservedStats = {
    pairsConsidered: termCodesByPair.size,
    outcomes: { inserted: 0, updated: 0, skipped: 0 },
  };

  for (const { courseId, season, termCodes } of termCodesByPair.values()) {
    const termCount = termCodes.size;
    const confidence = computeObservedConfidence(termCount);
    const outcome = await upsertAvailabilityClaim(client, {
      courseId,
      season,
      source: "observed",
      confidence,
      evidenceNote: `Observed in ${termCount} tracked term${termCount === 1 ? "" : "s"} (${[...termCodes].sort().join(", ")}).`,
    });
    stats.outcomes[outcome] += 1;
  }

  return stats;
}
