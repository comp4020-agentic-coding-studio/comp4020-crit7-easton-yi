# Process overview

## What I built

Weekwise: an ANU timetable planner where a student picks 3–4 preloaded
courses, marks unavailable blocks, picks one preference, compares up to three
conflict-free timetables, and saves one to SQLite behind an anonymous session
cookie. `README.md` covers what the app is and what "good" means here; this
file is how the six-phase build actually went.

## How I got here

The starter repo shipped a guestbook demo on top of Astro 7 (SSR, no client
framework), Drizzle + better-sqlite3, and a Vitest harness (`spec/`) that
walks route invariants and a README contract. The build followed
`docs/WEEKWISE_IMPLEMENTATION_PROMPT.md` as the fixed contract, phase by
phase, keeping `pnpm check` green at every commit.

**Phase 1 — dataset and schema**
[`0f447df`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-easton-yi/commit/0f447dfd1e8afbb41180a804f496e4d3497d0c26).
No real ANU Web Publisher export existed in the repo, so per the prompt's own
fallback I built a clearly-labelled *synthetic* dataset
(`data/timetable/anu-2026-s2.sample.json`, `"kind": "synthetic"` in its
manifest) and the import module boundary (`scripts/timetable-import.ts`) a
real export would go through later — it fails clearly rather than guessing a
column mapping. The guestbook's `messages` table was dropped and five new
tables (`sessions`, `plans`, `planCourses`, `planSelections`,
`unavailableBlocks`) were added via a generated Drizzle migration, never
hand-written SQL.

**Phase 2 — the solver**
[`a15a6e3`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-easton-yi/commit/a15a6e33c889fcea303f21eebf64f8c5bb15b4db).
A deterministic backtracking enumerator, metrics (`campusDays`, `gapMinutes`,
`earlyCount`), and three lexicographic rankings — no LLM in the scheduling
path, per the prompt's own constraint. `spec/timetable-solve.test.ts` covers
the hand-checkable rules (T01–T05, T08, T10–T14, T16): overlapping vs.
adjacent meetings, disjoint teaching weeks, every required group covered
exactly once, locked options always present, deterministic ordering on
repeated runs.

While testing this by hand afterwards, I ran into what looked like a bug:
some course combinations produced only one plan card even though the solver
reported 18 valid combinations. I traced it through `rank.ts`'s
`selectRepresentatives` rather than assuming it was broken — it dedups by
option-set signature, and for that course selection the top combination
under all three preferences happened to be identical. Confirmed correct by
finding a different course selection that does produce two genuinely
divergent plans. That distinction — "fewer cards than the max is correct
when there's no real trade-off to show" — is now spelled out in
`README.md`.

**Phase 3 — persistence**
[`12eb9a8`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-easton-yi/commit/12eb9a842663ee4b8a0e70c7a02570a0f037bc4d).
Anonymous session cookies (`src/lib/server/session.ts`), and `plan-service.ts`
re-validating every course/group/option/lock reference against the loaded
dataset before any write, inside one transaction, with optimistic-concurrency
revisions. Verified by hand with curl before any UI existed.

**Phase 4 — the planner UI**
[`d58925e`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-easton-yi/commit/d58925e5ebb328274171b47cd899e4659e168ced).
A shared `Layout.astro`, the week-grid/day-agenda dual rendering, and
`planner.ts` — a plain ES module (no framework, matching the guestbook's own
`<script>` pattern) that sequence-guards every `/api/solve` call so a slow
stale response can never overwrite a newer one.

I hit three moments here where something looked wrong and turned out not to
be, each root-caused by reading the actual code and network traffic rather
than assuming a defect:

- A save appeared to leave a stale status message — `planner.ts` navigates to
  the new plan's own page on a successful create-mode save
  (`window.location.assign`), so what I was seeing was the *next* page's own
  initial status, not a leftover.
- My own Playwright script reported "0 saved plans" after a save — it was
  opening a fresh, cookie-less browser context for the `/plans/` check, i.e.
  a different anonymous session. Fixed the script, not the app.
- The one-card-vs-three-card question from Phase 2, re-confirmed against the
  live UI.

**Phase 5 — persistence/ownership tests and deploy verification**
[`0a35643`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-easton-yi/commit/0a35643882c9ff097b2734cb0167bd5fb842639b).
Added `spec/timetable-persistence.test.ts` (T17, T18, T20, T21) and
`spec/timetable-ownership.test.ts` (T19), both real HTTP requests against the
built server via `spec/global-setup.ts`'s cookie-jar pattern, covering
save/reload round-trips, rejected invalid saves writing nothing, duplicate-id
idempotency, stale-revision rejection, and cross-session isolation.

Then I deployed to Fly and hit a real production bug: the homepage and
`/about-data/` both 500'd (`/plans/` stayed at 200). `flyctl logs` showed
`ENOENT: /app/data/timetable/anu-2026-s2.sample.json` — the Dockerfile's
runtime stage copied `node_modules`, `dist`, and `drizzle` from the build
stage, but never `data/`, so the dataset simply wasn't in the shipped image.
Fixed with one added `COPY --from=build /app/data /app/data` line, redeployed,
and re-checked all three routes returned 200 (same commit,
[`0a35643`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-easton-yi/commit/0a35643882c9ff097b2734cb0167bd5fb842639b)).
This is the one part of the brief that genuinely can't be caught by
`pnpm check` alone — the built server tested locally uses the repo's own
`data/` directory directly, not a Docker image, so a missing `COPY` line is
invisible until it runs somewhere that only has what the image shipped.

With the fix live, I manually verified the persistence contract against the
production URL itself, not just the local test harness: solved a timetable
over HTTPS, saved a plan (`201`), reloaded it via both the JSON API and the
rendered `/plans/<id>/` page (`200`, identical content both times), ran
`flyctl machine restart` against the running machine, and reloaded again —
the plan and all three routes came back unchanged. That's the volume-backed
SQLite persistence the prompt asks for, confirmed on the actual deployed
machine and volume, not inferred from a passing test suite.

Also did the manual browser pass `CLAUDE.md` requires beyond a green check:
a keyboard-only run (Tab/Space/Enter throughout, no pointer) through select
courses → add an unavailable block → lock an option → generate → compare →
save → reload from `/plans/`, at both 1920×1080 and 390×844, confirming no
horizontal overflow at either width; and a `prefers-reduced-motion: reduce`
check confirming the plan-card entrance animation is suppressed
(`animationName: none`) while the card stays fully visible and its state
unchanged — motion is dropped, nothing else is.

## Before you ship

Every commit above kept `pnpm check` green (typecheck, build, and the full
Vitest suite — 60/60 passing as of the last commit) before it landed; nothing
here was committed red.
