// Task 3 live ingestion run. Subject scope is derived from the stub rows
// Task 2 already created (distinct subject_code in catalog_courses) rather
// than RIT's full ~150-subject catalog — this directly targets the
// acceptance bar ("every course referenced by the CS BS curriculum
// resolves...") without a first run that bulk-scrapes subjects nothing
// references. Requires Task 2's ingest:programs to have run at least once.
import { config } from "dotenv";
config({ path: ".env.ingest" });

import { createRateLimitedFetcher } from "../src/ingest/http";
import { createServiceClient } from "../src/ingest/service-client";
import { persistDocument } from "../src/ingest/documents";
import { startRun, finishRun } from "../src/ingest/runs";
import {
  fetchMaintenance,
  fetchCurrentTerms,
  fetchAdvancedSearchData,
  fetchClassSearch,
} from "../src/ingest/sources/tigercenter/client";
import { parseCurrentTerms } from "../src/ingest/sources/tigercenter/parse-terms";
import { parseAdvancedSearchData } from "../src/ingest/sources/tigercenter/parse-vocabulary";
import { parseClassSearchPage, dedupeCourses } from "../src/ingest/sources/tigercenter/parse-class-search";
import { matchAttributes } from "../src/ingest/sources/tigercenter/match-attributes";
import { writeTerms } from "../src/ingest/sources/tigercenter/write-terms";
import { writeVocabulary } from "../src/ingest/sources/tigercenter/write-vocabulary";
import { writeCourseFromTigerCenter } from "../src/ingest/sources/tigercenter/write-courses";
import { writeCourseAttributes } from "../src/ingest/sources/tigercenter/write-course-attributes";
import { writeTermOffering } from "../src/ingest/sources/tigercenter/write-term-offerings";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../src/types/supabase";
import type { AttributeIR, TigerCenterCourseIR } from "../src/ingest/types";

const ROWS_PER_PAGE = 100; // matches the frontend's own max; the real server ceiling is 140 (Task 0.4)

async function fetchPersisted(
  client: SupabaseClient<Database>,
  runId: string,
  fetchFn: () => Promise<{ endpoint: string; requestParams: Record<string, unknown>; status: number; body: string }>,
): Promise<string> {
  const raw = await fetchFn();
  await persistDocument(client, {
    runId,
    source: "tigercenter",
    endpoint: raw.endpoint,
    requestParams: raw.requestParams as Record<string, Json>,
    body: raw.body,
  });
  if (raw.status !== 200) {
    throw new Error(`${raw.endpoint} returned HTTP ${raw.status}`);
  }
  return raw.body;
}

async function loadAttributeIdMap(client: SupabaseClient<Database>): Promise<Map<string, string>> {
  const { data, error } = await client.from("catalog_attributes").select("id, group_code, value_code");
  if (error) throw error;
  return new Map((data ?? []).map((row) => [`${row.group_code} ${row.value_code}`, row.id]));
}

async function loadSubjectScope(client: SupabaseClient<Database>): Promise<string[]> {
  const { data, error } = await client.from("catalog_courses").select("subject_code");
  if (error) throw error;
  const subjects = [...new Set((data ?? []).map((row) => row.subject_code))].sort();
  if (subjects.length === 0) {
    throw new Error(
      "No catalog_courses rows found — run `npm run ingest:programs` first. " +
        "Task 3 scopes its TigerCenter subject search to whatever Task 2 already stubbed.",
    );
  }
  return subjects;
}

async function fetchAllSectionsForSubject(
  client: SupabaseClient<Database>,
  runId: string,
  fetcher: ReturnType<typeof createRateLimitedFetcher>,
  subject: string,
  term: string,
) {
  const allResults: ReturnType<typeof parseClassSearchPage>["results"] = [];
  let pageNumber = 0;
  for (;;) {
    const body = await fetchPersisted(client, runId, () =>
      fetchClassSearch(fetcher, { subject, term, rows: ROWS_PER_PAGE, pageNumber }),
    );
    const { found, results } = parseClassSearchPage(body);
    allResults.push(...results);
    pageNumber += 1;
    if (results.length === 0 || pageNumber * ROWS_PER_PAGE >= found) break;
  }
  return allResults;
}

async function reportCsBsGaps(client: SupabaseClient<Database>): Promise<string[]> {
  const { data: program } = await client
    .from("catalog_programs")
    .select("id")
    .eq("slug", "computer-science-bs")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!program) return ["computer-science-bs program not found — was ingest:programs ever run?"];

  const { data: slots, error } = await client
    .from("catalog_requirement_slots")
    .select("course_id, catalog_courses(code, title, description, credits_min)")
    .eq("program_id", program.id)
    .eq("kind", "course")
    .not("course_id", "is", null);
  if (error) throw error;

  const gaps: string[] = [];
  for (const slot of slots ?? []) {
    const course = slot.catalog_courses as { code: string | null; title: string; description: string | null; credits_min: number | null } | null;
    if (!course) continue;
    const missing: string[] = [];
    if (!course.title) missing.push("title");
    if (!course.description) missing.push("description");
    if (course.credits_min === null) missing.push("credits");
    if (missing.length > 0) gaps.push(`${course.code ?? "?"}: missing ${missing.join(", ")}`);
  }
  return gaps;
}

async function main() {
  const client = createServiceClient();
  const fetcher = createRateLimitedFetcher();
  const runId = await startRun(client, "tigercenter");

  const stats: Record<string, Json> = { subjects: {} };
  const subjectStats = stats.subjects as Record<string, Json>;

  try {
    const maintenanceBody = await fetchPersisted(client, runId, () => fetchMaintenance(fetcher));
    const maintenance = JSON.parse(maintenanceBody) as { searchDown?: boolean };
    if (maintenance.searchDown) {
      throw new Error("TigerCenter reports class-search is down for maintenance — aborting bulk run.");
    }

    const termsBody = await fetchPersisted(client, runId, () => fetchCurrentTerms(fetcher));
    const terms = parseCurrentTerms(termsBody);
    if (terms.length === 0) throw new Error("currentTerms returned no terms");
    await writeTerms(client, terms);
    const activeTerm = terms[0];
    console.log(`Active term: ${activeTerm.code} (${activeTerm.description})`);

    const vocabBody = await fetchPersisted(client, runId, () => fetchAdvancedSearchData(fetcher));
    const vocabulary = parseAdvancedSearchData(vocabBody, activeTerm.code);
    await writeVocabulary(client, vocabulary);
    const attributeIdByGroupAndValue = await loadAttributeIdMap(client);
    const attributeVocabList: AttributeIR[] = vocabulary.attributes;
    console.log(
      `Vocabulary: ${vocabulary.colleges.length} colleges, ${vocabulary.subjects.length} subjects, ${vocabulary.attributes.length} attribute values`,
    );

    const subjectScope = await loadSubjectScope(client);
    console.log(`Subject scope (from existing catalog_courses stubs): ${subjectScope.join(", ")}`);

    let coursesNew = 0;
    let coursesUpdated = 0;
    let attributesWritten = 0;
    const unmatchedAttributes: string[] = [];

    for (const subject of subjectScope) {
      try {
        const sections = await fetchAllSectionsForSubject(client, runId, fetcher, subject, activeTerm.code);
        const courses: TigerCenterCourseIR[] = dedupeCourses(sections);

        for (const course of courses) {
          const { courseId, isNew } = await writeCourseFromTigerCenter(client, course, activeTerm.code);
          if (isNew) coursesNew += 1;
          else coursesUpdated += 1;

          const { matched, unmatched } = matchAttributes(course.attributeDescriptionsByGroup, attributeVocabList);
          await writeCourseAttributes(client, {
            courseId,
            termCode: activeTerm.code,
            matches: matched,
            attributeIdByGroupAndValue,
          });
          attributesWritten += matched.length;
          for (const u of unmatched) {
            unmatchedAttributes.push(`${course.subjectCode}-${course.catalogNumber} [${u.groupCode}]: "${u.description}" (${u.reason})`);
          }

          await writeTermOffering(client, {
            courseId,
            termCode: activeTerm.code,
            season: activeTerm.season,
            sectionCount: course.sectionCount,
          });
        }

        subjectStats[subject] = { ok: true, sectionsFound: sections.length, coursesFound: courses.length };
        console.log(`${subject}: ${sections.length} sections -> ${courses.length} courses`);
      } catch (err) {
        subjectStats[subject] = { ok: false, error: String(err) };
        console.error(`${subject} failed:`, err);
      }
    }

    const csBsGaps = await reportCsBsGaps(client);
    stats.coursesNew = coursesNew;
    stats.coursesUpdated = coursesUpdated;
    stats.attributesWritten = attributesWritten;
    stats.unmatchedAttributeCount = unmatchedAttributes.length;
    stats.unmatchedAttributesSample = unmatchedAttributes.slice(0, 20);
    stats.csBsGaps = csBsGaps;

    await finishRun(client, runId, { status: "succeeded", stats });
    console.log("Done.", JSON.stringify(stats, null, 2));
    if (csBsGaps.length > 0) {
      console.log("\nCS BS courses still missing enrichment:");
      for (const gap of csBsGaps) console.log(`  - ${gap}`);
    } else {
      console.log("\nEvery CS BS course resolves with credits, title, and description.");
    }
  } catch (err) {
    await finishRun(client, runId, { status: "failed", stats, error: String(err) });
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
