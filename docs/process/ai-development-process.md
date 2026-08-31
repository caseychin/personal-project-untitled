# AI-Assisted Development Process

How this project is planned and built using AI tools. Tracks the *process*, not
just the product — kept as a record to refer back to and to speak about later.

---

## Role structure

| Role | Who | Responsibility |
|---|---|---|
| Product Owner / Solutions Architect | Casey | Vision, prioritization, requirements, architecture decisions, review/approval |
| Planning & Spec Partner | Claude (chat) | Turning loose ideas into specs, structuring phases, architecture discussion, documentation |
| UI/UX Design | Claude Design | Screens, interaction patterns, visual system |
| Implementation | Claude Code | Ingestion, backend, frontend — writing and running code |

Throughout: the owner makes decisions and reviews outputs, and does not write code.

---

## Tooling

- **GitHub** — `personal-project-untitled`; all implementation
- **Google Drive** — documentation mirror (repo copy is authoritative)
- **Supabase** — Postgres + Auth
- **Figma** — available for design handoff
- **Linear** — issue tracking, team `Personal-project-untitled`

---

## The repeating loop

1. **Define** — owner + Claude (chat): shape a rough idea into a real requirement
2. **Design** — Claude Design: requirement → UI/interaction design
3. **Architect** — owner + Claude (chat): data model and technical approach, decided *before* code
4. **Build** — Claude Code: implementation in small reviewable chunks

Architecture decisions are the highest-leverage point for owner involvement,
because they are the most expensive to reverse.

---

## Build phases

| Phase | Owner | Status |
|---|---|---|
| 0 — Data & schema planning | Human + Claude (chat) | **Complete** |
| 1 — Data ingestion | Claude Code | **In progress** — Programs API + TigerCenter adapters done (Tasks 0–3); prereq parsing + availability seeding remain (Tasks 4–5) |
| 2 — UI/UX design | Claude Design | Ready to start (parallel with 1) |
| 3 — Backend / API | Claude Code | Blocked on 1 |
| 4 — Frontend | Claude Code | Blocked on 2 + 3 |

Phases 1 and 2 run in parallel: design depends on the *schema*, not on ingested data.

---

## Review process (staying hands-off from code)

Code is not reviewed line by line, so safety lives in the process:

- Written acceptance criteria per feature before Claude Code starts
- `CLAUDE.md` holds conventions and guardrails, kept current
- Tests on core logic as the review proxy — review test *intent*, not implementation
- Small PRs per feature slice; a 2,000-line PR cannot be meaningfully reviewed
- Separate dev/prod Supabase instances from day one

---

## Phase 0 retrospective — what actually happened

Phase 0 ran longer than planned and was worth it. Notes on why:

**Investigating data sources before designing the schema changed the design.**
Several schema decisions (the two-layer availability model, structured prereqs in
v1, section exclusion) were direct consequences of API findings. Designing first
and discovering second would have meant rework.

**The most valuable finding was unasked-for.** `advancedSearchData` returned the
complete Gen Ed attribute vocabulary, which converted placeholder resolution —
the MVP's hardest feature to source — from "unknown data source, possibly manual"
into a text-matching problem against a known vocabulary. It was found while
answering an unrelated question. (The per-course side of the mapping initially
came from the Programs API's `detail-ge_attrs` field rather than TigerCenter's
`class-search`, because `class-search` appeared to return no data at the time —
see Task 0.3/0.6 in the handoff brief. **Correction, 2026-08-26:** `class-search`
was never actually blocked; every probe against it was missing a required
`Accept: application/json` header, and it works fine once that's added. The
Programs API mechanism is still a reasonable choice, just no longer the only
one — see the updated Task 0.3 note in the handoff brief.)

**Tooling limits were real and worth naming rather than working around.** Several
questions (course-level endpoint, cookie-less POST) could not be answered from the
chat environment. They were documented as explicit verification tasks rather than
guessed at, and became Task 0 of the handoff.

**A constraint reshaped a feature — then turned out to be wrong, which is its own
lesson.** TigerCenter exposing exactly one *active* term at a time was read as
meaning it structurally cannot supply historical data, which turned "term
availability" from a simple derived field into an accumulate-forward problem
with a cold-start failure mode — caught in design rather than after shipping
false warnings, which was the right instinct. **But the premise itself was
wrong:** a 2026-08-26 re-test (after fixing the `class-search` header issue
above) found real section data going back at least 3 years. The
accumulate-forward design remains a safe default, but "TigerCenter can only
ever show one term" should not have been treated as confirmed from a single
endpoint's listing behavior — see the flag in `schema-decisions.md`. The
process lesson holds either way: design defensively around an API constraint
before it's needed, but keep re-verifying constraints that were inferred
rather than directly tested.

---

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-08-11 | Supabase for backend/auth/DB | Auth + Postgres out of the box, minimal infra, scales toward multi-user |
| 2026-08-11 | Data phase before UI; design parallel to ingestion | Both depend on schema; design does not depend on ingested data |
| 2026-08-11 | Linear tickets deferred until Phase 0 complete | Avoids restructuring tickets once scope is real |
| 2026-08-11 | Blocks are copies of template slots, not references | User plans must not mutate when RIT revises curricula |
| 2026-08-11 | Placeholder resolution preserves the placeholder | Retains which requirement a course satisfies |
| 2026-08-11 | Semantic block position (year/season/order), not pixels | Makes credit totals and prereq ordering queryable |
| 2026-08-11 | Structured prereq parsing moved into v1 | Far cheaper during ingestion than retrofitted; validation UI stays v2 |
| 2026-08-11 | Section/meeting data permanently out of scope | Project plans curricula, not semesters |
| 2026-08-11 | Term availability split: observation log + asserted claim | One-term API exposure means a single observation would imply "everything is Fall-only" |
| 2026-08-11 | Warn-only validation across prereqs and availability | Makes partial parse coverage useful; one false warning costs more trust than ten missing ones |
| 2026-08-11 | Multi-program supported in shape, not in rules | Join table costs nothing now, avoids painful migration later |
| 2026-08-22 | Gen Ed attribute source: Programs API `detail-ge_attrs`, not TigerCenter `class-search` | `class-search` returns `found: 0` for every query against the current term regardless of shape (Task 0.6); Programs API field confirmed populated for UGRD courses cookie-less and needs no working TigerCenter session |
| 2026-08-26 | Superseding note, not a reversal: the 2026-08-22 rationale above no longer holds as stated | Task 0.6 resolved — the `found: 0` behavior was a missing `Accept: application/json` header, not a broken/empty `class-search`; it now returns real, cross-validated attribute data too. The Programs API choice can stand on its own merits (catalog-year-scoped, no TigerCenter dependency) but should not be justified by "`class-search` doesn't work" anymore. Left as an open design choice, not re-decided here — see `schema-decisions.md` |
| 2026-08-31 | `catalog_course_attributes.term_code` made nullable, with a `source` column and two partial-unique indexes, instead of splitting into two tables | Task 3 needed a real writer for this table (TigerCenter, term-scoped) while leaving room for a future catalog-year-scoped writer (Programs API's `detail-ge_attrs`, still unbuilt). Table confirmed to have zero writers before deciding, so this shaped an unused table rather than migrating live data — see `schema-decisions.md` |
