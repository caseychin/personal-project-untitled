import { describe, it, expect } from "vitest";
import { parsePrereqText } from "@/prereqs/parse-prereq-text";
import { PREREQ_FIXTURES } from "./fixtures/prereqs";

describe("parsePrereqText", () => {
  for (const fixture of PREREQ_FIXTURES) {
    it(`${fixture.code}: reaches '${fixture.expectedStatus}' with the expected tree`, () => {
      const result = parsePrereqText(fixture.prereqText);
      expect(result.status).toBe(fixture.expectedStatus);
      expect(result.tree).toEqual(fixture.expectedTree);
    });
  }

  it("returns 'none' with a null tree for a literal 'No Prerequisites'", () => {
    expect(parsePrereqText("No Prerequisites")).toEqual({ status: "none", tree: null });
  });

  it("returns 'failed' for null/empty prereq_text", () => {
    expect(parsePrereqText(null).status).toBe("failed");
    expect(parsePrereqText("").status).toBe("failed");
  });
});
