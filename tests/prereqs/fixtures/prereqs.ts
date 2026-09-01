// Real prereq_text strings pulled directly from rit-flowchart-dev's
// catalog_courses (CSCI/MATH, 2026-08-31) during Task 4 planning — not
// invented. Chosen to cover the pattern variety confirmed in that pull: see
// the Task 4 plan and PR description for the full breakdown.
import type { PrereqParseStatus, PrereqNode } from "@/prereqs/types";
import { course, group, unparsed } from "../tree-helpers";

export interface PrereqFixture {
  code: string;
  prereqText: string;
  expectedStatus: PrereqParseStatus;
  expectedTree: PrereqNode | null;
}

export const PREREQ_FIXTURES: PrereqFixture[] = [
  {
    code: "CSCI-140",
    prereqText: "No Prerequisites",
    expectedStatus: "none",
    expectedTree: null,
  },
  {
    code: "CSCI-571",
    prereqText: "Enrollment in this course requires permission from the department offering the course. ",
    expectedStatus: "parsed",
    expectedTree: unparsed("Enrollment in this course requires permission from the department offering the course."),
  },
  {
    code: "CSCI-603",
    prereqText: "This course is restricted to students in COMPSCI-MS. ",
    expectedStatus: "parsed",
    expectedTree: unparsed("This course is restricted to students in COMPSCI-MS."),
  },
  {
    code: "CSCI-99",
    prereqText: "Prerequisites: This class is restricted to COMPSCI-BS or COMPEX-UND Major students with at least 2nd year standing. ",
    expectedStatus: "parsed",
    expectedTree: unparsed("This class is restricted to COMPSCI-BS or COMPEX-UND Major students with at least 2nd year standing."),
  },
  {
    code: "CSCI-788",
    prereqText: "Restricted to students in COMPSCI-MS and COMPSCI-BS/MS programs. ",
    expectedStatus: "parsed",
    expectedTree: unparsed("Restricted to students in COMPSCI-MS and COMPSCI-BS/MS programs."),
  },
  {
    code: "MATH-799",
    prereqText: "This course requires permission of the Instructor to enroll. ",
    expectedStatus: "parsed",
    expectedTree: unparsed("This course requires permission of the Instructor to enroll."),
  },
  {
    code: "MATH-90",
    prereqText: "RIT Dubai ",
    expectedStatus: "failed",
    expectedTree: unparsed("RIT Dubai"),
  },
  {
    code: "CSCI-534",
    prereqText: "Prerequisite:  CSCI-331 or equivalent course. ",
    expectedStatus: "parsed",
    expectedTree: group("OR", [course("CSCI-331"), unparsed("equivalent course")]),
  },
  {
    code: "CSCI-352",
    prereqText: "Prerequisites: CSCI-250 or CMPE-350 or SWEN-340 or equivalent course. ",
    expectedStatus: "parsed",
    expectedTree: group("OR", [course("CSCI-250"), course("CMPE-350"), course("SWEN-340"), unparsed("equivalent course")]),
  },
  {
    code: "CSCI-243",
    prereqText:
      "Prerequisite: C- or better in CSCI-140 or CSCI-142 or CSCI-242 or SWEN-124 or CSEC-124 or GCIS-124 or GCIS-127 or equivalent course. ",
    expectedStatus: "parsed",
    expectedTree: group("OR", [
      course("CSCI-140", "C-"),
      course("CSCI-142", "C-"),
      course("CSCI-242", "C-"),
      course("SWEN-124", "C-"),
      course("CSEC-124", "C-"),
      course("GCIS-124", "C-"),
      course("GCIS-127", "C-"),
      unparsed("equivalent course"),
    ]),
  },
  {
    code: "MATH-161",
    prereqText:
      "Prerequisite:  C- or better in MATH-101, MATH-111, MATH-131, NMTH-260, NMTH-272 or NMTH-275 or Math Placement Exam score greater than or equal to 45. ",
    expectedStatus: "parsed",
    expectedTree: group("OR", [
      course("MATH-101", "C-"),
      course("MATH-111", "C-"),
      course("MATH-131", "C-"),
      course("NMTH-260", "C-"),
      course("NMTH-272", "C-"),
      course("NMTH-275", "C-"),
      unparsed("Math Placement Exam score greater than or equal to 45"),
    ]),
  },
  {
    // Real typo in the pulled data: "CSECI-123" (not a real RIT subject).
    code: "CSCI-262",
    prereqText:
      "Prerequisites: (MATH-190 or MATH-200) and (CSCI-140 or CSCI-141 or CSCI-242 or SWEN-123 or SWEN-124 or CSECI-123 or CSEC-124 or GCIS-123 or GCIS-124 or GCIS-127) or equivalent courses. ",
    expectedStatus: "parsed",
    expectedTree: group("OR", [
      group("AND", [
        group("OR", [course("MATH-190"), course("MATH-200")]),
        group("OR", [
          course("CSCI-140"),
          course("CSCI-141"),
          course("CSCI-242"),
          course("SWEN-123"),
          course("SWEN-124"),
          course("CSECI-123"),
          course("CSEC-124"),
          course("GCIS-123"),
          course("GCIS-124"),
          course("GCIS-127"),
        ]),
      ]),
      unparsed("equivalent courses"),
    ]),
  },
  {
    code: "CSCI-250",
    prereqText: "Prerequisites:  (CSCI-243 or 4003-334) and (MATH-190 or MATH-200 or 1016-366) or equivalent courses. ",
    expectedStatus: "parsed",
    expectedTree: group("OR", [
      group("AND", [
        group("OR", [course("CSCI-243"), course("4003-334")]),
        group("OR", [course("MATH-190"), course("MATH-200"), course("1016-366")]),
      ]),
      unparsed("equivalent courses"),
    ]),
  },
  {
    code: "MATH-421",
    prereqText: "Prerequisites: (MATH-220 or MATH-221 or 1016-410 or 1016-328) and MATH-231 and (MATH-241 or MATH-241H) and MATH-251 or equivalent courses. ",
    expectedStatus: "parsed",
    expectedTree: group("OR", [
      group("AND", [
        group("OR", [course("MATH-220"), course("MATH-221"), course("1016-410"), course("1016-328")]),
        course("MATH-231"),
        group("OR", [course("MATH-241"), course("MATH-241H")]),
        course("MATH-251"),
      ]),
      unparsed("equivalent courses"),
    ]),
  },
  {
    code: "MATH-131",
    prereqText: "Prerequisites:  MATH-101, MATH-111, NMTH-260, NMTH-272 or NMTH-275 or a Math Placement Exam score of at least 35. ",
    expectedStatus: "parsed",
    expectedTree: group("OR", [
      course("MATH-101"),
      course("MATH-111"),
      course("NMTH-260"),
      course("NMTH-272"),
      course("NMTH-275"),
      unparsed("a Math Placement Exam score of at least 35"),
    ]),
  },
  {
    code: "MATH-190",
    prereqText:
      "Prerequisites: C- or better in MATH-171 or MATH-180 or MATH-181 or equivalent course.\nCo-requisites: MATH-182 or MATH-182A or MATH-172 or equivalent course. ",
    expectedStatus: "parsed",
    expectedTree: group("AND", [
      group("OR", [course("MATH-171", "C-"), course("MATH-180", "C-"), course("MATH-181", "C-"), unparsed("equivalent course")]),
      group("OR", [
        course("MATH-182", null, true),
        course("MATH-182A", null, true),
        course("MATH-172", null, true),
        unparsed("equivalent course", true),
      ]),
    ]),
  },
  {
    code: "CSCI-610",
    prereqText:
      "Prerequisite: (CSCI-603 or CSCI-605 with a grade of B or better) or (CSCI-243 or SWEN-262). May not take and receive credit for CSCI-610 and CSCI-510. If earned credit for/or currently enrolled in CSCI-510 you will not be permitted to enroll in CSCI-610. ",
    expectedStatus: "parsed",
    expectedTree: group("AND", [
      group("OR", [
        group("OR", [course("CSCI-603"), course("CSCI-605", "B")]),
        group("OR", [course("CSCI-243"), course("SWEN-262")]),
      ]),
      unparsed("May not take and receive credit for CSCI-610 and CSCI-510."),
      unparsed("If earned credit for/or currently enrolled in CSCI-510 you will not be permitted to enroll in CSCI-610."),
    ]),
  },
  {
    code: "CSCI-630",
    prereqText:
      "Prerequisites:((CSCI-603 or CSCI-605) &CSCI-661) with grades of B or better or ((CSCI-243 or SWEN-262)&(CSCI-262 or CSCI-263)).If you have earned credit for CSCI-331 or you are currently enrolled in CSCI-331 you won't be permitted to enroll in CSCI-630. ",
    expectedStatus: "parsed",
    expectedTree: group("AND", [
      group("OR", [
        group("AND", [group("OR", [course("CSCI-603", "B"), course("CSCI-605", "B")]), course("CSCI-661", "B")]),
        group("AND", [group("OR", [course("CSCI-243"), course("SWEN-262")]), group("OR", [course("CSCI-262"), course("CSCI-263")])]),
      ]),
      unparsed("If you have earned credit for CSCI-331 or you are currently enrolled in CSCI-331 you won't be permitted to enroll in CSCI-630."),
    ]),
  },
  {
    code: "CSCI-521",
    prereqText:
      "Prerequisites:  CSCI-320. Students may not take and receive credit for CSCI-521 and CSCI-721.  If you have earned credit for CSCI-721 or you are currently enrolled in CSCI-721 you will not be permitted to enroll in CSCI-521. ",
    expectedStatus: "parsed",
    expectedTree: group("AND", [
      course("CSCI-320"),
      unparsed("Students may not take and receive credit for CSCI-521 and CSCI-721."),
      unparsed("If you have earned credit for CSCI-721 or you are currently enrolled in CSCI-721 you will not be permitted to enroll in CSCI-521."),
    ]),
  },
  {
    code: "MATH-625",
    prereqText: "Prerequisites: MATH-431 or equivalent course or graduate student standing. ",
    expectedStatus: "parsed",
    expectedTree: group("OR", [course("MATH-431"), unparsed("equivalent course"), unparsed("graduate student standing")]),
  },
  {
    code: "MATH-631",
    prereqText: "Prerequisites: (MATH-231 and (MATH 241 or MATH-241H)) or equivalent courses or graduate standing in ACMTH-MS or MATHML-PHD programs. ",
    expectedStatus: "parsed",
    expectedTree: group("OR", [
      group("AND", [course("MATH-231"), group("OR", [course("MATH-241"), course("MATH-241H")])]),
      unparsed("equivalent courses"),
      unparsed("graduate standing in ACMTH-MS or MATHML-PHD programs"),
    ]),
  },
  {
    code: "MATH-735",
    prereqText:
      "Prerequisites: ((MATH-241 or MATH-241H) and MATH-251) or equivalent courses or graduate standing in the ACMTH-MS or MATHML-PHD or CMPFINC-MS programs. ",
    expectedStatus: "parsed",
    expectedTree: group("OR", [
      group("AND", [group("OR", [course("MATH-241"), course("MATH-241H")]), course("MATH-251")]),
      unparsed("equivalent courses"),
      unparsed("graduate standing in the ACMTH-MS or MATHML-PHD or CMPFINC-MS programs"),
    ]),
  },
  {
    code: "CSCI-651",
    prereqText:
      "Prerequisites: (CSCI-605 with grade of B or better) or (CSCI-243 or SWEN-262) or equivalent course and sufficient background in statistics. Students cannot take and receive credit for this course if they have taken CSCI-351. ",
    expectedStatus: "parsed",
    expectedTree: group("AND", [
      group("OR", [
        course("CSCI-605", "B"),
        group("OR", [course("CSCI-243"), course("SWEN-262")]),
        group("AND", [unparsed("equivalent course"), unparsed("sufficient background in statistics.")]),
      ]),
      unparsed("Students cannot take and receive credit for this course if they have taken CSCI-351."),
    ]),
  },
  {
    code: "CSCI-641",
    prereqText: "Prerequisites: (CSCI-603 or CSCI-602) and (CSCI-605 or CSCI-604) or equivalent courses with grades of B or better or successful completion of CSCI-344. ",
    expectedStatus: "parsed",
    expectedTree: group("OR", [
      group("AND", [group("OR", [course("CSCI-603"), course("CSCI-602")]), group("OR", [course("CSCI-605"), course("CSCI-604")])]),
      unparsed("equivalent courses"),
      course("CSCI-344"),
    ]),
  },
  {
    code: "CSCI-655",
    prereqText:
      "CSCI-605 and (CSCI-660 or CSCI-661) with B or better in all courses or CSEC-600 and CSEC-604 with B or better in both courses or CSCI-250 and (CSCI-262 or CSCI-263).  Students may not take and receive credit for both CSCI-455 and CSCI-655. ",
    expectedStatus: "parsed",
    expectedTree: group("AND", [
      group("OR", [
        group("AND", [course("CSCI-605"), group("OR", [course("CSCI-660", "B"), course("CSCI-661", "B")])]),
        group("AND", [course("CSEC-600", "B"), course("CSEC-604", "B")]),
        group("AND", [course("CSCI-250"), group("OR", [course("CSCI-262"), course("CSCI-263")])]),
      ]),
      unparsed("Students may not take and receive credit for both CSCI-455 and CSCI-655."),
    ]),
  },
  {
    code: "CSCI-472",
    prereqText: "Prerequisites:  This class is restricted to students with at least 4th year standing. ",
    expectedStatus: "parsed",
    expectedTree: unparsed("This class is restricted to students with at least 4th year standing."),
  },
  {
    code: "CSCI-335",
    prereqText:
      "Prerequisites: (CSCI-243 or SWEN-262 or IDAI-202) and (MATH-251 or STAT-205) or equivalent courses. Students may not take and receive credit for CSCI-335 and CSCI-635. ",
    expectedStatus: "parsed",
    expectedTree: group("AND", [
      group("OR", [
        group("AND", [
          group("OR", [course("CSCI-243"), course("SWEN-262"), course("IDAI-202")]),
          group("OR", [course("MATH-251"), course("STAT-205")]),
        ]),
        unparsed("equivalent courses"),
      ]),
      unparsed("Students may not take and receive credit for CSCI-335 and CSCI-635."),
    ]),
  },
  {
    code: "CSCI-462",
    prereqText: "Prerequisites:  (CSCI-243 or SWEN-262 or CSEC-202) and (MATH-190 or MATH-200) or equivalent courses. ",
    expectedStatus: "parsed",
    expectedTree: group("OR", [
      group("AND", [
        group("OR", [course("CSCI-243"), course("SWEN-262"), course("CSEC-202")]),
        group("OR", [course("MATH-190"), course("MATH-200")]),
      ]),
      unparsed("equivalent courses"),
    ]),
  },
];
