// Task 4: parses catalog_courses.prereq_text -> catalog_course_prerequisites
// for CSCI/MATH courses. Not an ingestion adapter (no external fetch, no
// ingest_documents/ingest_runs bookkeeping — those are typed to the
// programs_api/tigercenter ingest_source enum, which doesn't fit a pure
// DB-to-DB transform), so it skips src/ingest/http.ts, documents.ts, runs.ts
// and only reuses service-client.ts, same .env.ingest pattern as
// scripts/ingest-programs.ts / ingest-tigercenter.ts.
import { config } from "dotenv";
config({ path: ".env.ingest" });

import { createServiceClient } from "../src/ingest/service-client";
import { parsePrereqText } from "../src/prereqs/parse-prereq-text";
import { resolveCourseLeaves } from "../src/prereqs/resolve-courses";
import { writePrereqTree } from "../src/prereqs/write-prereq-tree";
import type { PrereqParseStatus } from "../src/prereqs/types";

const SUBJECTS = ["CSCI", "MATH"];

async function main() {
  const client = createServiceClient();

  const { data: allCourses, error: allCoursesError } = await client.from("catalog_courses").select("id, code");
  if (allCoursesError) throw allCoursesError;
  const codeToId = new Map<string, string>();
  for (const c of allCourses ?? []) {
    if (c.code) codeToId.set(c.code, c.id);
  }

  const { data: targets, error: targetsError } = await client
    .from("catalog_courses")
    .select("id, code, prereq_text")
    .in("subject_code", SUBJECTS)
    .order("code");
  if (targetsError) throw targetsError;

  const stats: Record<PrereqParseStatus, number> = { none: 0, parsed: 0, partial: 0, failed: 0 };
  const flagged: { code: string; status: PrereqParseStatus }[] = [];
  let skippedNullText = 0;

  for (const course of targets ?? []) {
    if (course.prereq_text == null) {
      skippedNullText += 1;
      continue;
    }

    const { status, tree } = parsePrereqText(course.prereq_text);
    const resolvedTree = tree ? resolveCourseLeaves(tree, codeToId) : null;
    await writePrereqTree(client, { courseId: course.id, status, tree: resolvedTree });

    stats[status] += 1;
    if (status === "partial" || status === "failed") {
      flagged.push({ code: course.code ?? course.id, status });
    }
  }

  const total = (targets ?? []).length;
  const eligibleForParsed = total - stats.none;
  console.log(`Processed ${total} CSCI/MATH courses (${skippedNullText} skipped, no prereq_text).`);
  console.log(`Status counts:`, stats);
  console.log(
    `'parsed': ${stats.parsed}/${total} (${((stats.parsed / total) * 100).toFixed(1)}%) of all courses; ` +
      `${stats.parsed}/${eligibleForParsed} (${((stats.parsed / eligibleForParsed) * 100).toFixed(1)}%) of courses with a course-level condition to classify ('none' excluded).`,
  );
  if (flagged.length > 0) {
    console.log(`Flagged (partial/failed) — review these:`);
    for (const f of flagged) console.log(`  ${f.code}: ${f.status}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
