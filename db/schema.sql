-- =====================================================================
-- RIT Course Flowchart Planner — Proposed Schema v1
-- Target: Supabase (Postgres 15+)
--
-- Layering:
--   ingest_*   raw API payloads, service-role only, replayable
--   catalog    institution reference data (read-only to users)
--   app        user-owned data (RLS enforced)
--
-- All tables live in `public` for Supabase/PostgREST simplicity;
-- prefixes carry the layering. Split into real schemas later if desired.
-- =====================================================================

create extension if not exists "pgcrypto";

-- =====================================================================
-- ENUMS
-- =====================================================================

create type term_season   as enum ('fall', 'spring', 'summer', 'intersession');

-- 'combined' covers BS/MS accelerated programs, which RIT runs as a single
-- named program (e.g. 'Computer Science BS/MS') rather than two enrollments.
create type program_type  as enum ('major', 'minor', 'immersion', 'option', 'concentration', 'combined');

-- How a program attaches to a flowchart. Supports double majors (one primary,
-- one secondary), minors, and immersions on the same plan.
create type program_role  as enum ('primary', 'secondary', 'minor', 'immersion', 'option');

-- 'custom' = a user-authored block that isn't a catalog course: study abroad,
-- an extracurricular, research, a co-op the catalog doesn't model, a reminder.
create type block_kind    as enum ('course', 'placeholder', 'coop', 'custom');

-- 'transferred' = credit granted from elsewhere (AP, another institution).
-- 'waived'      = requirement removed without credit (substitution, exemption).
-- These are deliberately distinct: transferred contributes credit hours, waived does not.
create type block_status  as enum ('planned', 'in_progress', 'completed', 'transferred', 'waived');

create type prereq_node_type as enum ('group', 'course', 'unparsed');
create type prereq_parse_status as enum ('unparsed', 'parsed', 'partial', 'failed', 'none');

-- Where a claim about "this course is offered in season X" came from.
-- Ordered roughly by trustworthiness; see catalog_course_availability.
create type availability_source as enum (
  'catalog_text',    -- explicit "typically offered" note in the course catalog
  'observed',        -- we saw sections in that season, accumulated over terms
  'plan_of_study',   -- inferred from where a program template places it (weak)
  'manual'           -- human-asserted override; always wins
);

create type academic_career as enum ('UGRD', 'GRAD');
create type ingest_source as enum ('programs_api', 'tigercenter');
create type ingest_status as enum ('running', 'succeeded', 'failed');


-- =====================================================================
-- INGEST LAYER — raw payloads, never read by the app directly
-- =====================================================================

create table ingest_runs (
  id           uuid primary key default gen_random_uuid(),
  source       ingest_source not null,
  status       ingest_status not null default 'running',
  started_at   timestamptz   not null default now(),
  finished_at  timestamptz,
  stats        jsonb         not null default '{}'::jsonb,
  error        text
);

-- Store every response before parsing. Lets you re-normalize without re-fetching,
-- and diff payloads over time to detect upstream schema drift.
create table ingest_documents (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references ingest_runs(id) on delete cascade,
  source         ingest_source not null,
  endpoint       text not null,
  request_params jsonb not null default '{}'::jsonb,
  payload        jsonb not null,
  content_hash   text  not null,          -- sha256 of payload; skip unchanged docs
  fetched_at     timestamptz not null default now()
);

create index on ingest_documents (run_id);
create index on ingest_documents (source, endpoint);
create unique index on ingest_documents (source, endpoint, content_hash);


-- =====================================================================
-- CATALOG LAYER — institution reference data
-- =====================================================================

create table catalog_terms (
  code         text primary key,          -- PeopleSoft `strm`, e.g. '2261'
  description  text not null,             -- '2026-27 Fall (2261)'
  season       term_season,
  academic_year text,                     -- '2026-27'
  starts_on    date,
  ends_on      date,
  is_active    boolean not null default false,
  ingested_at  timestamptz not null default now()
);

create table catalog_colleges (
  code        text primary key,           -- 'GCCIS'
  name        text not null
);

create table catalog_subjects (
  code         text primary key,          -- 'CSCI'
  name         text not null,
  college_code text references catalog_colleges(code)
);

-- Canonical course record. Business key is (subject, catalog_number) because
-- that is what CourseLeaf curricula reference; TigerCenter's numeric courseId
-- is kept for reconciliation but is NOT the primary key.
create table catalog_courses (
  id                uuid primary key default gen_random_uuid(),
  subject_code      text not null references catalog_subjects(code),
  catalog_number    text not null,        -- '141', '499', '10'
  code              text generated always as (subject_code || '-' || catalog_number) stored,
  title             text not null,
  description       text,
  credits_min       numeric(4,1),
  credits_max       numeric(4,1),
  career            academic_career,
  college_code      text references catalog_colleges(code),

  -- Prereqs. prereq_text is ground truth and always retained; the structured
  -- parse lives in catalog_course_prerequisites. parse_status tells the planner
  -- which courses it is allowed to reason about.
  prereq_text       text,
  prereq_parse_status prereq_parse_status not null default 'unparsed',
  prereq_parsed_at  timestamptz,

  -- Provenance / staleness
  tigercenter_course_id text,             -- e.g. '202066'
  last_seen_term    text references catalog_terms(code),
  source            ingest_source,
  updated_at        timestamptz not null default now(),

  unique (subject_code, catalog_number)
);

create index on catalog_courses (code);
create index on catalog_courses (career);
create index on catalog_courses using gin (to_tsvector('english', title || ' ' || coalesce(description, '')));

-- Gen Ed / Writing Intensive / Honors etc. Sourced from advancedSearchData.
create table catalog_attributes (
  id          uuid primary key default gen_random_uuid(),
  group_code  text not null,              -- 'PERS', 'WRTG', 'GE'
  group_name  text not null,              -- 'Gen Ed Perspectives Category'
  value_code  text not null,              -- 'ARTISTIC', 'WI-PR'
  value_name  text not null,              -- 'GE: Artistic Perspective'
  unique (group_code, value_code)
);

-- Two scopes of Gen Ed tagging feed this table: TigerCenter's class-search
-- (term-scoped — record which term asserted it, so you can detect a course
-- losing/gaining a tag) and the Programs API's detail-ge_attrs (catalog-year-
-- scoped — no natural term). term_code is nullable and source disambiguates;
-- the scope_check constraint and the two partial-unique indexes below keep
-- each scope internally consistent. See schema-decisions.md's term_code flag
-- (added migration 0002, after v1 shipped with term_code NOT NULL).
create table catalog_course_attributes (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references catalog_courses(id) on delete cascade,
  attribute_id uuid not null references catalog_attributes(id) on delete cascade,
  term_code    text references catalog_terms(code),
  source       ingest_source not null,

  constraint catalog_course_attributes_scope_check check (
    (source = 'tigercenter' and term_code is not null) or
    (source = 'programs_api' and term_code is null)
  )
);

create index on catalog_course_attributes (attribute_id, term_code);
create unique index catalog_course_attributes_term_scoped_uniq
  on catalog_course_attributes (course_id, attribute_id, term_code)
  where source = 'tigercenter';
create unique index catalog_course_attributes_year_scoped_uniq
  on catalog_course_attributes (course_id, attribute_id)
  where source = 'programs_api';

-- ---------------------------------------------------------------------
-- PREREQUISITES — derived structure alongside the raw text
--
-- catalog_courses.prereq_text remains ground truth and is never discarded.
-- This table is a BEST-EFFORT parse of it, built during ingestion. It is
-- expected to be incomplete: "or equivalent course", "4th year standing" and
-- program restrictions do not reduce to course references.
--
-- That is acceptable because prereq checking is WARN-ONLY. The planner flags
-- orderings it can prove wrong and stays silent everywhere else. Partial
-- coverage is useful; it does not need to be sound.
--
-- Shape: a tree. Group nodes carry AND/OR, leaf nodes carry a course.
--   "CSCI-243 and (CSCI-261 or CSCI-262)"
--     group(AND)
--       course(CSCI-243)
--       group(OR)
--         course(CSCI-261)
--         course(CSCI-262)
-- ---------------------------------------------------------------------

create table catalog_course_prerequisites (
  id                 uuid primary key default gen_random_uuid(),
  course_id          uuid not null references catalog_courses(id) on delete cascade,
  parent_id          uuid references catalog_course_prerequisites(id) on delete cascade,
  node_type          prereq_node_type not null,
  logic              text check (logic in ('AND', 'OR')),   -- group nodes only
  required_course_id uuid references catalog_courses(id),   -- course nodes only
  min_grade          text,                                  -- 'C-' from "with C- or higher"
  is_corequisite     boolean not null default false,
  raw_fragment       text,                                  -- the substring this came from
  sort_order         integer not null default 0,

  constraint prereq_shape check (
    (node_type = 'group'    and logic is not null) or
    (node_type = 'course'   and required_course_id is not null) or
    (node_type = 'unparsed' and raw_fragment is not null)
  )
);

create index on catalog_course_prerequisites (course_id);
create index on catalog_course_prerequisites (parent_id);
create index on catalog_course_prerequisites (required_course_id);

-- ---------------------------------------------------------------------
-- TERM AVAILABILITY — accumulated, never backfillable
--
-- TigerCenter exposes one active term at a time, so "typically offered in
-- Fall" can only be learned by recording what existed each term as you go.
-- Cheap to populate during ingestion; impossible to reconstruct later.
-- Useful for curriculum planning ("this can't go in Spring"), which is why it
-- survives the decision to exclude section data generally.
-- ---------------------------------------------------------------------

create table catalog_course_term_offerings (
  course_id     uuid not null references catalog_courses(id) on delete cascade,
  term_code     text not null references catalog_terms(code),
  season        term_season,
  section_count integer not null default 0,
  observed_at   timestamptz not null default now(),
  primary key (course_id, term_code)
);

create index on catalog_course_term_offerings (course_id, season);

-- ---------------------------------------------------------------------
-- COURSE AVAILABILITY — the asserted answer the planner actually reads
--
-- Distinct from catalog_course_term_offerings above, which is a raw
-- observation log. This table says "CSCI-331 is offered in Fall" as a claim,
-- with provenance and confidence attached.
--
-- WHY SEPARATE: TigerCenter exposes one term at a time. On first ingestion you
-- have a single observation (Fall 2026). Deriving availability directly from
-- observations at that point concludes every course is Fall-only, which would
-- fire a false warning on every Spring block in every flowchart. The asserted
-- layer lets weak evidence be recorded WITHOUT being acted on.
--
-- SEEDING, in priority order:
--   1. catalog_text   — RIT course catalog entries carry an explicit
--                       "Typically Offered: Fall, Spring" note. Best source;
--                       confirmed via the course-level Programs API endpoint
--                       (proxy-bubble.php, see data-sources.md).
--   2. plan_of_study  — a program template placing CSCI-331 in Year 3 Fall is
--                       weak evidence it is offered in Fall. Free: already
--                       ingested in catalog_requirement_slots. Low confidence.
--   3. observed       — accumulates one term per run; becomes the strongest
--                       source over time, but only over time.
--   4. manual         — override, always wins.
--
-- WARN-ONLY, same as prerequisites: the planner flags a placement only when
-- confidence is high enough. Low confidence degrades to silence, never to a
-- wrong warning.
-- ---------------------------------------------------------------------

create table catalog_course_availability (
  course_id     uuid not null references catalog_courses(id) on delete cascade,
  season        term_season not null,
  is_offered    boolean not null default true,
  source        availability_source not null,
  -- 0.0–1.0. Suggested: manual 1.0, catalog_text 0.9, observed 0.3 + 0.2 per
  -- additional confirming term (capped), plan_of_study 0.2.
  confidence    numeric(3,2) not null default 0.5,
  evidence_note text,
  updated_at    timestamptz not null default now(),
  primary key (course_id, season)
);

create index on catalog_course_availability (season) where is_offered;

-- Only warn above this bar; below it the planner stays quiet.
-- comment: tune in the app layer, not hardcoded here.

-- Programs: majors, minors, immersions. Versioned by catalog year, because a
-- flowchart must stay pinned to the requirements in effect when it was made.
create table catalog_programs (
  id            uuid primary key default gen_random_uuid(),
  code          text,                     -- 'COMPSCI-BS'
  slug          text,                     -- 'computer-science-bs' (CourseLeaf)
  name          text not null,            -- 'Computer Science BS'
  type          program_type not null,
  degree        text,                     -- 'BS', 'MS'
  college_code  text references catalog_colleges(code),
  catalog_year  text not null,            -- '2026-27'
  total_credits numeric(5,1),
  source        ingest_source,
  updated_at    timestamptz not null default now(),
  unique (slug, catalog_year)
);

-- Optional grouping for "Select two of the following" / degree-option clusters.
create table catalog_requirement_groups (
  id           uuid primary key default gen_random_uuid(),
  program_id   uuid not null references catalog_programs(id) on delete cascade,
  title        text,                      -- 'Wireless Communications option'
  select_count integer,                   -- pick N of the member slots
  credits      numeric(5,1),
  sort_order   integer not null default 0
);

-- The template structure: one row per cell in the Plan of Study Grid.
-- kind drives interpretation:
--   'course'      -> course_id is set (a specific required course)
--   'placeholder' -> label + optional required_attribute_id (e.g. Gen Ed Artistic)
--   'coop'        -> renders full-width; course_id optional (CSCI-499 etc.)
--   'custom'      -> label only; rare in a template, common in user flowcharts
create table catalog_requirement_slots (
  id                    uuid primary key default gen_random_uuid(),
  program_id            uuid not null references catalog_programs(id) on delete cascade,
  group_id              uuid references catalog_requirement_groups(id) on delete set null,
  year_number           smallint not null,          -- 1..5
  season                term_season,                -- null = "anytime that year"
  sort_order            integer not null default 0,
  kind                  block_kind not null,
  course_id             uuid references catalog_courses(id),
  -- Display name for non-course slots. Placeholders: 'Gen Ed Immersion 1',
  -- 'CS Elective'. Custom: whatever the user types.
  label                 text,
  required_attribute_id uuid references catalog_attributes(id),
  credits               numeric(4,1),
  category_hint         text,                       -- color grouping: 'CS/SWE','Math','GenEd'
  notes                 text,

  constraint slot_shape check (
    (kind = 'course'      and course_id is not null) or
    (kind = 'placeholder' and label is not null) or
    (kind = 'custom'      and label is not null) or
    (kind = 'coop')
  )
);

create index on catalog_requirement_slots (program_id, year_number, season, sort_order);


-- =====================================================================
-- APP LAYER — user-owned, RLS enforced
-- =====================================================================

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  primary_program_id uuid references catalog_programs(id),
  created_at    timestamptz not null default now()
);

create table flowcharts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,                  -- 'My Plan', 'What if I add a minor'
  catalog_year  text,
  is_archived   boolean not null default false,

  -- Set when the flowchart is instantiated or re-synced from its templates.
  -- Compare against catalog_programs.updated_at to detect "the template changed
  -- since you built this" and offer a sync.
  template_synced_at timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index on flowcharts (user_id) where is_archived = false;

-- A flowchart can draw on several programs at once: a primary major, a second
-- major, minors, immersions. v1 will typically insert exactly one row with
-- role='primary'; the shape costs nothing now and avoids a painful migration
-- once double majors / BS-MS plans are supported.
create table flowchart_programs (
  flowchart_id uuid not null references flowcharts(id) on delete cascade,
  program_id   uuid not null references catalog_programs(id),
  role         program_role not null,
  sort_order   integer not null default 0,
  primary key (flowchart_id, program_id)
);

create index on flowchart_programs (program_id);

-- At most one primary program per flowchart.
create unique index on flowchart_programs (flowchart_id) where role = 'primary';

-- Blocks are MATERIALIZED COPIES of requirement slots, not live references.
-- If RIT changes the CS curriculum next year, existing user flowcharts must not
-- silently mutate. source_slot_id keeps provenance for a future "template has
-- changed, want to sync?" feature.
--
-- Placeholder resolution: a block keeps kind='placeholder' AND gains a course_id.
-- That preserves "this was a Gen Ed Artistic slot, filled with ARTH-135".
create table flowchart_blocks (
  id                    uuid primary key default gen_random_uuid(),
  flowchart_id          uuid not null references flowcharts(id) on delete cascade,

  -- Semantic position (year/term/order), not pixel coordinates. Survives layout
  -- changes and makes future credit-per-term validation trivial.
  year_number           smallint not null,
  season                term_season not null,
  sort_order            integer not null default 0,

  kind                  block_kind not null,
  course_id             uuid references catalog_courses(id),
  -- Display name for non-course blocks. Placeholders carry the requirement name
  -- ('Gen Ed Immersion 1'); custom blocks carry whatever the user typed
  -- ('Study Abroad - Prague', 'ACM Officer').
  label                 text,
  required_attribute_id uuid references catalog_attributes(id),

  credits_override      numeric(4,1),      -- variable-credit courses; also credits for custom blocks
  status                block_status not null default 'planned',
  -- Free text origin for status in ('transferred','waived'): 'AP Calculus BC (5)',
  -- 'Monroe CC MAT-201', 'dept substitution — advisor approved'. Kept unstructured
  -- deliberately; transfer articulation is far too messy to model in v1.
  credit_source         text,
  notes                 text,
  category_hint         text,
  color_override        text,

  -- Provenance. Null for blocks the user added themselves.
  source_slot_id        uuid references catalog_requirement_slots(id) on delete set null,
  -- Set true once the user edits a template-derived block, so a future sync can
  -- avoid clobbering their changes.
  is_user_modified      boolean not null default false,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint block_shape check (
    (kind = 'course'      and course_id is not null) or
    (kind = 'placeholder' and label is not null) or
    (kind = 'custom'      and label is not null) or
    (kind = 'coop')
  )
);

create index on flowchart_blocks (flowchart_id, year_number, season, sort_order);
create index on flowchart_blocks (course_id);


-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

alter table profiles           enable row level security;
alter table flowcharts         enable row level security;
alter table flowchart_blocks   enable row level security;
alter table flowchart_programs enable row level security;

create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own flowcharts" on flowcharts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own blocks" on flowchart_blocks
  for all using (
    exists (select 1 from flowcharts f
            where f.id = flowchart_blocks.flowchart_id and f.user_id = auth.uid())
  ) with check (
    exists (select 1 from flowcharts f
            where f.id = flowchart_blocks.flowchart_id and f.user_id = auth.uid())
  );

create policy "own flowchart programs" on flowchart_programs
  for all using (
    exists (select 1 from flowcharts f
            where f.id = flowchart_programs.flowchart_id and f.user_id = auth.uid())
  ) with check (
    exists (select 1 from flowcharts f
            where f.id = flowchart_programs.flowchart_id and f.user_id = auth.uid())
  );

-- Catalog is world-readable to signed-in users; writes are service-role only.
alter table catalog_courses            enable row level security;
alter table catalog_course_attributes  enable row level security;
alter table catalog_course_prerequisites   enable row level security;
alter table catalog_course_term_offerings  enable row level security;
alter table catalog_course_availability    enable row level security;
alter table catalog_attributes         enable row level security;
alter table catalog_programs           enable row level security;
alter table catalog_requirement_slots  enable row level security;
alter table catalog_requirement_groups enable row level security;
alter table catalog_terms              enable row level security;
alter table catalog_subjects           enable row level security;
alter table catalog_colleges           enable row level security;

create policy "catalog readable" on catalog_courses            for select using (true);
create policy "catalog readable" on catalog_course_attributes  for select using (true);
create policy "catalog readable" on catalog_course_prerequisites   for select using (true);
create policy "catalog readable" on catalog_course_term_offerings  for select using (true);
create policy "catalog readable" on catalog_course_availability    for select using (true);
create policy "catalog readable" on catalog_attributes         for select using (true);
create policy "catalog readable" on catalog_programs           for select using (true);
create policy "catalog readable" on catalog_requirement_slots  for select using (true);
create policy "catalog readable" on catalog_requirement_groups for select using (true);
create policy "catalog readable" on catalog_terms              for select using (true);
create policy "catalog readable" on catalog_subjects           for select using (true);
create policy "catalog readable" on catalog_colleges           for select using (true);

-- Ingest tables: no policies at all = service role only.
alter table ingest_runs      enable row level security;
alter table ingest_documents enable row level security;


-- =====================================================================
-- V2 EXPANSION SEATS — designed, deliberately NOT created yet.
-- Documented here so v1 choices don't foreclose them.
-- =====================================================================

-- Structured prerequisites (replaces reliance on catalog_courses.prereq_text).
-- Nested AND/OR handled via self-referencing groups.
--
-- create table catalog_course_prerequisites (
--   id          uuid primary key default gen_random_uuid(),
--   course_id   uuid not null references catalog_courses(id) on delete cascade,
--   parent_id   uuid references catalog_course_prerequisites(id) on delete cascade,
--   logic       text check (logic in ('AND','OR')),
--   required_course_id uuid references catalog_courses(id),
--   min_grade   text,
--   is_corequisite boolean not null default false,
--   raw_fragment text
-- );

-- Section / meeting data (instructor, weekly schedule, seats): OUT OF SCOPE.
-- This project plans whole curricula — "will I meet every requirement before I
-- graduate" — not individual semesters. Choosing a specific section, professor
-- or meeting time is a different product. Ingestion should read section rows
-- only to derive course-level facts, then discard them.
--
-- ONE EXCEPTION WORTH KNOWING ABOUT: term availability. "CSCI-331 is only
-- offered in Fall" is course-level, matters for curriculum planning, and is
-- derivable ONLY by observing sections across multiple terms. Because
-- TigerCenter exposes exactly one active term at a time, this cannot be
-- backfilled later — it can only be accumulated going forward. See
-- catalog_course_term_offerings below.

-- Sharing / advisor view.
--
-- create table flowchart_shares (
--   flowchart_id uuid references flowcharts(id) on delete cascade,
--   shared_with_user_id uuid references auth.users(id),
--   permission text check (permission in ('view','comment')),
--   share_token text unique
-- );

-- Requirement validation results (cached output of the v2 rules engine).
--
-- create table flowchart_validations (
--   flowchart_id uuid references flowcharts(id) on delete cascade,
--   computed_at timestamptz, is_satisfied boolean, findings jsonb
-- );

-- MULTI-PROGRAM MECHANICS (v2+)
-- flowchart_programs already supports attaching several programs. What it does
-- NOT yet model is how they interact:
--   - double-counting rules (can one course satisfy both majors? RIT limits this)
--   - which program a given block is "counting toward" — likely a join table
--     flowchart_block_fulfillments(block_id, program_id, slot_id) so one course
--     can satisfy requirements in two programs simultaneously
--   - BS/MS shared-credit allowances (typically a capped number of grad credits
--     applied to the undergrad degree)
-- These are validation-engine concerns and depend on rules RIT publishes per
-- program, so they intentionally wait until v2 rather than being guessed at now.
