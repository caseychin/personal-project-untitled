# Schema Design Decisions

Rationale for `db/schema.sql`. Read alongside `CLAUDE.md`.

---

## Layering

Three layers, all in `public` for Supabase/PostgREST simplicity; prefixes carry
the separation.

- **`ingest_*`** — raw API payloads. Service-role only (RLS enabled, no policies).
- **`catalog_*`** — normalized institution reference data. World-readable to
  signed-in users; written only by ingestion.
- **app tables** — `profiles`, `flowcharts`, `flowchart_programs`,
  `flowchart_blocks`. RLS scoped to `auth.uid()`.

Raw payloads are persisted **before** parsing so re-normalization never requires
re-fetching, and so upstream schema drift can be diffed over time.

---

## Decision 1 — Blocks are copies, not references

`flowchart_blocks` are materialized copies of `catalog_requirement_slots`, not
foreign-key pointers.

**Why:** if RIT revises a curriculum, saved user plans must not silently mutate.
A student's plan is a historical artifact of the requirements they enrolled under.

**Cost:** duplication, and template updates don't propagate automatically.
**Mitigation:** `source_slot_id` preserves provenance; `flowcharts.template_synced_at`
and `flowchart_blocks.is_user_modified` support a future "template changed — sync?"
prompt that won't clobber user edits.

This is the most consequential and least reversible choice in the schema.

---

## Decision 2 — Placeholder resolution preserves the placeholder

A resolved Gen Ed slot keeps `kind = 'placeholder'` and gains a `course_id`.

**Why:** "this was a Gen Ed Artistic slot, filled with ARTH-135" is strictly more
information than "this is ARTH-135". Requirement validation needs to know which
requirement a course is satisfying. Flattening loses that permanently.

Mirrors the reference PDF, where placeholder blocks have a category name plus a
blank line to write the chosen course.

---

## Decision 3 — Semantic position, not pixels

Blocks are positioned `(year_number, season, sort_order)`.

**Why:** credit-per-term totals and prerequisite ordering checks become simple
queries. With x/y coordinates both would require geometry inference. Drag-and-drop
still works — it reorders within a grid.

If free-canvas layout is ever wanted, add nullable `pos_x`/`pos_y` alongside;
do not replace the semantic fields.

---

## Decision 4 — Course business key is `(subject_code, catalog_number)`

Not TigerCenter's numeric `courseId`.

**Why:** CourseLeaf curricula reference `CSCI-141`; TigerCenter uses `202066`.
The course code is the only identifier both sources agree on, so it is the join
key. `tigercenter_course_id` is retained for reconciliation.

`code` is a generated stored column (`subject_code || '-' || catalog_number`).

---

## Decision 5 — Prerequisites: text is ground truth, structure is derived

`catalog_courses.prereq_text` stores the raw string permanently.
`catalog_course_prerequisites` holds a best-effort parsed tree.

**Why parse in v1 despite validation being a v2 feature:** parsing is dramatically
cheaper during ingestion than retrofitted afterward. Doing it later means a second
full pass over data whose upstream may have drifted.

**Why keep the text:** strings like "or equivalent course" and "4th year standing"
do not reduce to course references. The text is both fallback and audit trail.

`prereq_parse_status` (`parsed` / `partial` / `failed` / `unparsed` / `none`) tells
the planner which courses it may reason about. It must be set honestly — the
warn-only guarantee depends entirely on that flag being trustworthy.

---

## Decision 6 — Sections excluded; availability retained

Section/meeting data (instructor, weekly schedule, seats) is **permanently out of
scope**. This project plans whole curricula, not semesters.

**One exception:** "CSCI-331 is only offered in Fall" is a *course-level* fact that
matters for curriculum planning, and is derivable only from section data observed
across terms.

Because TigerCenter exposes one term at a time, this **cannot be backfilled** — only
accumulated going forward. Hence two tables:

- **`catalog_course_term_offerings`** — raw observation log, appended per ingestion run
- **`catalog_course_availability`** — the asserted claim the planner reads, with
  `source` and `confidence`

**Why separate:** on first ingestion there is exactly one observation (Fall 2026).
Deriving availability directly would conclude every course is Fall-only and fire a
false warning on every Spring block. The asserted layer lets weak evidence be
recorded without being acted on.

Seeding priority: `catalog_text` (0.9) → `plan_of_study` (0.2) → `observed`
(grows per term) → `manual` (1.0, always wins).

---

## Decision 7 — Warn-only validation

Applies to prerequisites and availability alike: **never warn from an inference you
cannot stand behind.** Below the confidence bar, the planner stays silent.

**Why this rescues partial parsing:** if warnings had to be authoritative, 85%
parse coverage would be worthless. Warn-only makes partial coverage genuinely
useful — flag what is provable, ignore the rest. One wrong flag costs more trust
than ten missing ones.

---

## Decision 8 — Multi-program support in shape, not in rules

`flowchart_programs` attaches several programs to one flowchart with a
`program_role` (`primary` / `secondary` / `minor` / `immersion` / `option`) and a
partial unique index enforcing at most one primary.

v1 inserts exactly one row. The shape costs nothing now and avoids a painful
migration when double majors and BS/MS plans arrive.

**Deliberately not modelled:** double-counting rules, which program a block counts
toward (needs `flowchart_block_fulfillments`), and BS/MS shared-credit caps. These
depend on rules RIT publishes per program and are validation-engine concerns.

---

## Flag — Task 0.3's workaround affects `catalog_course_attributes.term_code` — RESOLVED (Task 3, 2026-08-31)

`catalog_course_attributes` was designed assuming Gen Ed tagging comes from
TigerCenter's `class-search` — hence `term_code not null references
catalog_terms(code)` (see the table comment in `db/schema.sql`). Task 0.3
(`docs/architecture/data-sources.md`) found `class-search` blocked (Task 0.6)
and adopted the Programs API's `detail-ge_attrs` field instead, which is part
of the **stable, catalog-year-scoped** course description, not a term-scoped
observation — it has no natural `term_code` to stamp.

**Update 2026-08-26: Task 0.6 is resolved** (it was a missing `Accept`
header, not an outage — see the handoff brief) **and `class-search`'s own
attribute fields are now confirmed working**, agreeing with the Programs
API on `ARTH-135`. This doesn't resolve the flag below — it changes its
shape: the choice is no longer "use the workaround because the intended
source is broken," it's a genuine design choice between a term-scoped
source (`class-search`, has a natural `term_code`) and a catalog-year-scoped
one (Programs API, doesn't). The nullable-`term_code`-or-split-tables
question below still needs an answer either way.

**Resolved with the project owner, 2026-08-31, during Task 3.** Before
deciding, confirmed via a repo-wide search that `catalog_attributes` /
`catalog_course_attributes` had **zero writers anywhere** as of the Task 2
merge — Task 2 never actually populated them (it only reduced Gen Ed text
to a coarse `category_hint` string on `catalog_requirement_slots`). So this
decision shaped an unused table for its first real writer, not a live
migration of real data.

**Decision: one table, nullable `term_code`, not a split into two tables.**
`catalog_course_attributes` gained an `id` surrogate key, a `source`
column, and dropped the `NOT NULL` on `term_code`. A `scope_check`
constraint enforces that `source = 'tigercenter'` rows always carry a real
`term_code` and `source = 'programs_api'` rows never do; two partial-unique
indexes (`..._term_scoped_uniq`, `..._year_scoped_uniq`) replace the old
three-column primary key. See `supabase/migrations/
0002_catalog_course_attributes_nullable_term.sql`, applied to
`rit-flowchart-dev` only (prod migration is a follow-up, not silently
done).

Task 3 itself only ever writes `source = 'tigercenter'` rows. No writer for
`source = 'programs_api'` exists yet — building the Programs API's
`detail-ge_attrs` → `catalog_attributes` mapping remains unstarted work for
whoever picks it up next; this migration just stops blocking it.

---

## Flag — the "TigerCenter is one-term-only" premise behind `catalog_course_term_offerings` is overturned, design choice needed

`catalog_course_term_offerings` accumulates observations per term rather than
backfilling, on the premise that TigerCenter structurally cannot supply
historical or future-term data — inferred from `currentTerms` listing only
one active term (see `docs/architecture/data-sources.md`, Terms section).

**Update 2026-08-26: this premise is overturned, not just uncertain.** Task
0.6's `found: 0` mystery was a missing `Accept: application/json` header
(see the handoff brief), not a real limitation. With that fixed,
`class-search` returns real, complete section data for historical terms:
`2251` (Fall 2025, ~1 year back) and `2231` (Fall 2023, ~3 years back) both
returned full section records — instructors, meetings, seat counts — no
different in shape from the current term. Retention depth beyond 3 years is
untested, but "at least 3 years of historical section data is available"
is a confirmed fact now, not a hypothesis.

**Not resolved here — flagging per CLAUDE.md rather than picking silently.**
This changes what's possible, not what's required: the accumulate-forward
design still works and stays a safe default. But it may no longer be the
best choice — options worth weighing when Task 3 is actually built:
- Backfill `catalog_course_term_offerings` for the last N terms on first
  ingestion, removing the cold-start problem Task 5's confidence model
  (`observed`, ~0.2, "grows per term") was designed around.
- Keep accumulate-forward-only anyway, if backfilling adds complexity that
  isn't worth it for a feature (`observed` availability) that already has a
  higher-confidence primary source (`catalog_text`, ~0.9, from the Programs
  API's `detail-typically_offered`).

Whichever is chosen — or if neither, and the current design is kept as-is
on purpose — belongs in a numbered migration or an explicit decision-log
entry, not a silent no-op.

---

## Flag — immersions are ingested as entities only; internal structure deferred

Task 2 (Programs API adapter) ingests all 77 immersions as lightweight
`catalog_programs` rows (`type = 'immersion'`, name/slug/catalog_year/
total_credits) so a degree program's generic "Immersion 1/2/3" placeholder
slots can reference them by name. It does **not** parse each immersion's
internal required/elective course list.

**Why:** an immersion's curriculum response is a select-N-of-M course list
(`<table class="sc_courselist">` — Prerequisites / Required Courses /
Electives, confirmed via a live fetch of `physics-immersion` during
implementation), not a year/term Plan of Study Grid
(`<table class="sc_plangrid">`). `catalog_requirement_slots.year_number` is
`NOT NULL`, so this structure doesn't fit that table without a schema
change — and nothing in Task 2's acceptance bar (CS BS reconstruction)
requires resolving a specific immersion's internal course list.

**Not resolved here — flagging per CLAUDE.md rather than picking silently.**
Whoever builds "resolve Immersion 1 into a specific immersion's courses"
will need one of:
- a nullable `year_number` on `catalog_requirement_slots` (`null` = "no year
  semantics", mirroring how `season = null` already means "anytime that
  year"), or
- a separate table for select-N-of-M course lists, parallel to
  `catalog_requirement_slots` but without year/term columns.

---

## Flag — no confirmed example of inline degree-option clusters
(`catalog_requirement_groups`) in the Programs API

`catalog_requirement_groups` (Decision 8 / the schema's "select N of the
following" mechanism) has no code populating it yet — not because it's
unimplemented, but because Task 2 could not find a real example of the
shape it's meant to represent. Checked during implementation: CS BS,
`software-engineering-bs`, `mechanical-engineering-bs`,
`electrical-engineering-bs`, `information-technology-bs` — all plain
single-track `sc_plangrid` curricula, no inline "select N of the following"
markup. RIT's `/study/{slug}-option` marketing-page slugs (e.g.
`3d-digital-design-bfa-3d-visualization-option`) turned out **not** to be
independent Programs API curriculum documents — that endpoint 404s for
them — so "options are separate sibling program pages" isn't confirmed
either; how RIT actually represents degree options through this API is
still an open question.

**Not resolved here.** `write-catalog.ts`'s group-writing code path exists
and is exercised by nothing yet — a real example needs to surface (in a
program beyond the small set checked above, or in a graduate program, or
via a still-undiscovered response shape) before this can be tested against
anything other than invented structure.

---

## Deferred by design

Commented in `db/schema.sql` rather than built: sharing/advisor view, cached
validation results, multi-program fulfillment mechanics.
