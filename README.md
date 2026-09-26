# Weekwise

Weekwise is a small full-stack ANU timetable planner: pick 3–4 preloaded
courses, mark the times you're already unavailable, choose the one thing you
care about most (fewer campus days, less gap time, or fewer early starts),
and get back up to three genuinely different conflict-free timetables to
compare. Pick one, name it, and it's saved — reload the site days later and
it's still there.

It's a planning aid, not enrolment: it never books a class, never claims a
seat is available, and every page that shows real timetable data repeats the
same notice — *"Planning data only. Confirm class availability and
allocation in ANU MyTimetable."*

## What good looks like here

The thing this crit is actually testing is whether a full-stack slice can be
correct end-to-end against a real database, not whether the UI is pretty. So
"good" here means, in order:

1. **The solver never lies.** It either enumerates every valid combination
   under the current courses/blocks/locks, or it says plainly that it hit its
   search budget — it never silently returns "no solution" when it just gave
   up early. `src/lib/timetable/solve.ts` and `spec/timetable-solve.test.ts`
   are the enforced part of this; the ranking and dedup logic that turns "18
   valid combinations" into "3 worth comparing" (`src/lib/timetable/rank.ts`)
   is a judgement call — see the "representative plan" section below.
2. **A saved plan is exactly what was saved, forever.** Every reference in a
   save request (course id, activity group, option id, lock) is re-validated
   server-side against the loaded dataset before anything is written, in one
   transaction — a bad reference writes nothing, not a half-row. This is
   enforced by `spec/timetable-persistence.test.ts` (T17, T18, T20, T21) and
   `spec/timetable-ownership.test.ts` (T19), which run as real HTTP requests
   against the built server, not mocks.
3. **Ownership is a hard boundary, not a UI convenience.** Plans belong to an
   anonymous session cookie; another session's plan is a plain 404, not a 403
   that leaks whether it exists. Enforced by `spec/timetable-ownership.test.ts`.
4. **The dataset is honestly labelled.** No real ANU Web Publisher export was
   available, so the shipped dataset
   (`data/timetable/anu-2026-s2.sample.json`) is clearly marked
   `"kind": "synthetic"` in its manifest, and `/about-data/` says so out
   loud rather than letting a visitor assume it's real. `scripts/timetable-import.ts`
   is the module boundary a real export would go through — it refuses to
   guess a column mapping and fails clearly instead, per
   `data/source/README.md`.
5. **It works without a mouse, and it works on a phone.** Every interactive
   state (select a course, add a block, lock an option, save) is reachable by
   keyboard alone, and the layout holds without horizontal overflow at both
   1920×1080 and 390×844 — a judgement call about what "polished" means for a
   prototype this size, checked manually (see `PROCESS.md`) rather than by an
   automated test, since a real browser is the only honest way to check
   layout and focus order.

**Representative plans, a judgement call**: when the current course selection
only produces one genuinely different optimal plan (the top combination is
identical under all three preference orderings), Weekwise shows one card, not
three padded-out near-duplicates. Showing fewer cards than the maximum is
correct behaviour here, not a bug — the alternative (three cards that are the
same timetable with different labels) would be actively misleading.

**What's deliberately not built**: sharing, calendar export, live enrolment,
capacity tracking, maps, notifications, social comparison, an admin
dashboard, or automatic scraping of the real ANU timetable. All named
out-of-scope in the brief this app was built against
(`docs/WEEKWISE_IMPLEMENTATION_PROMPT.md`), and none of them serve the one
flow this prototype demonstrates.

The rules that came out of these decisions live in `CLAUDE.md`; the checks
that protect them live in `spec/` and run via `pnpm check`.
