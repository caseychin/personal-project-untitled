// Task 2 live ingestion run. Explicit slug list, not the full catalog — see
// the Task 2 plan: this PR proves the parser/writer against a small,
// reviewable set rather than a large live scrape before it's proven
// correct. All 77 immersions are ingested as lightweight entities (cheap,
// and explicitly called for by the brief), degree programs are an explicit
// short list.
import { config } from "dotenv";
config({ path: ".env.ingest" });

import { createRateLimitedFetcher } from "../src/ingest/http";
import { createServiceClient } from "../src/ingest/service-client";
import { persistDocument } from "../src/ingest/documents";
import { startRun, finishRun } from "../src/ingest/runs";
import {
  fetchCurriculum,
  fetchMarketingPage,
  fetchImmersionListing,
} from "../src/ingest/sources/programs-api/client";
import { parseCurriculum } from "../src/ingest/sources/programs-api/parse-curriculum";
import { parseCatalogYear } from "../src/ingest/sources/programs-api/parse-catalog-year";
import { parseCanonicalProgramSlug } from "../src/ingest/sources/programs-api/parse-canonical-slug";
import { parseImmersionListing } from "../src/ingest/sources/programs-api/parse-immersion-listing";
import {
  parseImmersionName,
  parseImmersionTotalCredits,
} from "../src/ingest/sources/programs-api/parse-immersion-entity";
import { writeProgramCurriculum } from "../src/ingest/sources/programs-api/write-catalog";
import { writeImmersionEntity } from "../src/ingest/sources/programs-api/write-immersion-entities";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../src/types/supabase";

const DEGREE_PROGRAM_SLUGS = ["computer-science-bs", "software-engineering-bs", "mechanical-engineering-bs"];

/** Fetches, persists the raw payload, and throws on a non-200 response
 * before anything tries to parse what's likely an error page. */
async function fetchPersisted(
  client: SupabaseClient<Database>,
  runId: string,
  fetchFn: () => Promise<{ endpoint: string; requestParams: Record<string, string>; status: number; body: string }>,
): Promise<string> {
  const raw = await fetchFn();
  await persistDocument(client, {
    runId,
    source: "programs_api",
    endpoint: raw.endpoint,
    requestParams: raw.requestParams,
    body: raw.body,
  });
  if (raw.status !== 200) {
    throw new Error(`${raw.endpoint} returned HTTP ${raw.status}`);
  }
  return raw.body;
}

async function main() {
  const client = createServiceClient();
  const fetcher = createRateLimitedFetcher();
  const runId = await startRun(client, "programs_api");

  const stats: Record<string, Json> = { programs: {}, immersions: { attempted: 0, succeeded: 0, failed: 0 } };
  const programStats = stats.programs as Record<string, Json>;
  const immersionStats = stats.immersions as { attempted: number; succeeded: number; failed: number };

  try {
    // Catalog year is a single site-wide value (confirmed identical across a
    // degree program, an immersion, and CS BS during implementation) rather
    // than something fetched per-page — one marketing-page fetch covers the
    // whole run instead of ~170.
    const firstSlug = DEGREE_PROGRAM_SLUGS[0];
    const marketingBody = await fetchPersisted(client, runId, () => fetchMarketingPage(fetcher, firstSlug));
    const catalogYear = parseCatalogYear(marketingBody, firstSlug);
    console.log(`Catalog year: ${catalogYear}`);

    for (const slug of DEGREE_PROGRAM_SLUGS) {
      try {
        const body = await fetchPersisted(client, runId, () => fetchCurriculum(fetcher, slug));
        const parsed = parseCurriculum(body, slug);
        const result = await writeProgramCurriculum(client, { ...parsed, catalogYear }, "major");
        programStats[slug] = { ok: true, ...result };
        console.log(`${slug}: ${result.slotCount} slots, ${result.groupCount} groups, ${result.newCourseCount} new courses`);
      } catch (err) {
        programStats[slug] = { ok: false, error: String(err) };
        console.error(`${slug} failed:`, err);
      }
    }

    const listingBody = await fetchPersisted(client, runId, () => fetchImmersionListing(fetcher));
    const immersions = parseImmersionListing(listingBody);
    console.log(`Found ${immersions.length} immersions`);

    for (const immersion of immersions) {
      immersionStats.attempted += 1;
      try {
        // The /study/ listing slug and the canonical /programs/ curriculum
        // document slug diverge for many immersions (discovered live during
        // implementation — connector words get dropped inconsistently), so
        // resolve the real slug via the marketing page first.
        const marketing = await fetchPersisted(client, runId, () => fetchMarketingPage(fetcher, immersion.slug));
        const canonicalSlug = parseCanonicalProgramSlug(marketing, immersion.slug);

        const body = await fetchPersisted(client, runId, () => fetchCurriculum(fetcher, canonicalSlug));
        const name = parseImmersionName(body, canonicalSlug) || immersion.name;
        const totalCredits = parseImmersionTotalCredits(body);
        await writeImmersionEntity(client, { slug: canonicalSlug, name, catalogYear, totalCredits });
        immersionStats.succeeded += 1;
      } catch (err) {
        immersionStats.failed += 1;
        console.error(`${immersion.slug} failed:`, err);
      }
    }

    await finishRun(client, runId, { status: "succeeded", stats });
    console.log("Done.", JSON.stringify(stats, null, 2));
  } catch (err) {
    await finishRun(client, runId, { status: "failed", stats, error: String(err) });
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
