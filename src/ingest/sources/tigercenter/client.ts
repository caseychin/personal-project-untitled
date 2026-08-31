// Low-level TigerCenter fetchers. Returns raw responses only — callers
// persist the raw body to ingest_documents before handing it to a parser,
// per CLAUDE.md's "persist before parsing" rule.
//
// No session/cookie bootstrap here on purpose: Task 0.2
// (docs/architecture/data-sources.md) confirmed a cookie-less request
// returns byte-identical results to one carrying the ingress-issued
// cookie, and no endpoint ever issues a real session token — only a
// load-balancer routing cookie with no app semantics. There is nothing to
// bootstrap.
import type { RateLimitedFetcher } from "@/ingest/http";

const BASE = "https://tigercenter.rit.edu/tigerCenterApi/tc";

export type RawFetch = { endpoint: string; requestParams: Record<string, unknown>; status: number; body: string };

export async function fetchMaintenance(fetcher: RateLimitedFetcher): Promise<RawFetch> {
  const endpoint = "maintenance";
  const { status, body } = await fetcher.get(`${BASE}/${endpoint}`);
  return { endpoint, requestParams: {}, status, body };
}

export async function fetchCurrentTerms(fetcher: RateLimitedFetcher): Promise<RawFetch> {
  const endpoint = "currentTerms";
  const { status, body } = await fetcher.get(`${BASE}/${endpoint}`);
  return { endpoint, requestParams: {}, status, body };
}

export async function fetchAdvancedSearchData(fetcher: RateLimitedFetcher): Promise<RawFetch> {
  const endpoint = "advancedSearchData";
  const { status, body } = await fetcher.get(`${BASE}/${endpoint}`);
  return { endpoint, requestParams: {}, status, body };
}

export type ClassSearchParams = {
  subject: string;
  term: string;
  rows: number;
  pageNumber: number;
};

// Body shape confirmed field-for-field against the live TigerCenter Angular
// bundle during Task 0.6 (data-sources.md). `Accept: application/json` is
// required explicitly — its absence was the entire cause of Task 0.6's
// found:0 mystery. Never rely on a client's default Accept header.
export async function fetchClassSearch(fetcher: RateLimitedFetcher, params: ClassSearchParams): Promise<RawFetch> {
  const endpoint = "class-search";
  const searchParams = {
    query: "",
    term: params.term,
    rows: params.rows,
    pageNumber: params.pageNumber,
    sortCategory: "course_title_long_sort",
    sortOrder: "asc",
    filterAnd: null,
    isAdvanced: true,
    campus: null,
    session: null,
    courseAttributeOptions: [],
    courseAttributeOptionsPassed: [],
    career: null,
    college: null,
    component: null,
    creditsMax: null,
    creditsMin: null,
    precision: null,
    instructionType: null,
    instructor: null,
    subject: params.subject,
    days: "",
    daysFilterAnd: true,
    filterShowOnlyOptions: "",
    classBeginsAt: "",
  };
  const { status, body } = await fetcher.post(
    `${BASE}/${endpoint}`,
    { searchParams },
    { headers: { Accept: "application/json" } },
  );
  return { endpoint, requestParams: searchParams, status, body };
}
