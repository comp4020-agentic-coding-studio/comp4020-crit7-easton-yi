# Crit 7 — "Build the ANU system you wish existed"

Source: [course website, C7 · Week 8](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/07-anu-system/)

> Status: the source page is marked **Draft** — the provocation may still
> change before the crit. Whatever version is published the week before the
> crit is the one that counts. Re-check the page before relying on this file.

## 1. What this crit is

- The **first full-stack crit** — "the week the database gets real."
- Timing: **Week 8**, demoed at your scheduled crit session.
- Marks the start of the course's full-stack half: prototypes move from
  static/GitHub Pages deployment to having a server and a database, deployed
  to Fly.io.

## 2. The brief (open-ended provocation)

Pick a real ANU system you actually deal with and are frustrated by —
enrolment, timetabling, room booking, course selection, etc. — and build a
full-stack replacement for it.

- **Don't** rebuild the whole system.
- **Do** model just the slice that's frustrating, connect it end-to-end, and
  deploy it.

The brief is open-ended; the spec below (§4) is the fixed contract markers
judge against.

## 3. Conceptual framing

University systems are "all data and state" — courses, sessions, bookings,
people, and the relationships between them — which is why this week's
technical material is:

- Schemas as ground truth
- SQLite
- Migrations

## 4. The spec (fixed contract for grading)

Distinguish the **brief** (open-ended, above) from the **spec** (fixed,
below). Some items are mechanically checkable; others require human
judgment at the crit.

1. The app must be **live at its `*.fly.dev` URL** by the cutoff.
2. It must **model a slice of a real ANU system** the student actually deals
   with, wired end to end.
3. The **core flow must persist across a reload** (e.g. creating something
   and having it still exist afterward).
4. The repo must **show process**:
   - Commits that grew incrementally with the work.
   - A `PROCESS.md` overview.
   - A reflection in `reflections/crit-7.md`.
5. Students must be able to **explain how they directed, grounded, and
   corrected** the AI-assisted work.

No numeric deadline, rubric, or point weighting is published beyond "by the
cutoff" and the qualitative bullets above.

## 5. Suggested stack

- Default / what the "crit 7 starter" ships with: **Astro + a backend,
  Drizzle, SQLite**. The spec-checking harness and tutor support are built
  around this stack.
- Alternative frameworks (Phoenix, Rails, Django, Go, etc.) are permitted —
  "going off piste" — but that route carries extra responsibility for the
  student, since **the spec checks the running app, not how you built it**.

## 6. Preliminary step: update the `comp4020` plugin

Versions before **0.14.21** have a bug: they misread your Fly.io app's name
if your GitHub username has capitals in it, causing `/comp4020:doctor` to
misreport a valid token as belonging to the wrong repo.

```
claude plugin marketplace update comp4020
claude plugin update comp4020@comp4020
```

- Restart Claude Code afterward for the update to take effect.
- Setup instructions: Topics → LLM Access → Step 5: Install the course
  skills plugin.

## 7. Related resources (linked from the crit page)

- The studio crit model
- Assessment (overview page)
- Software and platforms
- Assignment 2 retro (C6)
- Week 7 lecture: "Full stack"

## 8. This repo's own check harness (from `spec/README.md`)

In addition to the published spec above, this repo's `pnpm check` runs:

- **Invariants** (`invariants.test.ts`, shipped, always on) — nav landmark,
  one top-level heading, doc language, real title, mobile viewport, alt
  text, plus an axe-core accessibility floor. Run against the built,
  running server (`dist/server/entry.mjs`) over the routes listed in
  `routes.ts`.
- **README contract** (`readme.test.ts`, shipped, always on) — `/readme/`
  must serve the full text of `README.md`.
- **Starter plumbing** (`guestbook.test.ts`, retires with the starter) —
  proves the supplied guestbook plumbing works (message survives reload,
  new messages reach other clients over SSE). Red on a fresh clone means the
  platform is broken, not your work.
- **Your spec tests** (`spec/*.test.ts`, yours to write) — turn the
  mechanically-checkable spec lines above into tests alongside the shipped
  ones. Test contracts (what the page must do), not implementation. No
  minimum count; leave human-judgment items to the crit.
