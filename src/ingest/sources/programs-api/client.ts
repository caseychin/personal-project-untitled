// Low-level Programs API (CourseLeaf) fetchers. Returns raw responses only —
// callers persist the raw body to ingest_documents before handing it to a
// parser, per CLAUDE.md's "persist before parsing" rule.
import type { RateLimitedFetcher } from "@/ingest/http";

const BASE = "https://www.rit.edu";

export type RawFetch = { endpoint: string; requestParams: Record<string, string>; status: number; body: string };

export async function fetchCurriculum(
  fetcher: RateLimitedFetcher,
  slug: string,
): Promise<RawFetch> {
  const endpoint = "programs-api/courseleaf/proxy-api.php";
  const requestParams = { url: `/programs/${slug}/index.xml`, section: "curriculum", removeheader: "true" };
  const qs = new URLSearchParams(requestParams).toString();
  const { status, body } = await fetcher.get(`${BASE}/${endpoint}?${qs}`);
  return { endpoint, requestParams, status, body };
}

// The curriculum endpoint doesn't carry catalog_year — it's a static heading
// ("Curriculum for 2026-2027") on the program's marketing page, confirmed by
// live fetch during implementation (data-sources.md previously only ruled
// out that page for *content*, not this heading).
export async function fetchMarketingPage(
  fetcher: RateLimitedFetcher,
  slug: string,
): Promise<RawFetch> {
  const endpoint = `study/${slug}`;
  const { status, body } = await fetcher.get(`${BASE}/${endpoint}`);
  return { endpoint, requestParams: { slug }, status, body };
}

export async function fetchProgramListing(fetcher: RateLimitedFetcher): Promise<RawFetch> {
  const endpoint = "study/undergraduate";
  const { status, body } = await fetcher.get(`${BASE}/${endpoint}`);
  return { endpoint, requestParams: {}, status, body };
}

export async function fetchImmersionListing(fetcher: RateLimitedFetcher): Promise<RawFetch> {
  const endpoint = "study/immersions-and-minors";
  const { status, body } = await fetcher.get(`${BASE}/${endpoint}`);
  return { endpoint, requestParams: {}, status, body };
}
