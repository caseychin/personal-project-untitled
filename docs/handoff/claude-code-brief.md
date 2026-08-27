# Claude Code Handoff Brief — Phase 1

**Status:** Phase 0 (data & schema planning) complete. This brief defines the
first implementation work.

**Read first:** `/CLAUDE.md`, `docs/architecture/data-sources.md`,
`docs/architecture/schema-decisions.md`, `db/schema.sql`.

---

## Task 0 — Verification (do this before anything else)

Five questions could not be answered without a real HTTP client. **Everything
downstream depends on the answers. Do not build ingestion until these are closed.**
Two more (0.6, 0.7) surfaced during verification and were added below.

Record results in `docs/architecture/data-sources.md`.

**Status as of 2026-08-26:** All of Task 0 (0.1–0.7) is RESOLVED. Task 1
(project scaffold) and Task 2/3 (ingestion) can now start.

### 0.1 — Does the Programs API expose a course-level endpoint? — RESOLVED

Yes: `GET /programs-api/courseleaf/proxy-bubble.php?code={SUBJECT-NUMBER}`,
anonymous, no cookies. Found via `functions.js` (the `showCourse()` handler),
not by guessing paths — none of the candidate URLs below were the right one.
Returns title/credits/description/contact-hours plus, critically, a
`Typically Offered: ...` note (answers the availability half) and a
`Prerequisite: ...` line with each referenced course as a
`title`-attributed link (answers the prereq half, and better than expected —
codes are structurally extractable, not just free text). Full detail and
sample payloads in `docs/architecture/data-sources.md`.

The program-level endpoint is confirmed working:

```
GET https://www.rit.edu/programs-api/courseleaf/proxy-api.php\
?url=/programs/{slug}/index.xml&section=curriculum&removeheader=true
```

The course-level endpoint turned out not to match any of the `proxy-api.php`-style
guesses (`/courses/csci/index.xml`, `/coursesaz/csci/index.xml`, etc.) — it's a
different script (`proxy-bubble.php`) entirely, surfaced only by reading the
`showCourse()` JS handler rather than guessing URL shapes. See the RESOLVED
note above.

Also verified: the program endpoint works for arbitrary slugs (e.g.
`computer-science-bs`), confirming the earlier "untestable" caveat was a
caching artifact in the exploratory tool, not a limitation of the API.

### 0.2 — Does `class-search` accept a cookie-less POST? — RESOLVED

Yes. A cookie-less POST of the documented body returns `200` with a valid
JSON envelope, and reusing the ingress-issued `INGRESSID` cookie on a repeat
of the identical request produced a byte-identical result — cookies make no
observable difference. `/maintenance` reports `searchDown: false`, so the
endpoint isn't gating on auth. No endpoint probed (root page,
`/tigerCenterApp/`, or `class-search` itself) ever issued a `TC_SESSIONID` —
only `INGRESSID`, which behaves like a load-balancer routing cookie rather
than an app session token. **No bootstrap step is needed for `class-search`.**
Full detail in `docs/architecture/data-sources.md`.

This surfaced an unrelated, unresolved anomaly: every query shape tried
against the current term (`2261`) returned `found: 0`, cookie-less or not.
That's tracked separately as Task 0.6 below — do not let it block treating
0.2 itself as closed.

### 0.3 — Do undergraduate courses populate the attribute fields? — RESOLVED (via workaround)

`class-search` itself couldn't be tested directly: it's blocked by Task 0.6
(every query, including a fully unconstrained one with no filters, returns
`found: 0` for the current term — see 0.6 below). This isn't a request-shape
bug on our end; `autoComplete` returns real data for the same term, so the
`class-search` index itself looks unpopulated for `2261` right now.

Rather than wait on that, the question was answered through the Programs API
endpoint already confirmed in 0.1 (`proxy-bubble.php?code={code}`). Its
`detail-ge_attrs` field reliably populates for undergraduate Gen Ed courses,
verified cookie-less on three courses: `CSCI-141` (original 0.1 sample —
`GE: Elective, GE: Mathematical Perspective, NTID Math Processes, SMTL:
Science/Math Literacy`), `ARTH-135` (`GE: Elective, GE: Artistic Perspective,
GE: Global Perspective`), `PHIL-101` (`GE: Elective, GE: Ethical Perspective,
GE: Social Perspective`). All map cleanly by name onto the `advancedSearchData`
Gen Ed vocabulary table in `docs/architecture/data-sources.md`.

**This is now the adopted mechanism for placeholder resolution (MVP feature #8):**
parse `detail-ge_attrs` free text against the vocabulary table via the Programs
API adapter (Task 2), not TigerCenter's `attributeKeys`/`attributeValues`
(Task 3). This also means the mechanism doesn't depend on TigerCenter being
healthy at all — it rides on the same endpoint Task 2 already fetches for
prereqs and availability. Revisit if a future `class-search` probe shows the
two sources disagree.

**Update 2026-08-26 — the "two sources disagree" check happened.** Task 0.6
turned out to be a missing `Accept: application/json` header, not a real
outage — `class-search` works now. Queried `ARTH-135` directly:
`attributeKeys: ["ACCS","GE","PERS"]`,
`attributeDescriptions` including `"GE: Artistic Perspective"` and
`"General Education Elective"` — **agrees with the Programs API finding
above.** Both sources are now confirmed working. The Programs API adapter
is still a perfectly good choice (it's catalog-year-scoped and doesn't
depend on TigerCenter uptime, as noted above), but "TigerCenter's field
doesn't work" is no longer true and shouldn't be cited as the reason to
prefer it — that's now a design choice, not a forced one. Not re-deciding
this here.

### 0.4 — What is the maximum accepted `rows` value? — RESOLVED

Sample used `rows: 5`. `currentTerms` internally used `rows: 200`. Find the
ceiling — it determines request volume for a full ingestion run.

**First pass (2026-08-26), before the 0.6 fix was known:** `rows: 5, 200,
1000, 10000, 100000` against term `2261`, otherwise identical bodies, all
returned identical `200` / `{"found":0,"searchResults":[]}` — useless data,
since every one of these requests was silently failing on the missing
`Accept` header (0.6), not actually exercising row-fetching. Static analysis
of the live frontend also found its page-size selector hardcoded to
`[5, 10, 25, 50, 100]` — a real client-side data point, but not a confirmed
server ceiling.

**Real answer, after the 0.6 fix (2026-08-26):** re-tested against an
unconstrained query (`query: ""`, term `2261`, `found: 6676` real results)
to guarantee enough rows to hit any ceiling, binary-searching the boundary:

| `rows` | Result |
|---|---|
| 5 – 140 | `200`, full real data |
| 141 and above | `500 INTERNAL_SERVER_ERROR` — leaked Java stack trace, `ClassSearchServiceImpl.search`, "Error extracting parameters" |

**The ceiling is `rows: 140`, and it's a real server bug, not a documented
limit** — `141` is rejected outright with a verbose stack trace rather than
clamped or gracefully errored. One nuance: it only triggers when the query
actually has ≥141 real rows to return — `query: "CSCI"` (`found: 139`)
succeeded even at `rows: 200`, because the server only ever had 139 rows to
produce. Requesting more than what's available is clamped silently; asking
for more than 140 *actual* rows breaks. **Practical rule for Task 2/3
ingestion:** page at `rows: 100` (under the ceiling, matches the frontend's
own max).

### 0.5 — How are Immersions represented in the Programs API? — RESOLVED

Immersions are **separate, sibling CourseLeaf program pages** — not a section
of the degree program's curriculum. The CS BS Plan of Study Grid references
its three Immersion slots by name only, as plain unlinked text (no course
codes, no links), unlike Gen Ed Perspective slots, which link out to their
course-list pages.

Found via static analysis of `functions.js` (same technique as Task 0.1):
its accordion logic special-cases any page whose `<h1>` contains "minor",
"immersion", "exploration", etc. — implying immersions are catalog pages
structurally parallel to minors, not sub-resources of degree pages. Confirmed:
the same curriculum endpoint used for degree programs
(`proxy-api.php?url=/programs/{slug}/index.xml&section=curriculum`) works
identically against an immersion slug (verified on `physics-immersion`),
returning an `sc_courselist` select-N-of-M table (Prerequisites / Required /
Electives), not a year/term Plan of Study Grid.

A full, static-HTML enumeration of all 77 immersion slugs exists at
`https://www.rit.edu/study/immersions-and-minors` — directly scrapable, no
JS rendering needed (unlike program marketing pages). None is CS-specific by
name; immersion choice is a free student pick from the full catalog, not
prescribed per-program — consistent with the CS BS grid's generic, unlinked
placeholders. Full detail in `docs/architecture/data-sources.md`.

**Practical implication for Task 2:** ingest immersions as their own
entities, independent of degree-program curriculum parsing, then reference
them generically from Immersion placeholder slots.

**Not yet verified:** whether all 77 immersion pages share the exact
`physics-immersion` response shape (only one sampled) — sample a couple more
before building the Task 2 parser against it. Also unresolved: the exact
`section=` query values for "admission requirements" / "additional
information" (two spelling guesses both `400`'d) — doesn't block 0.5, noted
for whoever needs those sections next.

### 0.6 — Why does `class-search` return zero results for every query, cookie-less? — RESOLVED

Surfaced while resolving 0.2. Probes so far, all against `term: "2261"`
(confirmed the active term via `currentTerms`), all cookie-less, all `200`
with valid JSON: the documented body verbatim (`query: "CSCI"`), a
`subject: "CSCI"` + `isAdvanced: true` variant, and a free-text query on a
real course-title word (`"Calculus"`). Every one returned
`{"found":0,"searchResults":[]}`. `/maintenance` shows `searchDown: false`
and `/advancedSearchData` returns real vocabulary data, so the backend is up —
this isn't a global outage.

Cookies are very likely not the cause (0.2 showed identical results with and
without the ingress cookie attached), so don't re-litigate that. Candidate
next steps, roughly cheapest-first:

- **Capture the real frontend request.** Open `tigercenter.rit.edu` in a
  browser, run an actual class search, and diff the real request body/headers
  against the documented one in a devtools network trace. The documented body
  may be stale relative to the current frontend build — an undocumented
  required field or a differently-shaped `filterAnd` is the most likely
  culprit.
- **Try an older term code**, if `currentTerms` ever lists more than one, to
  check whether the *current* term specifically is unindexed (e.g. schedule
  not yet published in Solr for `2261`) versus search being broken generally.
- **Try `rows` far larger with an empty query** (`query: ""`, `isAdvanced:
  false`, no filters at all) — if that's also `found: 0`, the whole index for
  this term is empty rather than the query being malformed, which points at a
  data-availability problem, not a request-shape problem.
- **Check `autoComplete?query=CSCI&term=2261`** — if it returns real subject
  suggestions but `class-search` doesn't, that's strong evidence the two
  endpoints read from different indexes or the search index just isn't
  populated yet for this term.
- Only after the above: consider whether an authenticated (SSO) session
  produces different results, to rule out an entitlement gate that doesn't
  reduce to the `INGRESSID`/`TC_SESSIONID` cookie story already ruled out.
  This would require a real RIT login and should not be attempted without
  checking in first — out of scope for anonymous verification.

**Follow-up (2026-08-22):** ran the first three candidate steps above (skipped
the older-term-code step — `currentTerms` still lists only one term; skipped
the SSO step — out of scope without checking in first). A fully unconstrained
query (`query: ""`, `isAdvanced: false`, no filters, `rows: 100`) still
returned `found: 0`, which rules out a malformed request as the cause.
`autoComplete?query=CSCI&term=2261` returned full, real subject/course-code
data for the same term. Together this points to `class-search`'s backing
index being empty for `2261` specifically — a data-availability gap, not a
request-shape bug — though a real browser network trace (the still-untried
first candidate step) would be needed to fully rule out an undocumented
required field. **Not fully closed**, but this redirected Task 0.3 to a
Programs API workaround rather than waiting on it — see 0.3 above.

**Follow-up (2026-08-26):** no browser/devtools automation is available in
this environment, so the "capture the real frontend request" step was done
via static analysis instead — downloaded the live TigerCenter Angular
bundles and located the actual search component's source. Its default
request body matches the documented sample field-for-field, with exactly
one addition: `classBeginsAt: ""`. Added that field and re-probed
cookie-less against term `2261` — **no change**, still `found: 0`, ruling
out the missing field as the cause. HTTP client config (base URL, headers)
also confirmed identical to what's been used in every probe so far.

Net effect: this strengthens the data-availability-gap theory rather than
opening a new lead — the documented request was already an exact functional
replica of the real frontend's. **Still not fully closed.**

**Follow-up (2026-08-26, continued) — reframing.** Tested two additional
term codes, each confirmed genuine first via a control (`autoComplete` with
an obviously-fake term `9999` returns empty; real terms don't):

- `2255` (Spring 2026, **already completed**) — `autoComplete`: real,
  term-specific course list. `class-search`: `found: 0`.
- `2251` (Fall 2025, **already completed**) — `autoComplete`: real,
  term-specific course list. `class-search`: `found: 0`.

Both are fully-taught, historical terms — "the schedule isn't published
yet" cannot explain a zero result for either. **This is not a `2261`-specific
data-availability gap.** `class-search` returns `found: 0` across every term
tested while `autoComplete` differentiates all three correctly. The likelier
picture now: `class-search` itself is broken, decommissioned, or being
selectively filtered — not that one term's search index hasn't been built
yet.

This also complicates (doesn't yet overturn) the "TigerCenter cannot supply
historical data" framing used to justify the accumulate-forward design of
`catalog_course_term_offerings` — `autoComplete` clearly holds
term-differentiated data for terms `currentTerms` never lists. See the
parallel note in `docs/architecture/data-sources.md` and the flag in
`schema-decisions.md`.

New untried, cheap, no-check-in-needed hypothesis: `class-search` is the
only "heavy" data endpoint that fails while three lighter lookup endpoints
work fine on identical cookie-less requests — consistent with
bot-mitigation/WAF selectively soft-blocking the valuable bulk endpoint
based on client fingerprint (e.g. `User-Agent`) rather than an empty
backend. Every probe so far used curl's default `User-Agent`; none has
varied it. Remaining candidates, roughly cheapest-first: vary the
`User-Agent`/headers; a live browser network trace; the SSO-authenticated
probe (still needs a check-in first, not attempted).

**Final resolution (2026-08-26).** Tested the fingerprint hypothesis by
varying headers one at a time against the exact `found: 0` body:

| Headers added | Result |
|---|---|
| `User-Agent` (realistic Chrome UA) alone | `found: 0` |
| `User-Agent` + `Accept` + `Accept-Language` | `found: 139` |
| `Accept: application/json, text/plain, */*` alone (default curl UA) | `found: 139` |
| **`Accept: application/json` alone** | **`found: 139`** |
| Baseline again immediately after, no `Accept` override | `found: 0` |

**`Accept: application/json` is the entire fix.** Not `User-Agent`, not
cookies, not SSO, not a body field. Every `found: 0` result in this
document and in `data-sources.md` — the 0.2 sample, the original 0.3
blocker, every first-pass 0.4 probe, the multi-term test above — was
missing this one header. It genuinely was a request-shape bug the whole
time; the data-availability-gap theory that drove most of this
investigation was wrong. Neither the live browser trace nor the SSO probe
was needed in the end.

**Side effects, each followed up separately:**
- Task 0.3's Programs API workaround is no longer the *only* option —
  `class-search`'s attribute fields work now too (see 0.3 above).
- Task 0.4's `rows` ceiling could finally be tested against real data (see
  0.4 above) — it's `140`, and it's a genuine server bug at `141`, unrelated
  to this header issue.
- Re-tested `class-search` against the historical terms from the multi-term
  table above, now that it works: `2251` (Fall 2025) → `found: 145`, real
  data. Also tried `2231` (Fall 2023, 3 years back) → `found: 134`, real
  data. **This overturns, not just complicates, the "TigerCenter cannot
  supply historical data" premise** behind `catalog_course_term_offerings`'s
  accumulate-forward design — see the flag in `schema-decisions.md`. Not
  exhaustively tested (retention boundary unknown), but three years back
  with no degradation is a real finding, not a marginal one.

**Never hardcode a session token.** Bootstrap at runtime, handle expiry.

### 0.7 — Review RIT's terms of use before bulk ingestion — RESOLVED (accepted risk)

Read `rit.edu/terms-of-use` in full and checked `robots.txt` on both hosts.

**robots.txt — no blocker.** `rit.edu/robots.txt` disallows a fixed list of
specific program slugs (mostly grad programs) plus a handful of unrelated
paths (`/study/curriculum/`, `/directory*`, `/blog/`, etc.) — none overlap
with what ingestion touches (`/programs-api/courseleaf/*`,
`/study/computer-science-bs`, `/study/immersions-and-minors`).
`tigercenter.rit.edu/robots.txt` doesn't exist as a real file — the request
returns the Angular app's `index.html` (SPA catch-all), so there's nothing
to consult there.

**Terms of use — real tension, not a clean clearance.** No explicit
scraping/bot/automated-access clause exists. But:

> **§2 Proprietary Rights:** "you may print or download **one copy** of
> material available from our Site on any single computer for your
> **personal, noncommercial use only**. You may not copy, modify, transmit,
> distribute, sell, license, publicly display or perform, publish, edit, or
> create derivative works from material on our Site."

> **§3 Rules of Use:** "You may use our Site for personal, noncommercial,
> lawful purposes only."

An ingestion pipeline that bulk-fetches and persists catalog/program data,
feeding an app that redisplays it to many student users, is in tension with
a literal reading of §2 — "one copy... personal use" doesn't obviously cover
bulk fetch + storage + redisplay to a user base, regardless of the app's
noncommercial purpose.

**Decision (project owner, 2026-08-26): proceed, accepted as risk.** This is
a personal project, not a commercial one, which the project owner judged
sufficient to proceed despite the literal tension above. **This is a
judgment call, not a legal clearance** — flagging here so it isn't
mistaken for one if the project's scope or audience changes later (e.g.
if this ever moves beyond a personal tool to wider distribution, revisit).

---

## Task 1 — Project scaffold

**Status as of 2026-08-27: RESOLVED.** [PR #2](https://github.com/caseychin/personal-project-untitled/pull/2)
(branch `task-1-project-scaffold`, open against `main`, not yet merged).
Next.js (App Router) + TypeScript + Tailwind, `@supabase/ssr` for auth —
full rationale in the PR description. `db/schema.sql` applied as
`supabase/migrations/0001_initial_schema.sql` to both `rit-flowchart-dev`
and `rit-flowchart-prod`, `get_advisors` clean on both. The RLS cross-user
test (`tests/rls-cross-user.test.ts`) passes — 4/4 assertions — and the full
golden path (sign up → create a named flowchart → see it listed) was
verified end-to-end in a real browser, not just via the API-level test.

Two things worth knowing before touching this repo's Next.js tooling again:
- Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts` —
  that's `src/proxy.ts`.
- `next dev`/`next build` auto-write an agent-rules block into `AGENTS.md`,
  or into `CLAUDE.md` if `AGENTS.md` doesn't exist. `AGENTS.md` now exists
  specifically so that doesn't happen to `CLAUDE.md` — don't delete it.

Also: `rit-flowchart-dev`'s Auth setting "Confirm email" was turned off
(dev only, prod untouched) so the RLS test's `signUp()` calls return a
session immediately. Not reversed — needed again if the test is ever rerun
or extended.

- Initialize the app (framework choice is yours; justify briefly in a PR description)
- Create the Supabase project; separate **dev** and **prod** instances from the start
- Apply `db/schema.sql` as migration `0001_initial_schema.sql`
- Wire email+password auth; confirm RLS actually blocks cross-user reads
  (write a test that authenticates as user A and attempts to read user B's flowchart)
- `.env.example` committed; real `.env` git-ignored

**Acceptance:** a signed-in user can create an empty named flowchart and cannot
see anyone else's.

---

## Task 2 — Ingestion: Programs API adapter

Build behind a source-agnostic interface (`docs/architecture/data-sources.md`).

- Enumerate program slugs (derive from RIT program listing pages)
- Fetch curriculum per program; persist raw to `ingest_documents` first
- Parse the Plan of Study Grid into `catalog_programs` + `catalog_requirement_slots`
  - year number, season, sort order
  - `kind`: course / placeholder / coop
  - placeholders carry `label` (e.g. "Gen Ed Immersion 1", "Open Elective")
  - map Gen Ed placeholder labels → `catalog_attributes` where possible
- Handle degree options / subplans via `catalog_requirement_groups`
- Record `catalog_programs.catalog_year` (confirm how RIT versions these)

**Acceptance:** the CS BS program reconstructs to match the reference PDF —
same courses, same years, same terms, same co-op placement, correct total credits.
Write this as a test fixture.

---

## Task 3 — Ingestion: TigerCenter adapter

- Bootstrap session; respect `/maintenance`
- `GET /currentTerms` → `catalog_terms`
- `GET /advancedSearchData` → `catalog_colleges`, `catalog_subjects`, `catalog_attributes`
- Per subject, page `class-search` → courses
  - **Deduplicate on `courseId`** — results are section-level, not course-level
    (142 CSCI "results" ≠ 142 courses)
  - Populate `catalog_courses`, `catalog_course_attributes` (term-stamped)
  - Write `catalog_course_term_offerings` (one row per course per observed term)
  - **Discard section/meeting detail** after deriving course-level facts
- Reconcile with Programs API courses on `(subject_code, catalog_number)`;
  store `tigercenter_course_id` for cross-reference

**Acceptance:** every course referenced by the CS BS curriculum resolves to a
`catalog_courses` row with credits, title, and description. Report any that don't.

---

## Task 4 — Prerequisite parser

Parse `catalog_courses.prereq_text` → `catalog_course_prerequisites` tree.

Known patterns:
```
"Prerequisites:  CSCI-320 or CSCI-620 or equivalent course."
"(CSCI-141 with C- or higher)"
"(CSCI-243, MATH-190)"            -- comma = AND
"(MATH-182 co-req.)"
"4th or 5th year standing"        -- NOT a course reference
```

- Group nodes carry AND/OR; leaf nodes carry `required_course_id`
- Capture `min_grade`, `is_corequisite`
- Non-course conditions → `node_type = 'unparsed'` with `raw_fragment` retained
- Set `prereq_parse_status` honestly: `parsed` only when the **whole** string
  resolved. Anything else is `partial` or `failed`.

**Acceptance:** ≥80% of CS/MATH courses reach `parsed`. Ship a test fixture of
~30 real prereq strings with expected trees. **Do not inflate `parsed`** — the
warn-only guarantee depends on that flag being trustworthy.

---

## Task 5 — Availability seeding

Populate `catalog_course_availability` from the sources in priority order
(see the table comment in `db/schema.sql`):

1. `catalog_text` — if Task 0.1 found offering notes (confidence ~0.9)
2. `plan_of_study` — infer from `catalog_requirement_slots` placement (~0.2)
3. `observed` — from `catalog_course_term_offerings`, growing per term
4. `manual` — override, 1.0

**Acceptance:** no course claims availability at confidence > 0.5 on the strength
of a single observed term. Verify explicitly — this is the failure mode that
would make the feature fire false warnings on every Spring block.

---

## Not in Phase 1

- Flowchart canvas / drag-and-drop UI (Phase 4, needs Claude Design output)
- Requirement validation **UI** (v2 — parsing is v1, surfacing it is not)
- Section/meeting features (permanently out of scope)
- Sharing / advisor view (v2)
- Multi-program double-counting rules (v2)

---

## Reporting back

For each task, PR with: what you verified, what you assumed, what surprised you.
Flag anything contradicting `docs/architecture/data-sources.md` immediately —
those findings are the foundation for the schema, and a wrong assumption there
is expensive to unwind later.
