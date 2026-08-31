// The /study/{slug} listing page's slug and the canonical /programs/{slug}
// curriculum document slug diverge for many immersions — discovered live
// during implementation (2026-08-29): the immersions-and-minors listing
// gives "advertising-and-public-relations-immersion", but the real
// curriculum document is at "advertising-public-relations-immersion"
// (connector words dropped inconsistently, not a fixed rule). Confirmed
// widespread (3 of 4 spot-checked immersions mismatched), not a rare edge
// case — physics-immersion just happened to match by coincidence. The
// marketing page's own inline `loadCourseleafData('/programs-api/courseleaf/
// proxy-api.php?url=/programs/{realSlug}/index.xml&section=...')` script
// call reliably carries the canonical slug it fetches its own curriculum
// content from — that's the resolution mechanism. (Not a plain <a href>
// link — the canonical slug isn't exposed there.)
const CANONICAL_SLUG_PATTERN = /url=\/programs\/([a-z0-9-]+)\/index\.xml/;

export function parseCanonicalProgramSlug(html: string, fallbackSlug: string): string {
  const match = html.match(CANONICAL_SLUG_PATTERN);
  return match ? match[1] : fallbackSlug;
}
