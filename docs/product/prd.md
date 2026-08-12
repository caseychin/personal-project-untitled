# PRD — RIT Course Flowchart Planner

## Overview

A web app for RIT students to plan their degree path as an interactive,
drag-and-drop flowchart — modelled on RIT's official department flowcharts, but
personalized, editable, and persistent.

**Scope discipline:** this plans *whole curricula* — "will I satisfy every
requirement before I graduate?" It is **not** a semester scheduler. Specific
sections, professors, meeting times and seat counts are out of scope.

## Users

Multiple users, email + password auth (Supabase). No advisor or admin roles in v1.

## Core entities

- **Course** — code, title, credits, description, prereq text, Gen Ed attributes
- **Program** — a major/minor/immersion's requirement structure, versioned by catalog year
- **Requirement Slot** — one cell in a program's Plan of Study Grid
- **Flowchart** — belongs to a user, has a name; several per user
- **Block** — a placed item in a flowchart: a course, a category placeholder, a co-op, or a custom entry
- **User**

## MVP feature set

1. Browse/search RIT course catalog data
2. Start a flowchart from a major/minor/immersion template, or blank
3. Drag-and-drop blocks across the flowchart canvas (year × term grid)
4. Co-op blocks rendered as full-width bars within a term row
5. Click a block for full course detail (description, credits, prereqs)
6. Free-text notes per block
7. Completion state per block — planned / in progress / completed / transferred / waived
8. Resolve placeholder blocks into specific real courses (e.g. pick a course for "Gen Ed Artistic Perspective")
9. Multiple named flowcharts per user — drafts, what-ifs, active plan
10. Custom blocks for non-catalog items (study abroad, research, extracurriculars)

## Deferred to v2+

- Requirement validation **UI** — prerequisite and availability *data capture* is
  v1; surfacing warnings is v2
- Sharing flowcharts / advisor view
- Multi-program double-counting rules (double majors, BS/MS shared credit)
- Multi-institution support

## Permanently out of scope

- Section selection, weekly schedules, professor choice, seat availability

## Visual reference

`CSUndergradFlowChart.pdf` — official RIT CS BS flowchart. Patterns to carry into design:

- Grid: years as rows, terms as columns
- Colour-coded categories: CS/SWE (orange), Math (navy), Gen Ed (olive),
  Science (maroon), Open Elective (purple), Wellness (yellow), Co-op (light blue),
  First Year Requirement (red)
- Course blocks show code + title + prereqs in parentheses
- Placeholder blocks show a category name plus a blank line for the chosen course
- Co-op terms render as full-width bars

## Tech stack

- **Backend / DB / Auth:** Supabase (Postgres + Auth)
- **Repo:** `personal-project-untitled`
- **Design:** Claude Design
- **Implementation:** Claude Code

## Build phases

| Phase | Owner | Description |
|---|---|---|
| 0 | Human + Claude (chat) | Data & schema planning — **complete** |
| 1 | Claude Code | Data ingestion: scraping + API integration |
| 2 | Claude Design | UI/UX design — parallel with Phase 1 |
| 3 | Claude Code | Backend / API implementation |
| 4 | Claude Code | Frontend implementation — consumes Phase 2 + 3 |
