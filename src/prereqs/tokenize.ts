// Text-level normalization ahead of the boolean-expression parse in
// parse-prereq-text.ts: fix the punctuation quirks confirmed in real data
// (& instead of and), strip the "RIT Dubai" campus prefix that precedes the
// real header on MATH-181R/182R/90, detect the literal "No Prerequisites"
// declaration, and split "Prerequisites:" text from a "Co-requisites:" line
// (MATH-181R/182R/190 carry the co-req on its own line, split by \n).

const RIT_DUBAI_PREFIX_RE = /^\s*RIT\s+Dubai\s*/i;
const NO_PREREQ_RE = /^no\s+prerequisites\.?$/i;
const PREREQ_HEADER_RE = /\b(?:pre-?requisites?|prereq)\s*:\s*/i;
const COREQ_HEADER_RE = /\bco-?requisites?\s*:\s*/i;

export function normalizeText(raw: string): string {
  return raw
    .replace(/&/g, " and ")
    .replace(RIT_DUBAI_PREFIX_RE, "")
    // Collapse whitespace runs (newlines included) to a single space. Several
    // known-phrase/grade regexes match on a literal single space between
    // words; the &-replacement above can otherwise produce a double space
    // (e.g. "take & receive" -> "take  and  receive") that silently breaks
    // those matches — confirmed on CSCI-620/CSCI-662's credit-restriction
    // trailer sentences.
    .replace(/\s+/g, " ")
    .trim();
}

export function isNoPrerequisites(text: string): boolean {
  return NO_PREREQ_RE.test(text.trim());
}

export function splitIntoSections(text: string): { prereqBody: string; coreqBody: string } {
  const coreqMatch = COREQ_HEADER_RE.exec(text);
  const before = coreqMatch ? text.slice(0, coreqMatch.index) : text;
  const coreqBody = coreqMatch ? text.slice(coreqMatch.index + coreqMatch[0].length).trim() : "";

  const prereqMatch = PREREQ_HEADER_RE.exec(before);
  const prereqBody = (prereqMatch ? before.slice(prereqMatch.index + prereqMatch[0].length) : before).trim();

  return { prereqBody, coreqBody };
}
