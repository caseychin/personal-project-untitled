// Parses /study/immersions-and-minors — a static, directly-scrapable index
// of every immersion slug (confirmed Task 0.5, re-confirmed here). Each
// entry is <a href="/study/{slug}-immersion">...Immersion</a>.
import * as cheerio from "cheerio";
import type { ImmersionListingEntry } from "@/ingest/types";

export function parseImmersionListing(html: string): ImmersionListingEntry[] {
  const $ = cheerio.load(html);
  const entries: ImmersionListingEntry[] = [];
  const seen = new Set<string>();

  $('a[href$="-immersion"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const slug = href.replace(/^\/study\//, "");
    if (seen.has(slug)) return;
    seen.add(slug);
    entries.push({ slug, name: $(el).text().trim() });
  });

  return entries;
}
