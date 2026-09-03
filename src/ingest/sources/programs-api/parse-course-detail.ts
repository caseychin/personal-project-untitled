// Parses a proxy-bubble.php course-detail response — real shape confirmed by
// live fetches during Task 5 implementation (code=CSCI-141, CSCI-499,
// YOPS-10, and the unknown-code case ZZZZ-999). The outer document is XML
// with the course's real markup wrapped in a CDATA section:
//
//   <courseinfo><course code="CSCI-141"><![CDATA[ <div class="courseblock">
//     ...
//     <span class="text detail-typically_offered ...">
//       <span class="label"><strong>Typically Offered:</strong></span> Fall, Spring
//     </span>
//   </div> ]]></course></courseinfo>
//
// An unknown code returns 200 with an empty <courseinfo/> — no <course>
// element at all, not an error page.
//
// This only ever extracts detail-typically_offered. detail-requisites (a
// structured, better-than-TigerCenter prereq source — <a onclick=
// "showCourse(this,'CSCI-140')"> links instead of plain text) is a real
// finding but explicitly out of scope for Task 5 — noted for the record,
// not acted on.
import * as cheerio from "cheerio";
import type { TermSeason } from "@/ingest/types";

const SEASON_MAP: Record<string, TermSeason> = {
  fall: "fall",
  spring: "spring",
  summer: "summer",
  intersession: "intersession",
};

export type ParseCourseDetailResult =
  | { status: "ok"; code: string; seasons: TermSeason[]; rawText: string }
  | { status: "not-found"; code: string }
  | { status: "unparsed"; code: string; reason: string };

export function parseCourseDetail(xml: string, code: string): ParseCourseDetailResult {
  const $outer = cheerio.load(xml, { xmlMode: true });
  const course = $outer("course").first();
  if (course.length === 0) {
    return { status: "not-found", code };
  }

  const innerHtml = course.text();
  const $ = cheerio.load(innerHtml);
  const span = $(".detail-typically_offered").first();
  if (span.length === 0) {
    return { status: "unparsed", code, reason: "no detail-typically_offered span" };
  }

  // The span's text is "Typically Offered: Fall, Spring" — the nested
  // .label span's text flows into the parent's .text(). Strip that leading
  // label before splitting the season list. RIT uses both "Fall, Spring"
  // and "Fall or Spring" as separators for the same kind of list (confirmed
  // live across 417 real courses during Task 5 — ~10 courses use "or"), so
  // both are treated as delimiters here; this is recognizing a second real
  // separator, not guessing at meaning.
  const rawText = span.text().trim().replace(/\s+/g, " ");
  const afterLabel = rawText.replace(/^typically offered:\s*/i, "");

  const seasons: TermSeason[] = [];
  for (const fragment of afterLabel.split(/,|\bor\b/i)) {
    const season = SEASON_MAP[fragment.trim().toLowerCase()];
    if (season && !seasons.includes(season)) seasons.push(season);
  }

  if (seasons.length === 0) {
    // Text present but nothing recognized (e.g. "As needed", "Alternate
    // years") — never guess a season from unfamiliar phrasing.
    return { status: "unparsed", code, reason: `unrecognized text: "${rawText}"` };
  }

  return { status: "ok", code, seasons, rawText };
}
