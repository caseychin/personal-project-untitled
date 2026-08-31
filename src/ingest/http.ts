// Rate-limited serial fetcher, shared across ingestion sources. Per
// CLAUDE.md: "Serial requests with a delay, not parallel bursts." Built
// source-agnostic so Task 3's TigerCenter adapter reuses this rather than
// reimplementing its own throttling.

const DEFAULT_DELAY_MS = 750;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; rit-flowchart-planner-ingest/0.1; personal, noncommercial project)";

export type RateLimitedFetcher = {
  get(url: string, init?: RequestInit): Promise<{ status: number; body: string }>;
};

export function createRateLimitedFetcher(
  options: { delayMs?: number } = {},
): RateLimitedFetcher {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  let lastRequestAt = 0;

  async function waitForSlot() {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs - elapsed));
    }
    lastRequestAt = Date.now();
  }

  return {
    async get(url, init) {
      await waitForSlot();
      const response = await fetch(url, {
        ...init,
        headers: {
          "User-Agent": DEFAULT_USER_AGENT,
          ...init?.headers,
        },
      });
      const body = await response.text();
      return { status: response.status, body };
    },
  };
}
