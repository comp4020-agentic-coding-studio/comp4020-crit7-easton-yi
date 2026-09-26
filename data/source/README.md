# Real ANU Web Publisher export goes here

`pnpm timetable:import` looks in this directory for an official ANU Web
Publisher export (`.xlsx`, `.xls` or `.csv`) — for example
`data/source/anu-2026-s2.xlsx`.

This directory is currently empty: no real export has been placed here yet, so
Weekwise runs against the hand-authored synthetic fixture at
`data/timetable/anu-2026-s2.sample.json` (see its `manifest.kind: "synthetic"`
and `manifest.notes`).

## Once a real export is available

1. Export your own enrolled courses from the [ANU Web
   Publisher](https://mytimetable.anu.edu.au/even/timetable/) for the target
   term and place the file here.
2. Run `pnpm timetable:import`.
3. The importer will **refuse to run** until the exact column layout of that
   export has been inspected and mapped in `scripts/timetable-import.ts` — it
   does not guess a spreadsheet schema it hasn't seen. Inspect the export's
   worksheets/columns/representative rows, extend the importer's column
   mapping to match, then re-run.
4. The importer must preserve each activity's source identifier and the
   source filename/date in the generated dataset's manifest, and must fail
   clearly (not silently drop rows) when a required column or an
   activity-group relationship can't be interpreted.
5. A successfully imported dataset is written to
   `data/timetable/<term>.json` with `manifest.kind: "verified"`, separate
   from this synthetic sample so the two are never confused.
