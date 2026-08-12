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
| 1 — Data ingestion | Claude Code | Ready to start |
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
into one filtered API call. It was found while answering an unrelated question.

**Tooling limits were real and worth naming rather than working around.** Several
questions (course-level endpoint, cookie-less POST) could not be answered from the
chat environment. They were documented as explicit verification tasks rather than
guessed at, and became Task 0 of the handoff.

**A confirmed constraint reshaped a feature.** TigerCenter exposing exactly one
term at a time turned "term availability" from a simple derived field into an
accumulate-forward problem with a cold-start failure mode — caught in design
rather than after shipping false warnings.

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
