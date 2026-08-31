// Parses currentTerms' Solr-envelope JSON into TermIR rows. Shape confirmed
// by a live fetch during Task 3 implementation — see
// tests/fixtures/tigercenter/current-terms.json. currentTerms leaks a raw
// Solr response (docs[]), not a flat array, per data-sources.md.
import type { TermIR, TermSeason } from "@/ingest/types";

const SEASON_MAP: Record<string, TermSeason> = {
  fall: "fall",
  spring: "spring",
  summer: "summer",
  intersession: "intersession",
};

// '2026-27 Fall (2261)' -> { academicYear: '2026-27', season: 'fall' }
function parseDescription(descr: string): { season: TermSeason | null; academicYear: string | null } {
  const match = descr.match(/^(\d{4}-\d{2})\s+(Fall|Spring|Summer|Intersession)\b/i);
  if (!match) return { season: null, academicYear: null };
  return { academicYear: match[1], season: SEASON_MAP[match[2].toLowerCase()] ?? null };
}

export function parseCurrentTerms(json: string): TermIR[] {
  const parsed = JSON.parse(json) as { response?: { docs?: { strm: string; descr: string }[] } };
  const docs = parsed.response?.docs ?? [];
  return docs.map((doc) => {
    const { season, academicYear } = parseDescription(doc.descr);
    return { code: doc.strm, description: doc.descr, season, academicYear, isActive: true };
  });
}
