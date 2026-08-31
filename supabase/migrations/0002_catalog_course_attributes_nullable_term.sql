-- catalog_course_attributes originally assumed every Gen Ed tag is
-- term-scoped (TigerCenter's class-search). Task 3 (TigerCenter adapter)
-- needs to write term-scoped rows now, while leaving room for a future
-- catalog-year-scoped writer (Programs API's detail-ge_attrs, not yet
-- built) without another migration later. Table confirmed empty in dev
-- before this migration ran — no backfill needed.
-- See docs/architecture/schema-decisions.md's term_code flag; decided with
-- the project owner 2026-08-31: one table, nullable term_code, source
-- column, two partial-unique scopes (not a split into two tables).

alter table catalog_course_attributes
  drop constraint catalog_course_attributes_pkey;

alter table catalog_course_attributes
  add column id uuid not null default gen_random_uuid(),
  add column source ingest_source not null,
  alter column term_code drop not null;

alter table catalog_course_attributes
  add constraint catalog_course_attributes_pkey primary key (id);

-- Enforce the scoping rule at the row level, not just via the unique
-- indexes below: a tigercenter row must carry a real term_code, a
-- programs_api row must not (it has no natural term).
alter table catalog_course_attributes
  add constraint catalog_course_attributes_scope_check
    check (
      (source = 'tigercenter' and term_code is not null) or
      (source = 'programs_api' and term_code is null)
    );

-- Two scopes, two uniqueness rules: one course+attribute per term for
-- term-scoped rows, one course+attribute total for catalog-year-scoped rows.
create unique index catalog_course_attributes_term_scoped_uniq
  on catalog_course_attributes (course_id, attribute_id, term_code)
  where source = 'tigercenter';

create unique index catalog_course_attributes_year_scoped_uniq
  on catalog_course_attributes (course_id, attribute_id)
  where source = 'programs_api';
