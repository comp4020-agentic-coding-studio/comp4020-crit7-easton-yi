# Your harness

Nothing about the starter is recorded here. What the repo ships is explained
where it lives — `fly.toml`, the `Dockerfile`, the CI workflow and
`spec/README.md` each say what they fix — and the
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec. Read them before you plan or build;
what the agent needs to carry from any of it is your call.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Run `pnpm check` before you push.
- Open the page in a browser and look at it. The rendered page is the truth;
  your mental model of it isn't.
- When a check fails, read its output before you change anything.
- Never commit a red state.

## This file is yours

A starting point, not a rulebook. As you learn what this build needs — a
convention the work has to hold to, a sensor that keeps catching you out (a
linter, say), a fact about the stack that is easy to get wrong — write it
down here and wire it into `check`. Growing this file is the work.

## Carried forward from prior prototypes

These are general working conventions that held up across earlier weeks
(carried forward from `comp4020-ass2-Easton-Yi`, which itself carried them
from `comp4020-crit5-Easton-Yi` and `comp4020-crit4-Easton-Yi`), not specific
to any one prototype's content:

- **Direct orders.** A prompt phrased as a direct, short imperative
  ("change X to Y") should be executed exactly as stated, without further
  unrequested changes or redesign.
- **A claim of success needs more than a green check.** `pnpm check` passing
  is necessary but not sufficient — for anything the visitor experiences
  (visual, audio, interaction), back the claim with direct inspection: open
  it in a browser (or Playwright's Chromium, `npx playwright install
  chromium`, when a live browser tool isn't reachable) and actually look at
  or listen to it before saying it works. A value that looks plausible on
  paper (a stroke-width in the wrong units, a gain node at the wrong scale)
  can silently produce nothing while every automated check still passes.
- **Both marking viewports, every time.** Any visual/behavioural check is
  done at both **1920×1080** (desktop) and **390×844** (phone) — a broken
  phone layout is not a partial pass. Watch for horizontal overflow at
  either (`document.documentElement.scrollWidth <= clientWidth`).
- **Keyboard reachability.** Every interactive state should be reachable
  without a mouse (tab order, keyboard equivalents for pointer gestures),
  and `prefers-reduced-motion: reduce` should drop non-essential motion
  without removing any discrete state or content.
