# CLAUDE.md

Conventions and guardrails for this repository. Read this before making changes.

---

## What this project is

A web app for RIT students to plan their **entire degree** as an interactive,
drag-and-drop flowchart — modelled on RIT's official department flowcharts
(see `docs/product/prd.md` and the reference PDF).

**Scope discipline matters here.** This plans *whole curricula*: "will I satisfy
every requirement before I graduate?" It is **not** a semester scheduler. We do
not care about specific sections, professors, meeting times, or seat counts.
If a proposed feature involves picking a section or building a weekly schedule,
it is out of scope — say so rather than building it.

---

## Stack

- **Database / Auth:** Supabase (Postgres 15+, email+password auth, RLS enforced)
- **Repo:** this one
- **Schema:** `db/schema.sql` is the source of truth
- **Design:** produced in Claude Design, specs land in `docs/`

---

## The four domain concepts you must not get wrong

### 1. Slots are templates. Blocks are copies.

`catalog_requirement_slots` describes what a *program* requires.
`flowchart_blocks` is what a *user* actually planned.

When a user starts a flowchart from a program, blocks are **materialized copies**
of slots — not foreign-key references to them. If RIT revises the CS curriculum,
existing user flowcharts must not silently mutate.

`flowchart_blocks.source_slot_id` preserves provenance so a future "the template
changed — sync?" feature is possible. `is_user_modified` marks blocks the user
has edited so a sync never clobbers their work.

**Never** make a user's flowchart render by joining live to `catalog_requirement_slots`.

### 2. Resolving a placeholder keeps the placeholder.

A Gen Ed slot filled with a real course keeps `kind = 'placeholder'` and *gains*
a `course_id`. It does not become `kind = 'course'`.

This preserves "this was a Gen Ed Artistic slot, filled with ARTH-135" — needed
for requirement validation later. Flattening it loses information permanently.

### 3. Position is semantic, never pixels.

Blocks are positioned by `(year_number, season, sort_order)`. Drag-and-drop
reorders within that grid. Do **not** introduce `x`/`y` pixel coordinates —
credit-per-term totals and prerequisite ordering checks depend on semantic
position being queryable.

### 4. Validation is warn-only. Never warn from an inference you can't stand behind.

This applies to both prerequisite checking and term availability.

- Prereqs: only reason about courses where `prereq_parse_status = 'parsed'`.
  Courses that are `partial`/`failed`/`unparsed` produce **silence**, not guesses.
- Availability: only warn above a confidence threshold. Low-confidence
  availability produces **silence**.

A false warning is far worse than a missing one. Users will stop trusting the
tool after one wrong flag.

---

## Data sources

Two sources, different roles. See `docs/architecture/data-sources.md` for full detail.

| Source | Role | Volatility |
|---|---|---|
| **Programs API / CourseLeaf** | Canonical curriculum structure, degree requirements, immersions | Stable |
| **TigerCenter** | Current-term course data, Gen Ed attributes, prereq text, credits | One term only, volatile |

Build flowcharts from the first. Enrich with the second.

**Keep them as separate, swappable adapters behind one interface.** A TigerCenter
outage must degrade enrichment without breaking flowcharts. Both APIs are
undocumented and may change without notice.

### Ingestion rules

- **Persist raw payloads** to `ingest_documents` *before* parsing. Re-normalizing
  must never require re-fetching.
- **Rate-limit.** These are university servers and we are uninvited guests. Serial
  requests with a delay, not parallel bursts.
- **Cache aggressively.** Use `content_hash` to skip unchanged documents.
- **Bootstrap sessions at runtime.** Never hardcode cookies (see Secrets below).
- **Fail gracefully.** Check `/tigerCenterApi/tc/maintenance` before bulk runs.
- **Review RIT's terms of use** before any bulk ingestion run. If unclear, ask
  rather than proceeding.

---

## Hard rules

### Secrets

- **Never commit cookies, session tokens, API keys, or `.env` files.**
  `TC_SESSIONID` / `INGRESSID` values appear in exploratory notes — they are live
  session tokens and must never enter the repo or any doc.
- Supabase **service role key** is used only by ingestion scripts, never by app
  code, never client-side.

### Database

- `catalog_*` and `ingest_*` tables are written **only** by ingestion scripts
  running with the service role. Application code reads catalog, and reads/writes
  only `profiles`, `flowcharts`, `flowchart_programs`, `flowchart_blocks`.
- **RLS is not optional.** Any new user-data table gets RLS enabled and a policy
  scoped to `auth.uid()` in the same commit that creates it.
- Schema changes go in numbered migration files. Never edit `db/schema.sql`
  in place to mean "the DB has changed" — it is the consolidated definition.

### Scope

- Do not build section/meeting-time features (see "What this project is").
- Do not build requirement *validation UI* without checking `docs/product/prd.md` —
  it is deliberately v2. Parsing and data capture are v1; the UI is not.

---

## Working style

- **Small, reviewable PRs**, one feature slice each. The project owner reviews
  diffs but does not write code — a 2,000-line PR cannot be meaningfully reviewed.
- **Write tests for core logic**: prereq parsing, availability inference,
  template→flowchart instantiation, credit totals. Tests are the review proxy.
  UI polish does not need exhaustive tests.
- **State assumptions explicitly.** If a requirement is ambiguous, ask rather
  than picking silently — the cost of a wrong guess compounds here.
- **Update `docs/` when behavior changes.** Docs are mirrored to Google Drive;
  the repo copy is authoritative.

---

## Open questions

Tracked in `docs/handoff/claude-code-brief.md`. Several data-source questions
were unresolvable without a real HTTP client and are the **first** tasks to
close out. Do not build ingestion on assumptions before verifying them.
