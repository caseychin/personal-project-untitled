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

Confirmed working for an arbitrary slug (`computer-science-bs`) as well as the
originally-sampled one — the earlier "untestable for other slugs" caveat was a
caching artifact in the exploratory tool, not a real limitation.

**Catalog year (Task 2, 2026-08-28).** The curriculum endpoint above does
**not** carry `catalog_year` anywhere in its response. It lives instead as a
static, server-rendered heading on the program's marketing page:

```
GET https://www.rit.edu/study/{slug}
→ <h2 class="row--title mb-4">Curriculum for 2026-2027<span class="sr-only">...</span></h2>
```

Confirmed identical (`2026-2027`) across a degree program
(`computer-science-bs`), an immersion (`physics-immersion`), and a second
degree program (`software-engineering-bs`) — this is a single site-wide
value for the live catalog edition, not something that varies per program.
Fetch it once per ingestion run, not once per program. Note this is a
narrower claim than the earlier ruling-out of `/study/{slug}` pages
(marketing-page *course-list content* is JS-rendered and empty in static
HTML, per the note below) — this specific heading is server-rendered and
present.

**Program-slug enumeration (Task 2, 2026-08-28).**

```
GET https://www.rit.edu/study/undergraduate
```

A static, directly-scrapable listing page — 166 real `/study/{slug}` links
extracted directly from raw HTML, no JS execution needed (found via the same
technique that found the immersions listing in Task 0.5: `/study/undergraduate`
is linked from that listing page's own nav). Confirmed to include
`computer-science-bs`. Not yet checked: whether `/study/graduate` (also
linked from the immersions listing's nav) follows the same pattern for
graduate programs — untested, out of scope for Task 2's undergraduate focus.

**Confirmed working — course-level detail:**

```
GET https://www.rit.edu/programs-api/courseleaf/proxy-bubble.php?code={SUBJECT-NUMBER}
```

Found by reading `/programs-api/courseleaf/functions.js` (loaded on
`rit.edu/study/{slug}` pages), not by guessing paths — the `showCourse()`
handler behind every clickable course-code bubble calls this endpoint directly.
Anonymous, no cookies, same as the program endpoint. Returns:

```xml
<?xml version="1.0"?>
<courseinfo>
<course code="CSCI-141">
<![CDATA[
<div class="courseblock">...title, credits, contact hours, description...
  <span class="text detail-requisites">Prerequisite: ...</span>
  <span class="text detail-ge_attrs">May be used to fulfill one or more of the following: ...</span>
  <span class="text detail-typically_offered">Typically Offered: Fall, Spring</span>
</div>
]]>
</course>
</courseinfo>
```

An unknown code (e.g. `ZZZZ-999`) returns `200` with an empty
`<courseinfo></courseinfo>` — a clean not-found signal, no error page to
special-case.

This single endpoint answers both halves of what Task 0.1 was probing for:

- **Availability:** `detail-typically_offered` gives exactly the free-text
  "Typically Offered: Fall, Spring" note `catalog_text` seeding assumed
  (confidence 0.9 — see `schema-decisions.md` Decision 6 and
  `db/schema.sql`'s `catalog_course_availability` comment).
- **Prerequisites:** `detail-requisites` gives *better than plain text*.
  Sample (`CSCI-243`):

  > "Prerequisite: C- or better in CSCI-140 or CSCI-142 or CSCI-242 or
  > SWEN-124 or CSEC-124 or GCIS-124 or GCIS-127 or equivalent course."

  Each referenced course is an `<a onclick="showCourse(this, 'CSCI-140')"
  title="CSCI-140">` link, so course codes are structurally extractable from
  the `title` attribute rather than needing to be parsed out of prose. The
  min-grade phrasing ("C- or better in ...") and the irreducible tail
  ("... or equivalent course") still need Task 4's parser, but code
  extraction itself is a lookup, not NLP. This is a stronger starting point
  for the prereq parser than TigerCenter's `preReqDescrsLong` alone —
  consider diffing the two sources per course during Task 4 rather than
  picking one.
- **Now the answer to 0.3:** `detail-ge_attrs` lists Gen Ed attributes on this
  endpoint too. The original sample (`CSCI-141`, undergrad) was non-empty
  (`GE: Elective, GE: Mathematical Perspective, NTID Math Processes, SMTL:
  Science/Math Literacy`), and two more UGRD Gen Ed courses were verified
  cookie-less on 2026-08-22: `ARTH-135` → `GE: Elective, GE: Artistic
  Perspective, GE: Global Perspective`; `PHIL-101` → `GE: Elective, GE:
  Ethical Perspective, GE: Social Perspective`. All three map cleanly onto
  the `advancedSearchData` vocabulary table below by name (Artistic ↔
  `ARTISTIC`, Global ↔ `GLOBAL`, Ethical ↔ `ETHICAL`, Social ↔ `SOCIAL`,
  Elective ↔ `GENED ELEC`). At the time this was written, `class-search` was
  blocked by Task 0.6, so **this became the adopted mechanism for
  placeholder resolution (MVP feature #8)**: parse `detail-ge_attrs` free
  text against the vocabulary table, not TigerCenter's
  `attributeKeys`/`attributeValues`.

  **Update 2026-08-26: Task 0.6 is resolved (it was a missing header, not a
  data-availability gap) — `class-search`'s `attributeKeys`/`attributeValues`
  now confirmed working and agree with `detail-ge_attrs` on `ARTH-135`.** The
  Programs API mechanism above is still valid and still works; it's just no
  longer the *only* option. Whether to keep it as the primary source, switch to
  TigerCenter's now-working field, or cross-validate both is a design choice
  for Task 2/3, not resolved here — see the fuller comparison in the
  TigerCenter section below and the flag in `schema-decisions.md`.

### Immersions

**Resolved (Task 0.5, 2026-08-26).** Immersions are not part of the degree
program's curriculum section — the CS BS Plan of Study Grid references them
by name only, as plain unlinked text (`<span class="comment">General
Education: Immersion 1 (WI)</span>`, `Immersion 2`, `Immersion 3`), unlike
Gen Ed Perspective slots in the same document, which link out to their
course-list pages (`/study/general-education-course-lists/{perspective}/`).
No course codes, no links, no course-list data of any kind on the degree
page itself.

Immersion definitions live on **separate, sibling CourseLeaf program pages**,
one per immersion. Found via static analysis of `functions.js` (same
technique that found `proxy-bubble.php` in Task 0.1): its accordion logic
special-cases any page whose `<h1>` contains "minor", "immersion",
"exploration", etc. — the same treatment as minors, implying immersions sit
in the same catalog structure as programs/minors rather than as a subsection
of a degree page.

Confirmed: the same curriculum endpoint used for degree programs works
identically against an immersion slug:

```
GET https://www.rit.edu/programs-api/courseleaf/proxy-api.php\
?url=/programs/{immersion-slug}/index.xml&section=curriculum&removeheader=true
```

Sample (`physics-immersion`, 200 OK):

```html
<h3>Physics Immersion</h3>
<!-- Prerequisites table: PHYS-211, PHYS-212, one of two Calculus sequences -->
<!-- Required Courses / Electives table: PHYS-213 required, select 2 of 7
     electives, footnotes constraining substitutions and a 300-level minimum -->
```

The response shape differs from a degree program's: immersions return
`sc_courselist` select-N-of-M tables (Prerequisites / Required Courses /
Electives), not a year/term Plan of Study Grid.

**Update (Task 2, 2026-08-29): all 77 confirmed reachable, but the shape
question is only partly closed.** A live run fetched all 77 immersions'
curriculum documents; every one returned a parseable `<h3>` name and (where
present) a `tr.listsum` "Total Hours" row, so the *lightweight* fields Task 2
actually needs are confirmed uniform across all 77. The deeper question —
whether every immersion's `sc_courselist` internal structure (Prerequisites /
Required / Electives tables) matches `physics-immersion`'s exact shape — is
**still only sampled on one**, since Task 2 deliberately doesn't parse that
structure (see the flag in `schema-decisions.md`). Re-open this if a future
task needs to parse immersion internals.

**Slug divergence (Task 2, 2026-08-29) — the `/study/` listing slug and the
canonical `/programs/` curriculum-document slug are not always the same
string.** E.g. the immersions-and-minors listing gives
`advertising-and-public-relations-immersion`, but the real curriculum
document is at `advertising-public-relations-immersion` — connector words
("and", "in", etc.) get dropped inconsistently between the two URL
namespaces, discovered only because a full 77-immersion run surfaced it
(`physics-immersion`, Task 0.5's original sample, happened to match by
coincidence — a single sample wasn't enough to catch this). Confirmed common,
not rare: 3 of the first 4 immersions spot-checked directly mismatched.

**Resolution:** each immersion's own `/study/{listingSlug}` marketing page
reliably embeds its real slug in an inline script call:

```js
loadCourseleafData('/programs-api/courseleaf/proxy-api.php?url=/programs/{realSlug}/index.xml&section=...')
```

Fetch the marketing page first, extract `{realSlug}` from that call, then
fetch the curriculum document with the corrected slug. Doubles the request
count for immersions (marketing + curriculum per immersion) but is reliable
— all 77 resolved correctly this way. **Not yet checked:** whether the same
divergence affects degree-program slugs (all three tested in Task 2 —
`computer-science-bs`, `software-engineering-bs`, `mechanical-engineering-bs`
— happened to match directly, but that's 3 of 166 listed undergraduate
programs).

**Enumeration:** a full, static-HTML (non-JS-rendered) index exists at
`https://www.rit.edu/study/immersions-and-minors` — 77 `-immersion` links
extracted directly from raw `curl` output, no JS execution needed. Notable
because it's the opposite of program marketing pages (`/study/{program-slug}`),
already ruled out above as JS-rendered and empty in static HTML — this
listing page is different and is directly scrapable. No sign of real
pagination on the list (one "pagination" string match on the page is inside
an escaped JSON template for RIT's sitewide search widget, unrelated to this
content).

None of the 77 slugs is CS-specific by name (closest: `principles-computing-immersion`)
— consistent with the CS BS curriculum's generic, unlinked "Immersion 1/2/3"
placeholders: immersion choice is a free student pick across the whole
catalog, not prescribed per-program. This is architecturally different from
Gen Ed Perspectives, where the curriculum links to one specific perspective's
course list.

**Practical implication for Task 2 — done as of PR #3.** Immersions are
ingested as their own `catalog_programs` rows (`type = 'immersion'`),
independently of degree-program curriculum parsing, so Immersion placeholder
slots can reference them generically by name — not parsed out of any single
degree program's curriculum response.

**Not resolved:** the exact `section=` query values for "admission
requirements" / "additional information" on the degree endpoint. Tried
`"admission requirements"` (URL-encoded with a space) and
`"admissionrequirements"` (no space) against `computer-science-bs` — both
returned a clean `400 Invalid section requested.` Not pursued further since
it didn't bear on 0.5 — immersions are confirmed absent from every degree-page
section checked, including `overview` (200 OK, zero mentions) — but flagging
in case a future task needs those sections for something else.

---

## TigerCenter

Backed by **SolrCloud** behind a thin proxy — `currentTerms` leaks a raw Solr
envelope (`zkConnected`, `QTime`, `params: {q: "*:*", rows: "200", wt: "json"}`).
This explains `_sort`-suffixed field names. Do not probe Solr internals or
attempt arbitrary query injection.

### Anonymous access — confirmed

`GET /tigerCenterApi/tc/currentTerms` and `/tigerCenterApi/tc/advancedSearchData`
both return complete data with **no cookies, no session, no custom headers**.

`POST /tigerCenterApi/tc/class-search` is **confirmed** the same (Task 0.2,
resolved). A cookie-less POST of the documented body returns `200` with a
valid JSON envelope, byte-identical to the same POST with the ingress cookie
attached — cookies make no observable difference. `/maintenance` reports
`searchDown: false`, so the endpoint is not gating on auth. No endpoint probed
(root page, `/tigerCenterApp/`, or `class-search` itself) ever issued a
`TC_SESSIONID` — only `INGRESSID`, which behaves like a plain load-balancer
routing cookie (`HttpOnly`, auto-issued on every response, no app semantics).
**No bootstrap step is needed for `class-search`.**

> **Task 0.6 RESOLVED (2026-08-26).** `class-search` was never data-empty —
> every probe below that returned `found: 0` was missing one header:
> **`Accept: application/json`**. curl's default (`Accept: */*`) does not
> satisfy whatever the server or an intermediary checks for; sending an
> explicit `application/json` value (bare `application/json` is sufficient —
> no `User-Agent` override, no `Accept-Language`, no `Sec-Fetch-*` needed)
> makes the exact same request/body/term return real data (`found: 139` for
> `CSCI`/`2261`). Confirmed reproducible: re-ran the header-less baseline
> immediately afterward and it was still `found: 0`, ruling out a
> coincidental server-side recovery. **This was a request-shape bug all
> along** — specifically a missing header, not a missing body field, not a
> data-availability gap, and not bot-mitigation on `User-Agent`. The
> extended investigation trail below (data-availability theory,
> multi-term testing, static bundle analysis) is kept as a record of how
> this was narrowed down, but its central conclusion — "the index is
> empty" — was wrong. See "Task 0.6 — final resolution" after the trail for
> what's now confirmed correct.

Unresolved side-finding from this same probe: every query shape tried against
the current term (`2261`) returned `{"found":0,"searchResults":[]}` — the
documented body verbatim, a `subject`+`isAdvanced` variant, and a free-text
query on a real course-title word. This looks unrelated to cookies (identical
result with/without) and is tracked as Task 0.6 below.

Follow-up probes (2026-08-22): a fully unconstrained query (`query: ""`,
`isAdvanced: false`, no filters, `rows: 100`) still returned `found: 0` —
ruling out a malformed/wrong-shaped request as the cause, since zero
constraints would surface *something* if the index held any documents for
this term. Meanwhile `GET autoComplete?query=CSCI&term=2261` returned a full,
populated subject/course-code list for the same term. Read together, this
points to `class-search`'s backing Solr collection being empty for `2261`
specifically — a data-availability problem, not a request-shape one — while
other TigerCenter endpoints (`currentTerms`, `advancedSearchData`,
`autoComplete`) read from populated collections. Not fully confirmed (a real
browser network trace would close this out, per the handoff brief's Task 0.6
steps) but strong enough to have redirected Task 0.3 to a workaround — see
"Now the answer to 0.3" above.

**Follow-up (2026-08-26): static analysis in place of a live browser trace.**
No browser/devtools automation was available in this environment, so the
"capture the real frontend request" candidate step was done via static
analysis instead — the same technique that found `proxy-bubble.php` in Task
0.1. Downloaded the live TigerCenter Angular app's bundles (`main-LVTLP2OD.js`
plus all 6 referenced lazy chunks) and located the actual search-results
component's source (`chunk-2FZNCB6U.js`), which defines the real default
request body:

```js
staticSearchParams = {query:"",term:"",rows:5,pageNumber:0,
  sortCategory:"course_title_long_sort",sortOrder:"asc",filterAnd:null,
  isAdvanced:false,campus:null,session:null,courseAttributeOptions:[],
  courseAttributeOptionsPassed:[],career:null,college:null,component:null,
  creditsMax:null,creditsMin:null,precision:null,instructionType:null,
  instructor:null,subject:null,days:"",daysFilterAnd:true,
  filterShowOnlyOptions:"",classBeginsAt:""}
```

Confirmed field-for-field against the documented body above: every field
name, value, and type matches exactly (including `term` — the raw `strm`
string, unmodified — and `sortCategory`, which resolves to the literal
constant `"course_title_long_sort"`), with exactly one addition:
`classBeginsAt: ""`. The HTTP client config was also confirmed identical
(`baseURL: "/tigerCenterApi/tc/"`, only header `Content-Type`).

Tested the one difference directly: added `classBeginsAt: ""` to a
cookie-less probe against term `2261`. **No change** — still `200`,
`{"found":0,"searchResults":[]}`. This rules out the missing field as the
cause.

**Net effect: this is stronger evidence against a request-shape bug, not a
new lead.** The documented body was already, functionally, an exact replica
of what the real frontend sends. This further corroborates the
data-availability-gap theory over a malformed/stale request, though it
doesn't independently confirm the index is empty (that inference still
rests on the unconstrained-query + `autoComplete` comparison above). The
SSO-authenticated-session step remains untried — out of scope without a
check-in first, per the handoff brief. **Still not fully closed.**

**Follow-up (2026-08-26, continued) — reframing: this is not specific to
term `2261`.** Everything above assumed the gap was scoped to the current
term. Tested against two additional term codes, each independently
confirmed *valid* first (a control probe against an obviously-fake term,
`9999`, returns `autoResults: []`, whereas real terms don't — so this isn't
"any string is silently accepted"):

| Term | Period | `autoComplete` | `class-search` |
|---|---|---|---|
| `2261` | Fall 2026 (upcoming — current per `currentTerms`) | real, term-specific course list | `found: 0` |
| `2255` | Spring 2026 (already completed) | real, term-specific course list | `found: 0` |
| `2251` | Fall 2025 (already completed) | real, term-specific course list | `found: 0` |

Both `2255` and `2251` are fully-completed terms — any "the schedule isn't
published yet" explanation cannot apply to them, yet `class-search` returned
`found: 0` for both, identically to `2261`. **This weakens the
"not-yet-indexed" theory and reframes 0.6:** the gap is not one term's Solr
collection being empty — `class-search` appears non-functional (or
returning empty results) across every term tested, while `autoComplete`
correctly differentiates course lists per term across the same three terms.

This also surfaces a second, previously-unflagged tension: the "Terms — one
at a time" note below states TigerCenter "cannot supply historical or
future-term data," based on `currentTerms` listing only the active term.
`autoComplete`'s behavior here complicates that — it clearly holds and
differentiates data for terms `currentTerms` never lists. Whether that
extends to real section/course data (not just subject/course-code lists) is
unknown, since `class-search` — the endpoint that would prove it — is the
one endpoint that isn't working. **Flagging, not revising the schema
assumption** — see the parallel flag in `schema-decisions.md`.

Leading hypothesis, not yet tested: since `class-search` is the one
"heavy" bulk-data endpoint that fails while three lighter lookup endpoints
(`currentTerms`, `advancedSearchData`, `autoComplete`) all work fine on
identical cookie-less requests, this pattern is also consistent with a
WAF/bot-mitigation layer selectively soft-blocking `class-search` (returning
a valid-looking empty `200` rather than an error, a common anti-scraping
technique) based on client fingerprint (e.g. `User-Agent`) rather than an
actually-empty backend. **Untested** — every probe so far used curl's
default `User-Agent`; no probe has yet varied it. See "Next steps" in the
handoff brief.

### Task 0.6 — final resolution (2026-08-26)

Tested the client-fingerprint hypothesis above by varying headers one at a
time, cookie-less, serial, against the exact same body/term/query used in
every `found: 0` probe above:

| Headers added beyond the bare documented body | Result |
|---|---|
| `User-Agent` (realistic Chrome UA) alone | `found: 0` |
| `User-Agent` + `Accept` + `Accept-Language` | `found: 139` |
| `User-Agent` + `Accept` (no `Accept-Language`) | `found: 139` |
| `Accept: application/json, text/plain, */*` alone (curl's default UA) | `found: 139` |
| **`Accept: application/json` alone** (nothing else changed) | **`found: 139`** |
| Baseline again, immediately after, no `Accept` override | `found: 0` |

**`Accept: application/json` is the entire fix.** Not `User-Agent`, not a
body field, not cookies, not SSO. Every prior probe in this document and in
the handoff brief that reported `found: 0` — the 0.2 sample, the 0.3
blocker, every 0.4 `rows` probe, the multi-term test above — was missing
this one header. The multi-term test above should be treated as
**superseded**: it's likely `2255` and `2251` would also return real data
with the header present (not yet re-tested at time of writing, but there's
no remaining reason to expect otherwise).

Practical implication for Task 2/3 ingestion code: send
`Accept: application/json` explicitly on every `class-search` request.
Don't rely on an HTTP client's default `Accept` header — several common
ones (including curl's) default to `*/*`, which this endpoint (or something
in front of it) treats differently from an explicit `application/json`
despite `*/*` being a technically valid match under normal content
negotiation.

This also retroactively resolves the "Terms — one at a time" caveat below:
since the root cause was a header, not term-scoped data availability, it no
longer implies anything about whether TigerCenter can serve historical
terms through `class-search` — that question is open again, separately, and
worth a quick re-test now that the endpoint actually works.

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

`strm` is the PeopleSoft term field. **Only one term is reported as *active*
by `currentTerms`** — that much still holds. But the conclusion drawn from
it, "TigerCenter cannot supply historical or future-term data" (the premise
behind `catalog_course_term_offerings` accumulating observations rather than
backfilling), **is overturned as of 2026-08-26.**

**`class-search` returns real historical-term data once the `Accept` header
bug (Task 0.6) is fixed.** Tested cookie-less against three terms
`currentTerms` never lists, each confirmed genuine first via a `9999`
control (which returns `autoResults: []`):

| Term | Period | `class-search` result |
|---|---|---|
| `2251` | Fall 2025 (completed ~1 year ago) | `found: 145`, full real section data |
| `2231` | Fall 2023 (completed ~3 years ago) | `found: 134`, full real section data |

Both returned complete section records — instructors, meeting times, seat
counts, prereq text — identical in shape to the current-term response. This
was not tested exhaustively (no attempt yet to find where retention actually
ends), but three years back with no sign of degradation is a meaningfully
different picture than "one term only." **Flagging for Task 2/3/5 design
reconsideration, not deciding here** — see the parallel flag in
`schema-decisions.md`. If historical terms are reliably available, backfilling
`catalog_course_term_offerings` (rather than only accumulating forward) may
be possible and would remove the cold-start problem Task 5's confidence
model was designed around.

### class-search request

```
POST https://tigercenter.rit.edu/tigerCenterApi/tc/class-search
Content-Type: application/json;charset=UTF-8
Accept: application/json
Origin / Referer: https://tigercenter.rit.edu
```

**`Accept: application/json` is required** — its absence (e.g. an HTTP
client's default `Accept: */*`) was the entire cause of Task 0.6's
`found: 0` mystery. See "Task 0.6 — final resolution" above.

```json
{"searchParams":{
  "query":"CSCI","term":"2261","rows":5,"pageNumber":0,
  "sortCategory":"course_title_long_sort","sortOrder":"asc",
  "filterAnd":null,"isAdvanced":false,"campus":null,"session":null,
  "courseAttributeOptions":[],"courseAttributeOptionsPassed":[],
  "career":null,"college":null,"component":null,
  "creditsMax":null,"creditsMin":null,"precision":null,
  "instructionType":null,"instructor":null,"subject":null,
  "days":"","daysFilterAnd":true,"filterShowOnlyOptions":"",
  "classBeginsAt":""}}
```

`pageNumber` is zero-indexed. **`classBeginsAt` added 2026-08-26** — confirmed
present in the live frontend's default request (see Task 0.6 static-analysis
follow-up below); the original sample predates it. Tested cookie-less with
the field added: no change in behavior (still `found: 0`), so its absence
was not the cause of the Task 0.6 anomaly.

**Task 0.4 (max `rows`) — RESOLVED (2026-08-26), after the Accept-header fix
made real result sets observable.** All earlier `rows` probes (5 through
100,000, all returning `found: 0`) were invalidated by the Task 0.6 bug —
they never actually exercised the server's row-fetching logic. Re-tested
against an unconstrained query (`query: ""`, term `2261`, `found: 6676`
total) to guarantee enough real rows to hit any ceiling, binary-searching
the boundary:

| `rows` requested | Result |
|---|---|
| 5, 50, 100, 110, 120, 130, **140** | `200`, full real data, no truncation error |
| **141**, 145, 148, 149, 150, 200, 1000, 5000, 10000 | `500 INTERNAL_SERVER_ERROR` |

**The ceiling is `rows: 140`.** `141` and above reproducibly return a `500`
with a leaked Java stack trace:

```
java.lang.RuntimeException: Error extracting parameters
  at edu.rit.tigercenter.datasources.classsearch.ClassSearchServiceImpl.search(ClassSearchServiceImpl.java:342)
  at edu.rit.tigercenter.datasources.classsearch.ClassSearchController.search(ClassSearchController.java:34)
  ...(Spring/servlet frames)
```

This is a genuine server bug, not a documented/graceful limit — a real
value being rejected outright rather than clamped, with verbose debug
output (class names, line numbers, full framework stack) leaking in the
error response. **Not something to poke further or rely on for
reconnaissance** — noting it for completeness and because ingestion code
needs to know to stay at or below 140, not because it's worth exploring.

**Important nuance:** the ceiling only triggers when the query actually has
enough real rows to need fetching that many. `query: "CSCI"` (`found: 139`)
succeeded even at `rows: 200`, because the effective number of rows the
server had to produce (139) stayed under the 140 threshold — requesting
more than what's available gets clamped silently before hitting whatever
breaks at 141. **Practical rule for Task 2/3 ingestion:** page with
`rows: 100` (matches the frontend's own max `pageSizeOptions` value, and
sits safely under 140) rather than trying to fetch more per request.

### class-search response

**Results are section-level, not course-level.** `found: 142` for CSCI means 142
*sections*. Deduplicate on `courseId`.

> **Re-confirmed cookie-less, 2026-08-26, with the `Accept` header fix from
> Task 0.6.** The section-level fields below are now verified against real
> current data (`CSCI`/`2261`, `found: 139`) — no longer a documented-but-untested
> shape.

Fields of interest:

- **Identity:** `subject`, `catalogNumber`, `courseId` (stable), `classNumber`, `classSection`
- **Content:** `courseTitleLong`, `courseDescription`, `minimumUnits`, `maximumUnits`
- **Taxonomy:** `academicCareer` (UGRD/GRAD), `academicGroup`, `component`, `campus`
- **Prereqs:** `preReqDescrsLong` — **present, as free text**
  e.g. `"Prerequisites:  CSCI-320 or CSCI-620 or equivalent course."`
- **Attributes:** `attributes`, `attributeKeys`, `attributeValues` — **confirmed
  populated for UGRD courses, 2026-08-26.** `ARTH-135` (queried directly via
  `class-search`, not the Programs API) returned
  `attributeKeys: ["ACCS","GE","PERS"]`,
  `attributeDescriptions: ["GE: Artistic Perspective","General Education Elective","Global Perspective",...]`
  — matching the Programs API's `detail-ge_attrs` workaround finding for the
  same course almost exactly. Task 0.3's original blocker (`class-search`
  returning `found: 0` for everything) is gone now that Task 0.6 is fixed;
  **this field is a viable, cross-validated second source for Gen Ed
  attributes, not just the Programs API.** Whether to use it instead of, or
  alongside, the Programs API workaround is a design choice for whoever
  picks up Task 2/3 — not decided here. See the parallel note in
  `schema-decisions.md`.
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
single-course tags — confirmed they come from the Programs API, via separate
immersion program pages rather than this vocabulary table. See "Immersions"
under Programs API above (Task 0.5, resolved).

## Other vocabulary

- **Colleges (12):** GCCIS, KGCOE, COS, CLA, CAD, SCB, CET, CHST, GIS, NTID, INTSD, STUAF — each with full subject map, term-scoped
- **Campuses (9):** MAIN, DUBAI, CROAT, KOSOV, PRAG, HUNAN, BJTU, DOMRP, TURKY
- **Components (21):** including **`COP` = Cooperative Education**, plus LEC, LAB, LEL, SEM, IND, THE, PRO, INT, STU. Note: Task 2 ended up **not** needing this to identify co-op blocks in `catalog_requirement_slots` — the Programs API grid data is sufficient on its own (a title-text match on "co-op", distinguishing it from e.g. "Cooperative Education Seminar", which is a normal 0-credit course, not a full-term placement). `COP` may still be useful for Task 3's own section-level classification, just isn't a Task 2 dependency.
- **Instruction modes:** P, OL, OA, OS, BL, AB

---

## Open questions

Tracked as Task 0 in `docs/handoff/claude-code-brief.md`:

1. ~~Course-level Programs API endpoint — structured prereqs and offering
   notes?~~ **Resolved** — `proxy-bubble.php?code={code}`, see above.
2. ~~Does `class-search` accept a cookie-less POST?~~ **Resolved** — yes, no
   bootstrap needed, see "Anonymous access — confirmed" above.
3. ~~Do UGRD courses populate attribute fields?~~ **Resolved twice over.**
   Originally answered via workaround (Programs API's `detail-ge_attrs`,
   2026-08-22) because `class-search` was blocked by #6. **Re-resolved
   2026-08-26:** now that #6 is fixed, `class-search`'s own
   `attributeKeys`/`attributeValues` also work and agree with the Programs
   API on `ARTH-135`. Both sources are now viable; which to use is a Task
   2/3 design choice. See "Now the answer to 0.3" and the `class-search`
   response section above.
4. ~~Max `rows` per request?~~ **Resolved 2026-08-26.** The ceiling is
   **`rows: 140`** — `141` and above return a `500` with a leaked Java stack
   trace (`ClassSearchServiceImpl.search`, "Error extracting parameters"),
   but only when the query has enough real results to need that many rows;
   requesting more than what's available is clamped silently instead of
   erroring. Practical rule: page at `rows: 100`. See the 0.4 note above.
5. ~~How are Immersions represented?~~ **Resolved 2026-08-26.** Separate
   sibling CourseLeaf program pages, one per immersion (`/study/{slug}-immersion`),
   found via `functions.js` static analysis. Same curriculum endpoint as
   degree programs but a different response shape (select-N-of-M course
   lists, not a term grid). Full slug enumeration via static HTML at
   `/study/immersions-and-minors` (77 immersions, directly scrapable). Degree
   program curriculum sections reference immersion slots by name only,
   unlinked, with no course-list data. See "Immersions" under Programs API
   above.
6. ~~Why does `class-search` return `found: 0` for every query shape,
   cookie-less?~~ **RESOLVED 2026-08-26.** Root cause: a missing
   `Accept: application/json` header — curl's default `Accept: */*` doesn't
   satisfy whatever the server/gateway checks for. Adding the header alone
   (no `User-Agent` override, no cookies, no SSO) turns every prior
   `found: 0` into real data. This was a request-shape bug the whole time;
   the data-availability-gap theory that dominated this investigation was
   wrong. See "Task 0.6 — final resolution" above.
7. ~~Review RIT terms of use before bulk ingestion.~~ **Resolved 2026-08-26
   (accepted risk).** No robots.txt blocker on any endpoint used. The terms
   of use restrict site content to "personal, noncommercial use" and
   prohibit copying/distributing/redisplaying material — in real tension
   with a bulk-ingest-and-redisplay pipeline, not a clean clearance. Project
   owner decided to proceed given this is a personal, noncommercial project
   — a judgment call, not a legal clearance; revisit if scope/audience
   changes. Full detail in `docs/handoff/claude-code-brief.md` Task 0.7.
8. **New, opened 2026-08-26:** does TigerCenter retain historical-term data
   more broadly than assumed? `class-search` (with the header fix) returned
   real data for terms 3+ years back (`2231`, `2251`), contradicting the
   "TigerCenter cannot supply historical data" premise behind
   `catalog_course_term_offerings`'s accumulate-forward design. Not
   exhaustively tested (retention boundary unknown). See the "Terms — one at
   a time" section above and the flag in `schema-decisions.md`.
9. ~~Do all 77 immersion slugs from the listing page resolve directly to a
   working curriculum document?~~ **Resolved 2026-08-29 (Task 2) — no.** The
   `/study/` listing slug and the canonical `/programs/` curriculum-document
   slug diverge for many immersions; resolved via each immersion's marketing
   page. Not a `class-search`-style request-shape bug — a real slug-naming
   mismatch between two URL namespaces on RIT's own site. See "Slug
   divergence" under Immersions above.
