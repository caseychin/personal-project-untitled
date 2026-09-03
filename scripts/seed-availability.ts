// Task 5 live run: populates catalog_course_availability from the
// priority-ordered sources in db/schema.sql's table comment.
//
// Step 1 (catalog_text) is a real ingestion step — the first time anything
// has called proxy-bubble.php — so it runs inside startRun/finishRun with
// persistDocument before parsing, same as Task 2/3's scripts. Steps 2/3
// (plan_of_study, observed) are pure DB-to-DB derivations with no external
// fetch, so — same precedent as Task 4's parse-prereqs.ts — they skip
// ingest_runs bookkeeping entirely.
import { config } from "dotenv";
config({ path: ".env.ingest", quiet: true });

import { createRateLimitedFetcher } from "../src/ingest/http";
import { createServiceClient } from "../src/ingest/service-client";
import { persistDocument } from "../src/ingest/documents";
import { startRun, finishRun } from "../src/ingest/runs";
import { fetchCourseDetail } from "../src/ingest/sources/programs-api/client";
import { parseCourseDetail, type ParseCourseDetailResult } from "../src/ingest/sources/programs-api/parse-course-detail";
import { writeCatalogTextAvailability } from "../src/availability/write-catalog-text";
import { derivePlanOfStudyAvailability } from "../src/availability/derive-plan-of-study";
import { deriveObservedAvailability } from "../src/availability/derive-observed";

async function main() {
  const client = createServiceClient();
  const fetcher = createRateLimitedFetcher();

  const { data: courses, error: coursesError } = await client.from("catalog_courses").select("id, code");
  if (coursesError) throw coursesError;
  const targets = (courses ?? []).filter((c): c is { id: string; code: string } => c.code != null);
  const courseIdByCode = new Map(targets.map((c) => [c.code, c.id]));

  console.log(`--- Step 1: catalog_text (${targets.length} courses via proxy-bubble.php) ---`);
  const runId = await startRun(client, "programs_api");
  let catalogTextStats;
  try {
    const results: ParseCourseDetailResult[] = [];
    for (const course of targets) {
      const raw = await fetchCourseDetail(fetcher, course.code);
      await persistDocument(client, {
        runId,
        source: "programs_api",
        endpoint: raw.endpoint,
        requestParams: raw.requestParams,
        body: raw.body,
      });
      if (raw.status !== 200) {
        console.error(`${course.code}: HTTP ${raw.status}, skipping`);
        continue;
      }
      results.push(parseCourseDetail(raw.body, course.code));
    }

    catalogTextStats = await writeCatalogTextAvailability(client, results, courseIdByCode);
    await finishRun(client, runId, {
      status: "succeeded",
      stats: {
        outcomes: catalogTextStats.outcomes,
        notFound: catalogTextStats.notFound,
        unparsedCount: catalogTextStats.unparsed.length,
      },
    });
  } catch (err) {
    await finishRun(client, runId, { status: "failed", stats: {}, error: String(err) });
    throw err;
  }
  console.log(`catalog_text outcomes:`, catalogTextStats.outcomes);
  console.log(`catalog_text not-found: ${catalogTextStats.notFound}, unparsed: ${catalogTextStats.unparsed.length}`);
  if (catalogTextStats.unparsed.length > 0) {
    console.log(`  unparsed courses (reported, not guessed):`);
    for (const u of catalogTextStats.unparsed) console.log(`    ${u.code}: ${u.reason}`);
  }

  console.log(`\n--- Step 2: plan_of_study (derived from catalog_requirement_slots) ---`);
  const planOfStudyStats = await derivePlanOfStudyAvailability(client);
  console.log(`plan_of_study pairs considered: ${planOfStudyStats.pairsConsidered}`, planOfStudyStats.outcomes);

  console.log(`\n--- Step 3: observed (derived from catalog_course_term_offerings) ---`);
  const observedStats = await deriveObservedAvailability(client);
  console.log(`observed pairs considered: ${observedStats.pairsConsidered}`, observedStats.outcomes);

  console.log(`\nDone.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
