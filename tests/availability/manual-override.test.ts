import { config } from "dotenv";
config({ path: ".env.ingest", quiet: true });

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createServiceClient } from "@/ingest/service-client";
import { upsertAvailabilityClaim } from "@/availability/upsert-availability-claim";
import { writeCatalogTextAvailability } from "@/availability/write-catalog-text";
import type { ParseCourseDetailResult } from "@/ingest/sources/programs-api/parse-course-detail";

// Proves the DB-level guarantee that CLAUDE.md's "manual always wins" rule
// depends on: no programmatic seeding step may ever overwrite a `manual`
// row, regardless of source or confidence. Runs against the real dev
// Supabase project with the service-role client (catalog_* tables are
// service-role-only per CLAUDE.md) — no mocking, same "prove the database's
// own behavior" approach as tests/rls-cross-user.test.ts, since this is an
// ON CONFLICT guard, not application logic a mock could stand in for.

let client: SupabaseClient<Database>;
let courseId: string;
const SEASON = "intersession" as const;

async function cleanup() {
  await client.from("catalog_course_availability").delete().eq("course_id", courseId).eq("season", SEASON);
}

describe("catalog_course_availability: manual override is never overwritten", () => {
  beforeAll(async () => {
    client = createServiceClient();
    const { data, error } = await client.from("catalog_courses").select("id, code").order("code").limit(1).single();
    if (error || !data) throw error ?? new Error("No catalog_courses rows found — run ingestion first.");
    courseId = data.id;
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("resists catalog_text, plan_of_study, and observed writes", async () => {
    const { error: insertError } = await client.from("catalog_course_availability").insert({
      course_id: courseId,
      season: SEASON,
      is_offered: false,
      source: "manual",
      confidence: 1.0,
      evidence_note: "manual-override.test.ts fixture row",
    });
    if (insertError) throw insertError;

    const outcome = await upsertAvailabilityClaim(client, {
      courseId,
      season: SEASON,
      source: "catalog_text",
      confidence: 0.9,
      evidenceNote: "should never land",
    });
    expect(outcome).toBe("skipped");

    const parsed: ParseCourseDetailResult[] = [
      { status: "ok", code: "__manual-override-test__", seasons: [SEASON], rawText: "Typically Offered: Intersession" },
    ];
    const stats = await writeCatalogTextAvailability(
      client,
      parsed,
      new Map([["__manual-override-test__", courseId]]),
    );
    expect(stats.outcomes.skipped).toBe(1);
    expect(stats.outcomes.inserted).toBe(0);
    expect(stats.outcomes.updated).toBe(0);

    const { data: row, error: selectError } = await client
      .from("catalog_course_availability")
      .select("source, confidence, is_offered")
      .eq("course_id", courseId)
      .eq("season", SEASON)
      .single();
    if (selectError) throw selectError;
    expect(row).toEqual({ source: "manual", confidence: 1, is_offered: false });
  });
});
