# Claude Code Handoff Brief — Phase 1

**Status:** Phase 0 (data & schema planning) complete. This brief defines the
first implementation work.

**Read first:** `/CLAUDE.md`, `docs/architecture/data-sources.md`,
`docs/architecture/schema-decisions.md`, `db/schema.sql`.

---

## Task 0 — Verification (do this before anything else)

Five questions could not be answered without a real HTTP client. **Everything
downstream depends on the answers. Do not build ingestion until these are closed.**

Record results in `docs/architecture/data-sources.md`.

### 0.1 — Does the Programs API expose a course-level endpoint?

The program-level endpoint is confirmed working:

```
GET https://www.rit.edu/programs-api/courseleaf/proxy-api.php\
?url=/programs/{slug}/index.xml&section=curriculum&removeheader=true
```

Unknown: whether an equivalent exists for individual courses. The search form on
https://www.rit.edu/programs-api/ accepts a course code (e.g. `ACCT-110`), so
some course path exists. Probe candidates:

- `url=/courses/csci/index.xml`
- `url=/courses/csci-141/index.xml`
- `url=/coursesaz/csci/index.xml`  (common CourseLeaf convention)
- Inspect the form's own network calls in a browser to get the real pattern

**Why it matters most:** this is the best candidate source for BOTH
(a) structured prerequisites and (b) "typically offered" text seeding
`catalog_course_availability`. If it exists and carries offering notes, both
validation features work from day one. If not, availability falls back to weak
plan-of-study inference until several terms accumulate.

Also verify the program endpoint works for arbitrary slugs (e.g.
`computer-science-bs`) — this was untestable previously due to a caching artifact
in the exploratory tool, not a limitation of the API.

### 0.2 — Does `class-search` accept a cookie-less POST?

`GET /tigerCenterApi/tc/currentTerms` and `/advancedSearchData` are **confirmed**
to work with no cookies at all. `class-search` sits outside the `/login_shib/`
path, so it likely does too — but it was never tested without a session because
POST was unavailable.

Test the documented POST body (see `docs/architecture/data-sources.md`) with no
`-b` cookie flag. If it fails, determine the minimum bootstrap: likely a plain
GET of the app page to obtain `INGRESSID` / `TC_SESSIONID`, then reuse.

**Never hardcode a session token.** Bootstrap at runtime, handle expiry.

### 0.3 — Do undergraduate courses populate the attribute fields?

The sampled row (`CSCI-723`, a GRAD course) returned empty `attributes`,
`attributeKeys`, `attributeValues`. Gen Ed tags would only appear on UGRD courses.

Test: `class-search` with `courseAttributeOptions: ["ARTISTIC"]`, and separately
a query for a known Gen Ed subject (`PHIL`, `ARTH`, `SOCI`).

**This is the mechanism behind placeholder resolution (MVP feature #8).** If
attributes do not populate as expected, that feature needs a different source
and the PRD must be revisited.

### 0.4 — What is the maximum accepted `rows` value?

Sample used `rows: 5`. `currentTerms` internally used `rows: 200`. Find the
ceiling — it determines request volume for a full ingestion run.

### 0.5 — How are Immersions represented in the Programs API?

`advancedSearchData` has **no** Immersion attribute — immersions are 3-course
sequences, not a single-course tag. The CS flowchart has three Immersion slots.
Determine how CourseLeaf exposes immersion definitions and their course lists.

---

## Task 1 — Project scaffold

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
