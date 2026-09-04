// Writes catalog_course_availability rows from parsed proxy-bubble.php
// "Typically Offered" text — the highest-priority source (0.9), per
// db/schema.sql's catalog_course_availability comment.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { ParseCourseDetailResult } from "@/ingest/sources/programs-api/parse-course-detail";
import { upsertAvailabilityClaim, type UpsertOutcome } from "@/availability/upsert-availability-claim";
import { CATALOG_TEXT_CONFIDENCE } from "@/availability/confidence";

export type WriteCatalogTextStats = {
  outcomes: Record<UpsertOutcome, number>;
  notFound: number;
  unparsed: { code: string; reason: string }[];
};

export async function writeCatalogTextAvailability(
  client: SupabaseClient<Database>,
  results: ParseCourseDetailResult[],
  courseIdByCode: Map<string, string>,
): Promise<WriteCatalogTextStats> {
  const stats: WriteCatalogTextStats = {
    outcomes: { inserted: 0, updated: 0, skipped: 0 },
    notFound: 0,
    unparsed: [],
  };

  for (const result of results) {
    if (result.status === "not-found") {
      stats.notFound += 1;
      continue;
    }
    if (result.status === "unparsed") {
      stats.unparsed.push({ code: result.code, reason: result.reason });
      continue;
    }

    const courseId = courseIdByCode.get(result.code);
    if (!courseId) {
      // Programs API served detail for a code we don't have a catalog_courses
      // row for yet — report, don't invent a course row here (that's Task
      // 2/3's job, not availability seeding's).
      stats.unparsed.push({ code: result.code, reason: "no matching catalog_courses row" });
      continue;
    }

    for (const season of result.seasons) {
      const outcome = await upsertAvailabilityClaim(client, {
        courseId,
        season,
        source: "catalog_text",
        confidence: CATALOG_TEXT_CONFIDENCE,
        evidenceNote: result.rawText,
      });
      stats.outcomes[outcome] += 1;
    }
  }

  return stats;
}
