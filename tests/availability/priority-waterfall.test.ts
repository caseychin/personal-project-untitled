import { config } from "dotenv";
config({ path: ".env.ingest", quiet: true });

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createServiceClient } from "@/ingest/service-client";
import { upsertAvailabilityClaim } from "@/availability/upsert-availability-claim";

// manual-override.test.ts proves `manual` always wins. This covers the rest
// of the waterfall guard in upsert-availability-claim.ts — the
// programmatic-vs-programmatic rank comparisons and the self-refresh case —
// none of which had a regression test before this. An off-by-one in
// PROGRAMMATIC_RANK's `>` comparison would silently let a weaker source
// clobber a stronger one, exactly the class of silent corruption CLAUDE.md's
// "never warn from an inference you can't stand behind" guards against.
// Same live-DB, no-mocking approach as manual-override.test.ts: this is an
// ON CONFLICT-style guard, not logic a mock could stand in for.

let client: SupabaseClient<Database>;
let courseId: string;

const SKIPPED_BY_HIGHER = "fall" as const;
const OVERWRITES_LOWER = "spring" as const;
const SELF_REFRESH = "summer" as const;
const PLAN_BLOCKS_OBSERVED = "intersession" as const;

async function cleanup() {
  await client
    .from("catalog_course_availability")
    .delete()
    .eq("course_id", courseId)
    .in("season", [SKIPPED_BY_HIGHER, OVERWRITES_LOWER, SELF_REFRESH, PLAN_BLOCKS_OBSERVED]);
}

describe("catalog_course_availability: programmatic priority waterfall", () => {
  beforeAll(async () => {
    client = createServiceClient();
    const { data, error } = await client.from("catalog_courses").select("id, code").order("code").limit(1).single();
    if (error || !data) throw error ?? new Error("No catalog_courses rows found — run ingestion first.");
    courseId = data.id;
  });

  beforeEach(cleanup);
  afterAll(cleanup);

  it("skips a lower-priority source when a higher-priority claim already exists", async () => {
    const seeded = await upsertAvailabilityClaim(client, {
      courseId,
      season: SKIPPED_BY_HIGHER,
      source: "catalog_text",
      confidence: 0.9,
      evidenceNote: "seed: catalog_text",
    });
    expect(seeded).toBe("inserted");

    const outcome = await upsertAvailabilityClaim(client, {
      courseId,
      season: SKIPPED_BY_HIGHER,
      source: "plan_of_study",
      confidence: 0.2,
      evidenceNote: "should never land",
    });
    expect(outcome).toBe("skipped");

    const { data: row, error } = await client
      .from("catalog_course_availability")
      .select("source, confidence")
      .eq("course_id", courseId)
      .eq("season", SKIPPED_BY_HIGHER)
      .single();
    if (error) throw error;
    expect(row).toEqual({ source: "catalog_text", confidence: 0.9 });
  });

  it("lets a higher-priority source overwrite an existing lower-priority claim", async () => {
    const seeded = await upsertAvailabilityClaim(client, {
      courseId,
      season: OVERWRITES_LOWER,
      source: "plan_of_study",
      confidence: 0.2,
      evidenceNote: "seed: plan_of_study",
    });
    expect(seeded).toBe("inserted");

    const outcome = await upsertAvailabilityClaim(client, {
      courseId,
      season: OVERWRITES_LOWER,
      source: "catalog_text",
      confidence: 0.9,
      evidenceNote: "should win",
    });
    expect(outcome).toBe("updated");

    const { data: row, error } = await client
      .from("catalog_course_availability")
      .select("source, confidence")
      .eq("course_id", courseId)
      .eq("season", OVERWRITES_LOWER)
      .single();
    if (error) throw error;
    expect(row).toEqual({ source: "catalog_text", confidence: 0.9 });
  });

  it("lets a source refresh its own prior row (observed growing across terms)", async () => {
    const seeded = await upsertAvailabilityClaim(client, {
      courseId,
      season: SELF_REFRESH,
      source: "observed",
      confidence: 0.3,
      evidenceNote: "seed: observed, 1 term",
    });
    expect(seeded).toBe("inserted");

    const outcome = await upsertAvailabilityClaim(client, {
      courseId,
      season: SELF_REFRESH,
      source: "observed",
      confidence: 0.5,
      evidenceNote: "observed, 2 terms",
    });
    expect(outcome).toBe("updated");

    const { data: row, error } = await client
      .from("catalog_course_availability")
      .select("source, confidence")
      .eq("course_id", courseId)
      .eq("season", SELF_REFRESH)
      .single();
    if (error) throw error;
    expect(row).toEqual({ source: "observed", confidence: 0.5 });
  });

  // Documents the current, deliberate (if non-obvious) waterfall order from
  // db/schema.sql's catalog_course_availability comment and
  // schema-decisions.md Decision 6: plan_of_study outranks observed despite
  // observed's confidence being able to grow higher (up to 0.7 vs.
  // plan_of_study's flat 0.2). This is a strict rank waterfall, not a
  // max-confidence merge — see upsert-availability-claim.ts's header comment.
  // If that ordering is ever intentionally flipped, this test should change
  // with it rather than silently start failing.
  it("does not let observed overwrite an existing plan_of_study claim, even at higher confidence", async () => {
    const seeded = await upsertAvailabilityClaim(client, {
      courseId,
      season: PLAN_BLOCKS_OBSERVED,
      source: "plan_of_study",
      confidence: 0.2,
      evidenceNote: "seed: plan_of_study",
    });
    expect(seeded).toBe("inserted");

    const outcome = await upsertAvailabilityClaim(client, {
      courseId,
      season: PLAN_BLOCKS_OBSERVED,
      source: "observed",
      confidence: 0.7,
      evidenceNote: "should still be skipped",
    });
    expect(outcome).toBe("skipped");

    const { data: row, error } = await client
      .from("catalog_course_availability")
      .select("source, confidence")
      .eq("course_id", courseId)
      .eq("season", PLAN_BLOCKS_OBSERVED)
      .single();
    if (error) throw error;
    expect(row).toEqual({ source: "plan_of_study", confidence: 0.2 });
  });
});
