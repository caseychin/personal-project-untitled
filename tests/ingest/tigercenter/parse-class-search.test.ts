import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseClassSearchPage, dedupeCourses } from "@/ingest/sources/tigercenter/parse-class-search";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../fixtures/tigercenter/${name}`, import.meta.url)), "utf8");
}

describe("parseClassSearchPage / dedupeCourses", () => {
  const { found, results } = parseClassSearchPage(fixture("class-search-csci-page0.json"));

  it("reads found and searchResults from the response", () => {
    expect(found).toBe(139);
    expect(results.length).toBe(5); // fixture is trimmed to 5 sections across 3 courses
  });

  it("dedupes multiple sections of the same course (CSCI-141, 3 sections) into one course record", () => {
    const courses = dedupeCourses(results);
    expect(courses.length).toBe(3); // CSCI-141, CSCI-142, CSCI-140

    const csci141 = courses.find((c) => c.catalogNumber === "141")!;
    expect(csci141.courseId).toBe("114223");
    expect(csci141.title).toBe("Computer Science I");
    expect(csci141.creditsMin).toBe(4);
    expect(csci141.creditsMax).toBe(4);
    expect(csci141.career).toBe("UGRD");
    expect(csci141.collegeCode).toBe("GCCIS");
    expect(csci141.sectionCount).toBe(3);
  });

  it("unions attribute descriptions across sections rather than keeping only the first section's", () => {
    const courses = dedupeCourses(results);
    const csci141 = courses.find((c) => c.catalogNumber === "141")!;
    // Only one of the 3 sections carries the full 3-item ACCS tag set; the
    // other two carry none at all. The merged record must have all 3, not
    // just whichever section happened to be seen first.
    expect(csci141.attributeDescriptionsByGroup.ACCS?.sort()).toEqual(
      ["Caption Services Available", "Interpreter Services Available", "Notetaking Services Available"].sort(),
    );
    expect(csci141.attributeDescriptionsByGroup.PERS).toEqual(["Mathematical Perspectives"]);
    expect(csci141.attributeDescriptionsByGroup.GE).toEqual(["General Education Elective"]);
  });

  it("joins multi-entry preReqDescrsLong into prereqText", () => {
    const courses = dedupeCourses(results);
    const csci142 = courses.find((c) => c.catalogNumber === "142")!;
    expect(csci142.prereqText).toBe("Prerequisites: CSCI-141 with a grade of C- or better or equivalent course. ");
  });

  it("leaves prereqText null when preReqDescrsLong is empty", () => {
    const courses = dedupeCourses([
      {
        subject: "CSCI",
        catalogNumber: "999",
        courseId: "999999",
        courseTitleLong: "Fabricated Course",
        preReqDescrsLong: [],
      },
    ]);
    expect(courses[0].prereqText).toBeNull();
  });
});
