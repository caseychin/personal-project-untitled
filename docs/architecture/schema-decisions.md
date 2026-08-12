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

## Deferred by design

Commented in `db/schema.sql` rather than built: sharing/advisor view, cached
validation results, multi-program fulfillment mechanics.
