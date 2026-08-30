// Extracts catalog_year from the program's marketing page (/study/{slug}).
// The curriculum endpoint itself doesn't carry this — confirmed by live
// fetch during implementation. data-sources.md previously ruled out this
// page only for *course-list content* (JS-rendered); this specific heading
// is server-rendered and present in static HTML.
import * as cheerio from "cheerio";

const CATALOG_YEAR_PATTERN = /Curriculum for (\d{4}-\d{4})/;

export function parseCatalogYear(html: string, slug: string): string {
  const $ = cheerio.load(html);
  const heading = $("h2")
    .filter((_, el) => CATALOG_YEAR_PATTERN.test($(el).text()))
    .first()
    .text();
  const match = heading.match(CATALOG_YEAR_PATTERN);
  if (!match) {
    throw new Error(`Could not find "Curriculum for {year}" heading on marketing page for ${slug}`);
  }
  return match[1];
}
