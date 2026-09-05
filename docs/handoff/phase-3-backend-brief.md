# Claude Code Handoff Brief — Phase 3 (Backend / API)

**Status:** Phase 1 (data ingestion) is complete — Tasks 0-5 all merged, see
`docs/handoff/claude-code-brief.md`. Phase 2 (UI/UX design, Claude Design)
has not started, but per `docs/process/ai-development-process.md`'s phase
table, Phase 3 is blocked only on Phase 1, not Phase 2 — the app-layer
schema (Decisions 1/2/3/8 below) gives enough shape to build against without
a visual design in hand. This brief defines the first two Phase 3 tasks,
numbered continuing from Phase 1 (Task 6, Task 7 — not restarting at 1).

**Read first:** `/CLAUDE.md` (especially "Hard rules" and "Scope"),
`docs/product/prd.md` (the 10 MVP features these tasks implement),
`docs/architecture/schema-decisions.md` Decisions 1 (blocks are copies), 2
(placeholder resolution keeps the placeholder), 3 (semantic position), and 8
(multi-program shape), and `db/schema.sql`'s `APP LAYER` section
(`profiles`, `flowcharts`, `flowchart_programs`, `flowchart_blocks`) — all
already exist and are RLS-enabled from Task 1's migration. **No schema
changes are expected for Task 6 or 7.**

Task 1's scaffold already has: email+password auth (`@supabase/ssr`),
`createFlowchart` (bare insert, no template) and `signOut` in
`src/app/flowcharts/actions.ts`, and a page that lists a user's own
flowcharts. Nothing beyond that exists yet — no catalog browsing, no block
CRUD, no template instantiation.

---

## Roadmap (all anticipated Phase 3 tasks, for context)

Mapped to the PRD's MVP feature list. Only Task 6 and 7 are detailed below;
the rest are named here so the shape of the whole phase is visible before
starting on the first slice.

- **Task 6 — Catalog read API** (features 1, 5: browse/search catalog, course detail)
- **Task 7 — Flowchart instantiation from a template** (feature 2)
- **Task 8 — Block CRUD**: reorder, notes, completion state, custom blocks (features 3, 6, 7, 10)
- **Task 9 — Placeholder resolution** (feature 8)
- **Task 10 — Multiple flowchart management**: list/rename/duplicate/archive (feature 9)

Task 8 depends on 6 or 7 having produced blocks to act on (or on blank/custom
blocks alone). Task 9 depends on 6 (search) and 8 (block update). Suggested
order is numeric, but 8 and the "blank flowchart + custom blocks" slice of
10 don't strictly require 7 to exist first if it's more convenient to build
CRUD against hand-inserted test blocks initially.

---

## Task 6 — Catalog read API

Server-side read/search access to catalog data for a signed-in user:
browse/search `catalog_courses` and `catalog_programs`, and view a single
course's full detail (title, credits, description, prereq tree, availability).

**Note on RLS:** catalog tables are already world-readable —
`db/schema.sql` has `create policy "catalog readable" on ... for select
using (true)` for every `catalog_*` table. This task is the query/route
layer on top of already-open data, not an access change. Per CLAUDE.md,
app code may **read** `catalog_*` tables but must never write them — writes
stay service-role-ingestion-only.

Known data shape worth knowing before starting:
- `catalog_courses.code` (generated, e.g. `"CSCI-141"`) is the natural
  search/display key; `prereq_parse_status` tells you whether
  `catalog_course_prerequisites` is safe to show as structured data (only
  `'parsed'`) versus falling back to `prereq_text` alone.
- `catalog_course_availability` (Task 5) now has real rows for most
  courses — `confidence` and `source` are there if a course detail view
  wants to show "Typically offered: Fall, Spring" with some notion of how
  sure that is. Surfacing a low-confidence claim as if it were certain
  would violate the warn-only principle — check `docs/architecture/
  schema-decisions.md` Decision 7 before deciding how to render this.
- `catalog_programs` has `type` (major/minor/immersion/option/concentration/
  combined) — useful for letting a user filter "pick a major" vs "pick a
  minor" when starting a flowchart in Task 7.

**Acceptance:** a signed-in user can search for a course by code or title
fragment and see its credits/description/prereqs/availability; can list
programs filterable by `type`.

---

## Task 7 — Flowchart instantiation from a template

Given an existing flowchart (or one created for this purpose) and a chosen
`catalog_programs` row, materialize that program's `catalog_requirement_slots`
into `flowchart_blocks` — as **copies**, never live references (Decision 1).
Write one `flowchart_programs` row linking the flowchart to the program
(`role = 'primary'` for v1 — Decision 8 says the multi-program shape exists
for future double-majors/BS-MS, but v1 only ever inserts one row).

Per-slot copy, one `flowchart_blocks` row each:
- `year_number`, `season`, `sort_order`, `kind`, `course_id`, `label`,
  `required_attribute_id`, `credits` (→ `credits_override`), `category_hint`
  copy straight across.
- `source_slot_id` = the originating slot's id (provenance, for a future
  "template changed, re-sync?" feature — not building that feature now,
  just recording the pointer it'll need).
- `is_user_modified = false` (nothing's been touched yet).
- `status = 'planned'` (the column default).

Also set `flowcharts.template_synced_at` to now — that column exists
specifically for this moment (see its comment in `db/schema.sql`); nothing
reads it yet, but Task 7 is what should start populating it.

**Placeholders (Gen Ed, Immersion N, CS Elective, etc.) materialize as
ordinary blocks** — `kind='placeholder'`, `label` copied from the slot,
`course_id` left null. This is unaffected by the still-open
"immersions ingested as entities only" flag in `schema-decisions.md`: that
gap only matters when a *later* task tries to resolve an Immersion
placeholder to a specific course from that immersion's actual course list
(Task 9's problem). Instantiation itself doesn't need to know what's inside
an immersion — it just needs to place the generic "Immersion 1" block where
the template says it goes.

**Not this task:** "start blank" (a flowchart with zero programs/blocks)
already works via Task 1's existing `createFlowchart` — this task adds the
templated path alongside it, not a replacement.

**Acceptance:** instantiating a new flowchart from CS BS (`computer-science-bs`,
already ingested by Task 2) produces one block per `catalog_requirement_slots`
row for that program, with correct year/season/kind/course_id/label, every
block's `source_slot_id` set, and total credits summing to 126 — the number
Task 2's own acceptance test already established for this program, so this
is a cheap, concrete cross-check rather than a guess.

---

## Scope reminders for both tasks

- No section/meeting-time features (permanently out of scope, per CLAUDE.md
  and the PRD).
- No requirement-validation **UI** — Task 6 can *display* prereq/availability
  data that already exists, but building warning logic on top of it is v2.
- Any new user-data table would need RLS enabled in the same commit that
  creates it — not expected to be necessary for Task 6 or 7, since
  `flowcharts`/`flowchart_programs`/`flowchart_blocks` already exist with
  RLS from Task 1.
- Per the Phase 1 retrospective (`docs/process/ai-development-process.md`),
  a second-pass review before merge caught a real bug Task 5's own tests
  and clean `tsc`/`eslint` didn't — worth doing again here, especially for
  Task 7's materialization logic, which is real state-transition code, not
  a pure data pipeline.

---

## Reporting back

Same as Phase 1: PR with what you verified, what you assumed, what
surprised you. If anything here turns out to not match the live schema or
Task 1's actual code, flag it rather than working around it silently.
