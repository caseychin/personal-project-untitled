// Curated non-course conditions found in the real CSCI/MATH prereq_text
// strings pulled from rit-flowchart-dev during Task 4 planning. Each match
// becomes a single unparsed leaf carrying the exact matched substring as
// raw_fragment — classified (not a parse gap), which is what lets
// restriction/standing/placement text still reach prereq_parse_status =
// 'parsed' (see schema-decisions.md Decision 5 and the Task 4 plan).
//
// Applied as whole-phrase regex substitutions BEFORE and/or/comma
// tokenization, because several of these phrases contain their own internal
// "or"/"and" (e.g. "4th or 5th year standing", "graduate standing in
// ACMTH-MS or MATHML-PHD programs") that must not be split into fake
// OR-branches. Order matters: broader sentence-level patterns run first so
// they don't leave narrower sub-phrases (e.g. "...year standing" inside a
// longer restriction sentence) dangling as unclassified leftovers.

// Whole trailing sentences describing a credit restriction or mutual
// exclusion ("Students may not take and receive credit for CSCI-521 and
// CSCI-721.", "If you have earned credit for CSCI-721 ... you will not be
// permitted to enroll in CSCI-521.") rather than a prerequisite.
export const TRAILER_SENTENCE_PATTERNS: RegExp[] = [
  /\bstudents?\s+(?:may not|cannot)\s+take(?:\s+this course)?\s+(?:and receive credit for|if they have (?:received|taken))[^.]*\.?/gi,
  /\bif (?:you have earned|earned) credit for\/?or\s*(?:you are\s+)?currently enrolled in[^.]*\.?/gi,
  /\bif you have earned credit for[^.]*\.?/gi,
  /\bmay not take (?:and receive credit for|this course if)[^.]*\.?/gi,
  /\bsee the [a-z]+ department with any questions\.?/gi,
];

// Applied in order: broad sentence-level restriction/permission patterns
// first, so they swallow whole sentences (which may contain their own "or"s
// between program codes or standing clauses) before narrower patterns below
// get a chance to leave a fragment of that sentence dangling.
export const KNOWN_PHRASE_PATTERNS: RegExp[] = [
  // "This course/class is restricted to ...", "Restricted to students in ..."
  /\b(?:this (?:course|class) is restricted to|restricted to)\s+[^.]+\.?/gi,

  // Permission-to-enroll phrasing — two distinct real wordings confirmed
  // ("Enrollment ... requires permission from the department ..." and
  // "This course requires permission of the Instructor to enroll.").
  /\b(?:enrollment[^.]*?requires permission from the department[^.]*|this course requires permission of the instructor to enroll)\.?/gi,

  // "equivalent course(s)" — irreducible, rides along with real course logic
  // in ~57% of the 121 real strings pulled ("or equivalent course.",
  // "or equivalent courses.", "or equiv courses." — the abbreviation is real
  // too, confirmed on CSCI-662).
  /\b(?:equivalent|equiv\.?)\s+courses?\b/gi,

  // Year/class standing: "4th year standing", "4th or 5th year standing",
  // "at least 4th year standing", "2nd year standing".
  /\b(?:at least\s+)?\d+(?:st|nd|rd|th)(?:\s+or\s+\d+(?:st|nd|rd|th))?\s+year standing\b/gi,

  // Graduate standing, optionally scoped to specific programs:
  // "graduate standing", "graduate student standing",
  // "graduate standing in ACMTH-MS or MATHML-PHD programs".
  /\bgraduate(?:\s+student)?\s+standing(?:\s+in\s+(?:the\s+)?[^.]+?\s+programs?\b)?/gi,

  // Math Placement Exam score thresholds, score-then-exam-name order
  // ("a score of at least 60% on the RIT Mathematics Placement Exam").
  // Matched as its own pattern (bounded, not a wildcard) so it doesn't
  // compete with the exam-then-score form below.
  /\ba\s+score\s+of\s+at\s+least\s+\d+%?\s+on\s+(?:the\s+)?(?:rit\s+)?math(?:ematics)?\s+placement\s+exam\b/gi,

  // Math Placement Exam, optionally exam-then-score order ("Completion of
  // the math placement exam", "Math Placement Exam score of at least 35",
  // "Math Placement Exam score greater than or equal to 45"). The trailing
  // score clause is deliberately bounded to a number (not an open `[^.]*`
  // wildcard) — an earlier unbounded version swallowed the rest of the
  // clause whenever this phrase wasn't the last thing in the sentence
  // (confirmed on MATH-171, which has a second OR-alternative after it).
  /\b(?:completion\s+of\s+(?:the\s+)?)?(?:a\s+)?(?:the\s+)?(?:rit\s+)?math(?:ematics)?\s+placement\s+exam\b(?:\s+score\s+(?:of\s+at\s+least|greater\s+than\s+or\s+equal\s+to)\s+\d+%?)?/gi,

  // "sufficient background in statistics" / "... in Operating Systems".
  /\bsufficient background in [^.]+\.?/gi,

  // Honors-program alternative admission: "Honors program status or at
  // least a 3.2 cumulative GPA".
  /\bhonors program status(?:\s+or\s+at least a [\d.]+ cumulative gpa)?/gi,
];

/** "successful completion of CSCI-344" is a course reference in disguise —
 * normalized to the bare code so it tokenizes as a normal course leaf rather
 * than a phrase. Applied before KNOWN_PHRASE_PATTERNS. */
export const SUCCESSFUL_COMPLETION_RE = /\bsuccessful completion of\s+([A-Za-z]{2,6}-\d{1,4}[A-Za-z]?)\b/gi;
