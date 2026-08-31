// Parses a Programs API (CourseLeaf) Plan of Study Grid into a ParsedProgram.
// Markup confirmed by a live fetch of computer-science-bs's curriculum
// section during implementation (2026-08-28) — see the fixture at
// tests/fixtures/programs-api/computer-science-bs-curriculum.html for the
// exact shape this is built against.
//
// Grid structure: <table class="sc_plangrid"> containing, in document order:
//   tr.plangridyear   — year header ("First Year".."Fifth Year")
//   tr.plangridterm   — term header ("Fall"/"Spring"/"Summer"/"Intersession")
//   tr.even/tr.odd    — one slot per row (course or placeholder)
//   tr.plangridsum    — term subtotal, not a slot
//   tr.plangridtotal  — program total, not a slot
//
// This program does NOT carry catalog_year — that's a separate static
// heading on the marketing page (see parse-catalog-year.ts).
import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { ParsedProgram, RequirementSlotIR, TermSeason } from "@/ingest/types";

const ORDINAL_YEAR_WORDS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth"];
const SEASON_MAP: Record<string, TermSeason> = {
  fall: "fall",
  spring: "spring",
  summer: "summer",
  intersession: "intersession",
};

function extractCourseCode($el: Cheerio<AnyNode>): string | undefined {
  const bubble = $el.find("[data-code-bubble]").first();
  const code = bubble.attr("data-code-bubble");
  return code?.trim();
}

/** True for a course whose title marks it as a full-term co-op placement
 * (e.g. "CS Undergraduate Summer Co-op"), as opposed to a normal course that
 * happens to have "Cooperative" in its name (e.g. "Undergraduate
 * Cooperative Education Seminar", CSCI-99 — a real 0-credit seminar, not a
 * full-width co-op bar). The hyphenated "co-op" substring reliably
 * distinguishes the two in observed data; "Cooperative" alone does not
 * match. */
function isCoopTitle(title: string): boolean {
  return /\bco-op\b/i.test(title);
}

function classifyCategory(params: { courseCode?: string; label?: string; isCoop: boolean }): string | undefined {
  const { courseCode, label, isCoop } = params;
  if (isCoop) return "Co-op";
  const subject = courseCode?.split("-")[0];
  if (subject === "CSCI" || subject === "SWEN") return "CS/SWE";
  if (subject === "MATH") return "Math";
  if (subject === "YOPS") return "First Year Requirement";
  const text = label ?? "";
  if (/natural science|lab science/i.test(text)) return "Science";
  if (/general education|gen ed/i.test(text)) return "Gen Ed";
  if (/open elective/i.test(text)) return "Open Elective";
  if (/wellness/i.test(text)) return "Wellness";
  if (/^cs (elective|cluster)/i.test(text)) return "CS/SWE";
  return undefined;
}

function parseYearHeader(text: string, seenYears: number): number {
  const yearNumber = seenYears + 1;
  const expectedWord = ORDINAL_YEAR_WORDS[seenYears];
  if (expectedWord && !text.trim().startsWith(expectedWord)) {
    throw new Error(
      `Unexpected year header "${text.trim()}" — expected to start with "${expectedWord}" ` +
        `(year ${yearNumber} by document order). Grid structure may have changed.`,
    );
  }
  return yearNumber;
}

function parseSeasonHeader(text: string): TermSeason {
  const season = SEASON_MAP[text.trim().toLowerCase()];
  if (!season) {
    throw new Error(`Unrecognized term header "${text.trim()}" — expected Fall/Spring/Summer/Intersession.`);
  }
  return season;
}

function parseCredits($: CheerioAPI, row: Cheerio<AnyNode>): number | undefined {
  const text = row.find("td.hourscol").last().text().trim();
  if (!text) return undefined;
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : undefined;
}

function parseSlotRow($: CheerioAPI, row: Cheerio<AnyNode>): Omit<RequirementSlotIR, "yearNumber" | "season" | "sortOrder"> {
  const codecol = row.find("td.codecol").first();
  const courseLink = codecol.find('a[onclick^="showCourse"]').first();
  const credits = parseCredits($, row);

  if (courseLink.length === 0) {
    // Placeholder: colspan=2 codecol containing a <span class="comment">,
    // possibly wrapping a Gen Ed perspective link.
    const label = codecol.find("span.comment").first().text().trim().replace(/\s+/g, " ");
    return {
      kind: "placeholder",
      label: label || codecol.text().trim(),
      credits,
      categoryHint: classifyCategory({ label, isCoop: false }),
    };
  }

  const courseCode = extractCourseCode(codecol);
  const titlecol = row.find("td.titlecol").first();

  // Primary title: text of titlecol with only the honors-alternative
  // ".blockindent"/<br> line stripped out. Any inline Gen-Ed-fulfillment
  // annotation (e.g. "(fulfills General Education: Mathematical Perspective
  // A)") is left in place rather than surgically removed — it's genuinely
  // part of how the source displays this cell, and stripping it reliably
  // (vs. leaving stray parens behind) isn't worth the fragility.
  const titleClone = titlecol.clone();
  titleClone.find(".blockindent, br").remove();
  const courseTitle = titleClone.text().trim().replace(/\s+/g, " ");

  // Honors/alternate course option, e.g. "or CSCI-263" in a nested
  // .blockindent div alongside the primary course link.
  const altLink = codecol.find(".blockindent a[onclick^=\"showCourse\"]").first();
  const altCode = altLink.length ? extractCourseCode(codecol.find(".blockindent").first()) : undefined;
  const altTitleText = titlecol.find(".blockindent").first().text().trim().replace(/^or\s+/i, "");

  const notesParts: string[] = [];
  if (altCode) notesParts.push(`or ${altCode}${altTitleText ? ` (${altTitleText})` : ""}`);

  const isCoop = isCoopTitle(courseTitle);

  return {
    kind: isCoop ? "coop" : "course",
    courseCode,
    courseTitle,
    credits,
    notes: notesParts.length ? notesParts.join("; ") : undefined,
    categoryHint: classifyCategory({ courseCode, isCoop }),
  };
}

const DEGREE_SUFFIX = /\b(BS|BA|BFA|AAS|AOS|AS|MS|MA|MFA|PhD)$/;

export function parseCurriculum(
  html: string,
  slug: string,
): Omit<ParsedProgram, "catalogYear"> & { degree?: string } {
  const $ = cheerio.load(html);
  const name = $("h3").first().text().trim();
  if (!name) {
    throw new Error(`No program name (<h3>) found for ${slug}`);
  }
  const degreeMatch = name.match(DEGREE_SUFFIX);

  const table = $("table.sc_plangrid").first();
  if (table.length === 0) {
    throw new Error(`No Plan of Study Grid (table.sc_plangrid) found for ${slug}`);
  }

  const slots: RequirementSlotIR[] = [];
  let yearNumber = 0;
  let season: TermSeason | null = null;
  let sortOrder = 0;
  let totalCredits: number | undefined;

  // cheerio (htmlparser2) auto-wraps bare <tr>s in an implicit <tbody> even
  // though the source markup has none, so the rows aren't direct children
  // of <table> — confirmed by inspecting the parsed tree during
  // implementation.
  table.find("tbody > tr").each((_, node) => {
    const row = $(node);
    if (row.hasClass("plangridyear")) {
      yearNumber = parseYearHeader(row.find("th").first().text(), yearNumber);
      season = null;
      return;
    }
    if (row.hasClass("plangridterm")) {
      season = parseSeasonHeader(row.find("th").first().text());
      sortOrder = 0;
      return;
    }
    if (row.hasClass("plangridsum")) {
      return; // term subtotal, not a slot
    }
    if (row.hasClass("plangridtotal")) {
      const text = row.find("td.hourscol").last().text().trim();
      const value = Number.parseFloat(text);
      totalCredits = Number.isFinite(value) ? value : undefined;
      return;
    }
    if (yearNumber === 0 || season === null) return; // defensive: row before any year/term header

    const parsed = parseSlotRow($, row);
    slots.push({ yearNumber, season, sortOrder, ...parsed });
    sortOrder += 1;
  });

  return { slug, name, degree: degreeMatch?.[1], totalCredits, groups: [], slots };
}
