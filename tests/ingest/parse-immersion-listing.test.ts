import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseImmersionListing } from "@/ingest/sources/programs-api/parse-immersion-listing";
import { parseImmersionName, parseImmersionTotalCredits } from "@/ingest/sources/programs-api/parse-immersion-entity";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../fixtures/programs-api/${name}`, import.meta.url)), "utf8");
}

describe("parseImmersionListing", () => {
  it("extracts all 77 immersion slugs from the static listing page", () => {
    const entries = parseImmersionListing(fixture("immersions-listing.html"));
    expect(entries.length).toBe(77);
    expect(entries).toContainEqual({ slug: "physics-immersion", name: "Physics Immersion" });
  });

  it("dedupes entries with the same slug", () => {
    const entries = parseImmersionListing(fixture("immersions-listing.html"));
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("parseImmersionName / parseImmersionTotalCredits", () => {
  const html = fixture("physics-immersion-curriculum.html");

  it("extracts the immersion's name", () => {
    expect(parseImmersionName(html, "physics-immersion")).toBe("Physics Immersion");
  });

  it("sums the required + elective course list's stated total, excluding prerequisites", () => {
    // PHYS-213 (3) + "select two of the following" electives (6) = 9.
    // The prerequisites table (PHYS-211/212 or a Calculus sequence) has no
    // listsum row and is correctly excluded from this total.
    expect(parseImmersionTotalCredits(html)).toBe(9);
  });
});
