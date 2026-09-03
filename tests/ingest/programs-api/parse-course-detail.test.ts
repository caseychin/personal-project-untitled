import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseCourseDetail } from "@/ingest/sources/programs-api/parse-course-detail";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../fixtures/programs-api/${name}`, import.meta.url)), "utf8");
}

describe("parseCourseDetail", () => {
  it("extracts seasons from a real Typically Offered span", () => {
    const xml = fixture("course-detail-csci-141.xml");
    expect(parseCourseDetail(xml, "CSCI-141")).toEqual({
      status: "ok",
      code: "CSCI-141",
      seasons: ["fall", "spring"],
      rawText: "Typically Offered: Fall, Spring",
    });
  });

  it("reports 'not-found' for an unknown code (empty <courseinfo/>)", () => {
    const xml = fixture("course-detail-unknown-code.xml");
    expect(parseCourseDetail(xml, "ZZZZ-999")).toEqual({ status: "not-found", code: "ZZZZ-999" });
  });

  it("reports 'unparsed' rather than guessing when the span is missing", () => {
    const xml = `<?xml version="1.0"?><courseinfo><course code="CSCI-000"><![CDATA[
      <div class="courseblock"><div class="noindent">No offering info here.</div></div>
    ]]></course></courseinfo>`;
    const result = parseCourseDetail(xml, "CSCI-000");
    expect(result).toEqual({ status: "unparsed", code: "CSCI-000", reason: "no detail-typically_offered span" });
  });

  it("reports 'unparsed' rather than guessing for unfamiliar phrasing", () => {
    const xml = `<?xml version="1.0"?><courseinfo><course code="CSCI-001"><![CDATA[
      <div class="courseblock"><div class="noindent">
        <span class="text detail-typically_offered margin--default"><span class="label"><strong>Typically Offered:</strong></span> As needed</span>
      </div></div>
    ]]></course></courseinfo>`;
    const result = parseCourseDetail(xml, "CSCI-001");
    expect(result.status).toBe("unparsed");
    if (result.status === "unparsed") {
      expect(result.reason).toContain("As needed");
    }
  });

  it("splits on 'or' as well as comma (real RIT phrasing variant)", () => {
    const xml = `<?xml version="1.0"?><courseinfo><course code="PHYS-211"><![CDATA[
      <div class="courseblock"><div class="noindent">
        <span class="text detail-typically_offered margin--default"><span class="label"><strong>Typically Offered:</strong></span> Fall or Spring or Summer</span>
      </div></div>
    ]]></course></courseinfo>`;
    const result = parseCourseDetail(xml, "PHYS-211");
    expect(result).toMatchObject({ status: "ok", seasons: ["fall", "spring", "summer"] });
  });

  it("reports 'unparsed' for a frequency word with no season ('Annually'/'Biennially')", () => {
    const xml = `<?xml version="1.0"?><courseinfo><course code="CSCI-534"><![CDATA[
      <div class="courseblock"><div class="noindent">
        <span class="text detail-typically_offered margin--default"><span class="label"><strong>Typically Offered:</strong></span> Biennially</span>
      </div></div>
    ]]></course></courseinfo>`;
    const result = parseCourseDetail(xml, "CSCI-534");
    expect(result.status).toBe("unparsed");
  });

  it("dedupes and recognizes all four seasons case-insensitively", () => {
    const xml = `<?xml version="1.0"?><courseinfo><course code="CSCI-002"><![CDATA[
      <div class="courseblock"><div class="noindent">
        <span class="text detail-typically_offered margin--default"><span class="label"><strong>Typically Offered:</strong></span> fall, Fall, SUMMER, Intersession</span>
      </div></div>
    ]]></course></courseinfo>`;
    const result = parseCourseDetail(xml, "CSCI-002");
    expect(result).toMatchObject({ status: "ok", seasons: ["fall", "summer", "intersession"] });
  });
});
