import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseCanonicalProgramSlug } from "@/ingest/sources/programs-api/parse-canonical-slug";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../fixtures/programs-api/${name}`, import.meta.url)), "utf8");
}

describe("parseCanonicalProgramSlug", () => {
  it("resolves the real /programs/ slug when it diverges from the /study/ listing slug", () => {
    // Listing slug: advertising-and-public-relations-immersion.
    // Real curriculum document: advertising-public-relations-immersion
    // (discovered live 2026-08-29 — the /programs/ curriculum endpoint
    // 404s for the listing slug, but the marketing page links to the
    // correct one).
    const html = fixture("advertising-and-public-relations-immersion-marketing.html");
    expect(parseCanonicalProgramSlug(html, "advertising-and-public-relations-immersion")).toBe(
      "advertising-public-relations-immersion",
    );
  });

  it("falls back to the given slug when no /programs/ link is found", () => {
    expect(parseCanonicalProgramSlug("<p>no links here</p>", "fallback-slug")).toBe("fallback-slug");
  });
});
