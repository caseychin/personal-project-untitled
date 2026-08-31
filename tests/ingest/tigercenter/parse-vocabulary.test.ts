import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseAdvancedSearchData } from "@/ingest/sources/tigercenter/parse-vocabulary";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../fixtures/tigercenter/${name}`, import.meta.url)), "utf8");
}

describe("parseAdvancedSearchData", () => {
  const parsed = parseAdvancedSearchData(fixture("advanced-search-data.json"), "2261");

  it("extracts all 12 colleges", () => {
    expect(parsed.colleges.length).toBe(12);
    expect(parsed.colleges).toContainEqual({ code: "CAD", name: "College of Art and Design" });
  });

  it("extracts subjects nested under each college for the given term, with college_code attached", () => {
    expect(parsed.subjects).toContainEqual({ code: "ARCH", name: "Architecture", collegeCode: "GIS" });
    expect(parsed.subjects).toContainEqual({ code: "YOPS", name: "Year One Programs", collegeCode: "STUAF" });
  });

  it("flattens attribute groups into one row per (group, value)", () => {
    expect(parsed.attributes).toContainEqual({
      groupCode: "PERS",
      groupName: "Gen Ed Perspectives Category",
      valueCode: "ARTISTIC",
      valueName: "GE: Artistic Perspective",
    });
    expect(parsed.attributes).toContainEqual({
      groupCode: "GE",
      groupName: "Gen Ed Elective",
      valueCode: "GENED ELEC",
      valueName: "GE: Elective",
    });
  });

  it("dedupes a subject code cross-listed under two colleges (e.g. COGS under GCCIS and CLA), first-wins by college code sort order", () => {
    // Real data: COGS ('Cognitive Science') appears under both CLA and
    // GCCIS in advancedSearchData. Without dedup this breaks a single-batch
    // upsert (Postgres: "ON CONFLICT DO UPDATE command cannot affect row a
    // second time") since subject code is catalog_subjects' primary key.
    const cogsRows = parsed.subjects.filter((s) => s.code === "COGS");
    expect(cogsRows.length).toBe(1);
    expect(cogsRows[0]).toEqual({ code: "COGS", name: "Cognitive Science", collegeCode: "CLA" });
  });

  it("returns no subjects for a term the fixture doesn't carry", () => {
    const other = parseAdvancedSearchData(fixture("advanced-search-data.json"), "9999");
    expect(other.subjects.length).toBe(0);
    // Colleges and attributes aren't term-scoped, so they're unaffected.
    expect(other.colleges.length).toBe(12);
  });
});
