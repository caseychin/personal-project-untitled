// Lightweight immersion parsing — per the project owner's decision, Task 2
// ingests immersions as catalog_programs entities only (name/credits), not
// their internal required/elective structure. That structure uses
// <table class="sc_courselist"> (select-N-of-M course lists), a different
// shape from a degree program's <table class="sc_plangrid"> year/term grid,
// confirmed by a live fetch of physics-immersion during implementation —
// see the fixture at tests/fixtures/programs-api/physics-immersion-curriculum.html.
// Parsing that structure into catalog_requirement_slots is deferred; see the
// flag added to docs/architecture/schema-decisions.md.
import * as cheerio from "cheerio";

export function parseImmersionName(html: string, slug: string): string {
  const $ = cheerio.load(html);
  const name = $("h3").first().text().trim();
  if (!name) {
    throw new Error(`No immersion name (<h3>) found for ${slug}`);
  }
  return name;
}

/** Best-effort: sums every `tr.listsum` "Total Hours" row across the page's
 * sc_courselist tables (a prerequisites table has none; the required+elective
 * table does). Undefined if no such row is found. */
export function parseImmersionTotalCredits(html: string): number | undefined {
  const $ = cheerio.load(html);
  let total = 0;
  let found = false;
  $("tr.listsum td.hourscol").each((_, el) => {
    const value = Number.parseFloat($(el).text().trim());
    if (Number.isFinite(value)) {
      total += value;
      found = true;
    }
  });
  return found ? total : undefined;
}
