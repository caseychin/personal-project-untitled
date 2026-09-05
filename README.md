# RIT Course Flowchart Planner

## Getting started

```bash
npm install
cp .env.example .env   # fill in NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY
                        # for rit-flowchart-dev — via the Supabase dashboard
                        # or `get_project_url` / `get_publishable_keys` (MCP)
npm run dev             # http://localhost:3000
```

To run the RLS cross-user isolation test (`tests/rls-cross-user.test.ts`),
"Confirm email" must be off in `rit-flowchart-dev`'s Auth settings (Dashboard
→ Authentication → Sign In / Providers → Email) — already set as of Task 1.
Then:

```bash
npm run test:rls
```

Schema changes are numbered migrations in `supabase/migrations/`, applied via
the Supabase MCP `apply_migration` tool — `db/schema.sql` stays the
consolidated, human-readable definition and is never hand-edited to reflect a
DB change. The initial schema (`0001`) was applied to both `rit-flowchart-dev`
and `rit-flowchart-prod` immediately; later migrations may land on dev first
and prod once verified, so the two can briefly diverge — check
`supabase/migrations/` against each project's applied migration list (Supabase
MCP `list_migrations`) rather than assuming they match.

## Documentation

| Document | Purpose |
|---|---|
| [`product/prd.md`](product/prd.md) | Product requirements, MVP scope, phases |
| [`architecture/data-sources.md`](architecture/data-sources.md) | RIT API reference, findings, open questions |
| [`architecture/schema-decisions.md`](architecture/schema-decisions.md) | Rationale behind `db/schema.sql` |
| [`handoff/claude-code-brief.md`](handoff/claude-code-brief.md) | Phase 1 implementation brief (complete) |
| [`handoff/phase-3-backend-brief.md`](handoff/phase-3-backend-brief.md) | Phase 3 implementation brief |
| [`process/ai-development-process.md`](process/ai-development-process.md) | How this project is built using AI tools |
| [`../CLAUDE.md`](../CLAUDE.md) | Conventions and guardrails for Claude Code |
| [`../db/schema.sql`](../db/schema.sql) | Database schema — source of truth |

These docs are mirrored to Google Drive. **The repo copy is authoritative.**
