# Data Sources

Consolidated current state of data-source investigation (Phase 0).
Supersedes the incremental discovery notes kept in Google Drive.

> **Security:** exploratory captures included live session cookies
> (`TC_SESSIONID`, `INGRESSID`). These are personal, expiring tokens and must
> never appear in this repo, in docs, or hardcoded in ingestion code.

---

## Source-of-truth split

| Source | Role | Volatility |
|---|---|---|
| **Programs API / CourseLeaf** | Canonical curriculum structure: degree requirements, year/term sequencing, credit totals, degree options, immersion definitions | Stable, slow-changing |
| **TigerCenter** | Current-term course data: Gen Ed attributes, credits, descriptions, prerequisite text | **One term only**, volatile |

Build flowcharts from the first. Enrich with the second. Keep them as separate,
swappable adapters feeding one normalized schema, so a TigerCenter outage
degrades enrichment without breaking flowcharts.

Ruled out: RIT program marketing pages (`/study/{slug}`) and Gen Ed course-list
pages (`/study/general-education-course-lists/{perspective}/`) both render their
content via JavaScript and contain nothing useful in static HTML.

---

## Programs API (CourseLeaf)

RIT's catalog runs on **CourseLeaf**, so structure is consistent across programs
rather than bespoke per department.

**Confirmed working — program curriculum:**

```
GET https://www.rit.edu/programs-api/courseleaf/proxy-api.php\
?url=/programs/{slug}/index.xml&section=curriculum&removeheader=true
```

Returns a full Plan of Study Grid: year → term → courses, with credit hours,
running term totals, co-op placement, degree options/subplans with their course
lists, and program notes.

Other `section=` values seen on the request form: `overview`,
`admission requirements`, `additional information`.

**Unverified:** a course-level endpoint. The form accepts course codes like
`ACCT-110`, so a path exists but was not identified. See handoff Task 0.1 —
this is the highest-value open question, as it is the best candidate source for
structured prerequisites *and* for seeding term availability.

---

## TigerCenter

Backed by **SolrCloud** behind a thin proxy — `currentTerms` leaks a raw Solr
envelope (`zkConnected`, `QTime`, `params: {q: "*:*", rows: "200", wt: "json"}`).
This explains `_sort`-suffixed field names. Do not probe Solr internals or
attempt arbitrary query injection.

### Anonymous access — confirmed

`GET /tigerCenterApi/tc/currentTerms` and `/tigerCenterApi/tc/advancedSearchData`
both return complete data with **no cookies, no session, no custom headers**.

`class-search` sits outside the `/login_shib/` path so it is likely the same,
but this is **unverified** (handoff Task 0.2).

### Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/tigerCenterApi/tc/class-search` | POST | Course/section search. Main data endpoint. |
| `/tigerCenterApi/tc/currentTerms` | GET | Active term codes |
| `/tigerCenterApi/tc/advancedSearchData` | GET | Full filter vocabulary: colleges, subjects, attributes, campuses, components |
| `/tigerCenterApi/tc/autoComplete?query={q}&term={t}` | GET | Subject/course autocomplete |
| `/tigerCenterApi/tc/maintenance` | GET | Maintenance status — check before bulk runs |
| `/tigerCenterApi/login_shib/*` | GET | SSO-gated. Not needed. |

### Terms — one at a time

```json
{ "strm": "2261", "descr": "2026-27 Fall (2261)" }   // numFound: 1
```

`strm` is the PeopleSoft term field. **Only one term is active at a time.**
This is a confirmed hard constraint: TigerCenter cannot supply historical or
future-term data, which is why `catalog_course_term_offerings` accumulates
observations rather than backfilling them.

### class-search request

```
POST https://tigercenter.rit.edu/tigerCenterApi/tc/class-search
Content-Type: application/json;charset=UTF-8
Origin / Referer: https://tigercenter.rit.edu
```

```json
{"searchParams":{
  "query":"CSCI","term":"2261","rows":5,"pageNumber":0,
  "sortCategory":"course_title_long_sort","sortOrder":"asc",
  "filterAnd":null,"isAdvanced":false,"campus":null,"session":null,
  "courseAttributeOptions":[],"courseAttributeOptionsPassed":[],
  "career":null,"college":null,"component":null,
  "creditsMax":null,"creditsMin":null,"precision":null,
  "instructionType":null,"instructor":null,"subject":null,
  "days":"","daysFilterAnd":true,"filterShowOnlyOptions":""}}
```

`pageNumber` is zero-indexed. Max `rows` unknown (Task 0.4).

### class-search response

**Results are section-level, not course-level.** `found: 142` for CSCI means 142
*sections*. Deduplicate on `courseId`.

Fields of interest:

- **Identity:** `subject`, `catalogNumber`, `courseId` (stable), `classNumber`, `classSection`
- **Content:** `courseTitleLong`, `courseDescription`, `minimumUnits`, `maximumUnits`
- **Taxonomy:** `academicCareer` (UGRD/GRAD), `academicGroup`, `component`, `campus`
- **Prereqs:** `preReqDescrsLong` — **present, as free text**
  e.g. `"Prerequisites:  CSCI-320 or CSCI-620 or equivalent course."`
- **Attributes:** `attributes`, `attributeKeys`, `attributeValues` — empty on the
  sampled GRAD course; unverified for UGRD (Task 0.3)
- **Sections:** `meetings[]`, enrollment counts, `reservedCap[]` — **discard after
  deriving course-level facts**

---

## Gen Ed attribute vocabulary

From `advancedSearchData`. These map 1:1 to the placeholder blocks in the
reference flowchart PDF and are the mechanism behind placeholder resolution.

**`PERS` — Gen Ed Perspectives**

| Code | Name |
|---|---|
| `ARTISTIC` | GE: Artistic Perspective |
| `GLOBAL` | GE: Global Perspective |
| `SOCIAL` | GE: Social Perspective |
| `ETHICAL` | GE: Ethical Perspective |
| `NATSCI INQ` | GE: Natural Science Inquiry Perspective |
| `SCIE-PRIN` | GE: Scientific Principles Perspective |
| `MATHEMATIC` | GE: Mathematical Perspective |

**`WRTG` — Writing Intensive:** `WI-GE`, `FYW`, `WI-PR`
(matches the PDF's "3 writing intensive courses required" note)

**`GE`:** `GENED ELEC` — Gen Ed Elective

Also present: `HNRS`, `ACTV`, `SMTL`, `ARTH`, `DUAL`, plus NTID-specific groups.

**Gap: there is no Immersion attribute.** Immersions are 3-course sequences, not
single-course tags, and must come from the Programs API (Task 0.5).

## Other vocabulary

- **Colleges (12):** GCCIS, KGCOE, COS, CLA, CAD, SCB, CET, CHST, GIS, NTID, INTSD, STUAF — each with full subject map, term-scoped
- **Campuses (9):** MAIN, DUBAI, CROAT, KOSOV, PRAG, HUNAN, BJTU, DOMRP, TURKY
- **Components (21):** including **`COP` = Cooperative Education** (how co-op blocks are identified), plus LEC, LAB, LEL, SEM, IND, THE, PRO, INT, STU
- **Instruction modes:** P, OL, OA, OS, BL, AB

---

## Open questions

Tracked as Task 0 in `docs/handoff/claude-code-brief.md`:

1. Course-level Programs API endpoint — structured prereqs and offering notes?
2. Does `class-search` accept a cookie-less POST?
3. Do UGRD courses populate attribute fields?
4. Max `rows` per request?
5. How are Immersions represented?
6. Review RIT terms of use before bulk ingestion.
