// Pure text -> tree parser. No DB access — course-code leaves carry a
// `code` string (resolve-courses.ts resolves it to a required_course_id
// later, or demotes it to unparsed if catalog_courses has no matching row).
//
// prereq_parse_status is decided entirely here, from the text alone:
//   'none'    — literal "No Prerequisites".
//   'parsed'  — every fragment was recognized, either as course-code-shaped
//               text or as one of the curated known-non-course phrases
//               (known-phrases.ts) — nothing left unclassified. This does
//               NOT require a course code to actually resolve against
//               catalog_courses; whether it resolves is an inventory
//               question, not a parsing question (see the Task 4 plan).
//   'partial' — some fragment parsed, but something else didn't match any
//               recognized shape (course code or known phrase).
//   'failed'  — nothing recognizable at all (e.g. MATH-90's "RIT Dubai ",
//               which is not a prerequisite statement of any kind).
import type { PrereqNode, ParseResult, PrereqParseStatus } from "./types";
import { KNOWN_PHRASE_PATTERNS, SUCCESSFUL_COMPLETION_RE, TRAILER_SENTENCE_PATTERNS } from "./known-phrases";
import { isNoPrerequisites, normalizeText, splitIntoSections } from "./tokenize";

type TokenType = "LPAREN" | "RPAREN" | "AND" | "OR" | "COMMA" | "COURSE" | "PHRASE" | "GRADE_PREFIX" | "GRADE_SUFFIX" | "TEXT";

interface Token {
  type: TokenType;
  value: string;
  raw: string;
}

interface ParseCtx {
  unclassified: boolean;
  classified: boolean;
}

// Delimiters built from escape sequences (not literal characters in this
// source file) so a placeholder can never be confused with a real numeric
// non-RIT course code like "4003-334" — a bare digit index would be.
const PLACEHOLDER_OPEN = "\x01";
const PLACEHOLDER_CLOSE = "\x02";
const PLACEHOLDER_RE = new RegExp(`^\\x01(\\d+)\\x02`);

/** Replaces successful-completion idioms and known non-course phrases with
 * placeholder markers so the boolean tokenizer below never sees their
 * internal "or"/"and" words as real connectors. Returns the substituted text
 * plus the original matched substrings, indexed by placeholder id. */
function substitutePhrases(text: string): { text: string; placeholders: string[] } {
  let result = text.replace(SUCCESSFUL_COMPLETION_RE, (_match, code: string) => code.toUpperCase());

  const placeholders: string[] = [];
  for (const re of [...TRAILER_SENTENCE_PATTERNS, ...KNOWN_PHRASE_PATTERNS]) {
    result = result.replace(re, (match) => {
      const idx = placeholders.length;
      placeholders.push(match.trim());
      return `${PLACEHOLDER_OPEN}${idx}${PLACEHOLDER_CLOSE}`;
    });
  }
  return { text: result, placeholders };
}

function tokenize(text: string, placeholders: string[]): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const rest = text.slice(i);

    const ws = /^\s+/.exec(rest);
    if (ws) {
      i += ws[0].length;
      continue;
    }
    if (rest[0] === ".") {
      i += 1;
      continue;
    }
    if (rest[0] === "(") {
      tokens.push({ type: "LPAREN", value: "(", raw: "(" });
      i += 1;
      continue;
    }
    if (rest[0] === ")") {
      tokens.push({ type: "RPAREN", value: ")", raw: ")" });
      i += 1;
      continue;
    }
    if (rest[0] === ",") {
      tokens.push({ type: "COMMA", value: ",", raw: "," });
      i += 1;
      continue;
    }

    const phMatch = PLACEHOLDER_RE.exec(rest);
    if (phMatch) {
      tokens.push({ type: "PHRASE", value: placeholders[Number(phMatch[1])], raw: phMatch[0] });
      i += phMatch[0].length;
      continue;
    }

    // "in" is sometimes dropped in the real data ("C- or better MATH-172",
    // confirmed on MATH-211/219/221) alongside the more common "C- or
    // better in MATH-172" — both are handled by making it optional.
    const gradePrefix = /^([A-Za-z][+-]?)\s+or\s+(?:better|higher)\s+(?:in\s+)?/i.exec(rest);
    if (gradePrefix) {
      tokens.push({ type: "GRADE_PREFIX", value: gradePrefix[1].toUpperCase(), raw: gradePrefix[0] });
      i += gradePrefix[0].length;
      continue;
    }

    // Two real suffix shapes: "with a grade of C- or better" (the common
    // one) and "with a minimum grade of B-," (no "or better/higher" at all —
    // confirmed on MATH-181/181R).
    const gradeSuffix = /^(?:(?:with\s+|w\/\s*)?(?:a\s+)?(?:grades?\s+of\s+)?([A-Za-z][+-]?)\s+or\s+(?:better|higher)\b(?:\s+in\s+(?:all|both)\s+courses?)?|(?:with\s+)?(?:a\s+)?minimum\s+grade\s+of\s+([A-Za-z][+-]?),?)/i.exec(
      rest,
    );
    if (gradeSuffix) {
      const grade = gradeSuffix[1] ?? gradeSuffix[2];
      tokens.push({ type: "GRADE_SUFFIX", value: grade.toUpperCase(), raw: gradeSuffix[0] });
      i += gradeSuffix[0].length;
      continue;
    }

    const connector = /^(and|or)\b/i.exec(rest);
    if (connector) {
      tokens.push({ type: connector[1].toLowerCase() === "and" ? "AND" : "OR", value: connector[1], raw: connector[0] });
      i += connector[0].length;
      continue;
    }

    const alphaCourse = /^([A-Za-z]{2,6})[-\s](\d{1,4}[A-Za-z]?)\b/.exec(rest);
    if (alphaCourse) {
      const code = `${alphaCourse[1].toUpperCase()}-${alphaCourse[2].toUpperCase()}`;
      tokens.push({ type: "COURSE", value: code, raw: alphaCourse[0] });
      i += alphaCourse[0].length;
      continue;
    }

    const numericCourse = /^(\d{3,4})-(\d{2,4}[A-Za-z]?)\b/.exec(rest);
    if (numericCourse) {
      const code = `${numericCourse[1]}-${numericCourse[2]}`;
      tokens.push({ type: "COURSE", value: code, raw: numericCourse[0] });
      i += numericCourse[0].length;
      continue;
    }

    const word = /^[^\s(),.]+/.exec(rest);
    const chunk = word ? word[0] : rest[0];
    tokens.push({ type: "TEXT", value: chunk, raw: chunk });
    i += chunk.length;
  }

  return tokens;
}

function applyGradeToLeaves(node: PrereqNode, grade: string): void {
  if (node.nodeType === "course") {
    if (node.minGrade === null) node.minGrade = grade;
    return;
  }
  if (node.nodeType === "group") {
    for (const child of node.children) applyGradeToLeaves(child, grade);
  }
}

function markCorequisite(node: PrereqNode): void {
  if (node.nodeType === "group") {
    node.children.forEach(markCorequisite);
    return;
  }
  node.isCorequisite = true;
}

function maybeApplyGradeSuffix(node: PrereqNode, tokens: Token[], i: number): { node: PrereqNode; i: number } {
  if (tokens[i]?.type === "GRADE_SUFFIX") {
    applyGradeToLeaves(node, tokens[i].value);
    return { node, i: i + 1 };
  }
  return { node, i };
}

function parseAtom(tokens: Token[], i: number, ctx: ParseCtx): { node: PrereqNode; i: number } {
  const tok = tokens[i];
  if (!tok) {
    return { node: { nodeType: "unparsed", rawFragment: "", isCorequisite: false }, i };
  }

  if (tok.type === "LPAREN") {
    let next = i + 1;
    let prefixGrade: string | null = null;
    if (tokens[next]?.type === "GRADE_PREFIX") {
      prefixGrade = tokens[next].value;
      next += 1;
    }
    const inner = parseOr(tokens, next, ctx);
    next = inner.i;
    if (prefixGrade) applyGradeToLeaves(inner.node, prefixGrade);
    if (tokens[next]?.type === "RPAREN") {
      next += 1;
    }
    return maybeApplyGradeSuffix(inner.node, tokens, next);
  }

  if (tok.type === "GRADE_PREFIX") {
    // A grade-prefix reached here (not at the very start of the clause,
    // which parseClauseText already special-cases) scopes to exactly the
    // next atom, not the rest of the OR-chain — confirmed real on MATH-171,
    // which has two independent "C- or better in X" alternatives at the same
    // OR level, each scoped to its own X only.
    const next = parseAtom(tokens, i + 1, ctx);
    applyGradeToLeaves(next.node, tok.value);
    return next;
  }

  if (tok.type === "COURSE") {
    // Grade-suffix scoping is deliberately NOT checked here: a suffix right
    // after a single course atom is instead picked up one level up, by
    // parseAnd's own end-of-group check (see below) — which lets "CSEC-600
    // and CSEC-604 with B or better in both courses" apply the grade to the
    // whole AND-group instead of only the immediately preceding course.
    ctx.classified = true;
    return { node: { nodeType: "course", code: tok.value, minGrade: null, isCorequisite: false }, i: i + 1 };
  }

  if (tok.type === "PHRASE") {
    ctx.classified = true;
    return { node: { nodeType: "unparsed", rawFragment: tok.value, isCorequisite: false }, i: i + 1 };
  }

  if (tok.type === "RPAREN" || tok.type === "AND" || tok.type === "OR" || tok.type === "COMMA") {
    // A stray closing paren or connector with no left-hand operand reached
    // at atom position — a real, confirmed data typo (CSCI-344's prereq_text
    // is missing its opening "(", which orphans the "and" right after the
    // paren that should have closed) rather than lost content. Punctuation
    // like this carries no information of its own to preserve, so it's
    // silently skipped (try the next atom) rather than marked unclassified.
    return parseAtom(tokens, i + 1, ctx);
  }

  // TEXT, or a structural token reached where an atom was expected (stray
  // AND/OR/COMMA/GRADE_SUFFIX with nothing before it) — consume it so
  // parsing always makes forward progress, and mark unclassified since it's
  // genuinely not understood.
  ctx.unclassified = true;
  return { node: { nodeType: "unparsed", rawFragment: tok.raw, isCorequisite: false }, i: i + 1 };
}

function parseAnd(tokens: Token[], i: number, ctx: ParseCtx): { node: PrereqNode; i: number } {
  const first = parseAtom(tokens, i, ctx);
  const children: PrereqNode[] = [first.node];
  let next = first.i;
  while (tokens[next]?.type === "AND") {
    next += 1;
    const r = parseAtom(tokens, next, ctx);
    children.push(r.node);
    next = r.i;
  }
  const node: PrereqNode = children.length === 1 ? children[0] : { nodeType: "group", logic: "AND", children };
  return maybeApplyGradeSuffix(node, tokens, next);
}

function parseOr(tokens: Token[], i: number, ctx: ParseCtx): { node: PrereqNode; i: number } {
  const first = parseAnd(tokens, i, ctx);
  const children: PrereqNode[] = [first.node];
  let next = first.i;
  while (tokens[next]?.type === "OR" || tokens[next]?.type === "COMMA") {
    next += 1;
    const r = parseAnd(tokens, next, ctx);
    children.push(r.node);
    next = r.i;
  }
  const node: PrereqNode = children.length === 1 ? children[0] : { nodeType: "group", logic: "OR", children };
  return maybeApplyGradeSuffix(node, tokens, next);
}

/** Parses one labeled clause's body (the text after a "Prerequisites:" or
 * "Co-requisites:" header, or the whole string when no header was found).
 * Handles multiple sentences with no explicit connector between them
 * (e.g. a credit-restriction sentence tacked on after the real clause) by
 * implicitly AND-joining successive top-level parses. */
function parseClauseText(text: string, isCorequisite: boolean, ctx: ParseCtx): PrereqNode {
  const { text: substituted, placeholders } = substitutePhrases(text);
  const tokens = tokenize(substituted, placeholders);

  let i = 0;
  let prefixGrade: string | null = null;
  if (tokens[i]?.type === "GRADE_PREFIX") {
    prefixGrade = tokens[i].value;
    i += 1;
  }

  const parts: PrereqNode[] = [];
  while (i < tokens.length) {
    const r = parseOr(tokens, i, ctx);
    parts.push(r.node);
    i = r.i > i ? r.i : i + 1; // guard against zero-progress
  }

  const result: PrereqNode = parts.length === 1 ? parts[0] : { nodeType: "group", logic: "AND", children: parts };
  if (prefixGrade) applyGradeToLeaves(result, prefixGrade);
  if (isCorequisite) markCorequisite(result);
  return result;
}

export function parsePrereqText(rawText: string | null | undefined): ParseResult {
  if (rawText == null || rawText.trim().length === 0) {
    return { status: "failed", tree: { nodeType: "unparsed", rawFragment: rawText ?? "", isCorequisite: false } };
  }

  const normalized = normalizeText(rawText);
  if (isNoPrerequisites(normalized)) {
    return { status: "none", tree: null };
  }

  const { prereqBody, coreqBody } = splitIntoSections(normalized);

  const ctx: ParseCtx = { unclassified: false, classified: false };
  const parts: PrereqNode[] = [];
  if (prereqBody.length > 0) parts.push(parseClauseText(prereqBody, false, ctx));
  if (coreqBody.length > 0) parts.push(parseClauseText(coreqBody, true, ctx));

  if (parts.length === 0) {
    // Nothing left after stripping the header/campus prefix (e.g. MATH-90's
    // "RIT Dubai " on its own) — genuinely unrecognizable, not a "No
    // Prerequisites" declaration.
    return { status: "failed", tree: { nodeType: "unparsed", rawFragment: rawText.trim(), isCorequisite: false } };
  }

  const tree: PrereqNode = parts.length === 1 ? parts[0] : { nodeType: "group", logic: "AND", children: parts };
  const status: PrereqParseStatus = !ctx.unclassified ? "parsed" : ctx.classified ? "partial" : "failed";
  return { status, tree };
}
