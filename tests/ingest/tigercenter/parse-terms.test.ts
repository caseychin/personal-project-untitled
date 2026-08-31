import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseCurrentTerms } from "@/ingest/sources/tigercenter/parse-terms";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../fixtures/tigercenter/${name}`, import.meta.url)), "utf8");
}

describe("parseCurrentTerms", () => {
  it("unwraps the Solr response envelope and extracts term fields", () => {
    const terms = parseCurrentTerms(fixture("current-terms.json"));
    expect(terms).toEqual([
      {
        code: "2261",
        description: "2026-27 Fall (2261)",
        season: "fall",
        academicYear: "2026-27",
        isActive: true,
      },
    ]);
  });
});
