import { describe, it, expect } from "vitest";
import { resolveCourseLeaves } from "@/prereqs/resolve-courses";
import { course, group, unparsed } from "./tree-helpers";

describe("resolveCourseLeaves", () => {
  it("resolves a course leaf whose code exists in the map", () => {
    const map = new Map([["CSCI-141", "course-id-1"]]);
    expect(resolveCourseLeaves(course("CSCI-141"), map)).toEqual({
      nodeType: "course",
      requiredCourseId: "course-id-1",
      minGrade: null,
      isCorequisite: false,
    });
  });

  it("demotes an unresolved course code to unparsed, retaining the code as raw_fragment", () => {
    const map = new Map<string, string>();
    expect(resolveCourseLeaves(course("NMTH-260"), map)).toEqual({
      nodeType: "unparsed",
      rawFragment: "NMTH-260",
      isCorequisite: false,
    });
  });

  it("recurses through group children, resolving each independently", () => {
    const map = new Map([["CSCI-141", "id-1"]]);
    const tree = group("OR", [course("CSCI-141", "C-"), unparsed("equivalent course")]);
    expect(resolveCourseLeaves(tree, map)).toEqual({
      nodeType: "group",
      logic: "OR",
      children: [
        { nodeType: "course", requiredCourseId: "id-1", minGrade: "C-", isCorequisite: false },
        { nodeType: "unparsed", rawFragment: "equivalent course", isCorequisite: false },
      ],
    });
  });
});
