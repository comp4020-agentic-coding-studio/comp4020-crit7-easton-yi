# Real ANU Web Publisher export goes here

`pnpm timetable:import` looks in this directory for an official ANU Web
Publisher export and picks it up in one of two shapes:

- **Spreadsheet** (`.xlsx`, `.xls` or `.csv`) — e.g. `anu-2026-s2.xlsx`. The
  importer **refuses to run** until the exact column layout of that export
  has been inspected and mapped in `scripts/timetable-import.ts` — it does
  not guess a spreadsheet schema it hasn't seen.
- **JSON** (`.json`) — the Web Publisher's own flat activity-array export,
  e.g. `anu-2026-s1.raw.json`. `scripts/timetable-import.ts` maps this shape
  directly: each row becomes one meeting of one activity-group option,
  weekday/time/duration are converted to `weekday`/`startMinute`/
  `endMinute`, and `activitiesDays` is reduced to a `teachingWeeks` axis
  numbered from the distinct Monday-anchored weeks that actually have a
  class. Rows typed `Assessment` or `Clone`, or with `location: "NA"`, are
  excluded as non-bookable artifacts of the export rather than real
  sections — the exclusions are logged to the console and recorded in the
  generated dataset's `manifest.notes`, never silently dropped.

This directory currently holds `anu-2026-s1.raw.json`, the raw export behind
`data/timetable/anu-2026-s1.json` (`manifest.kind: "verified"`), which is
what Weekwise now runs against. `data/timetable/anu-2026-s2.sample.json`
(`manifest.kind: "synthetic"`) is kept as the earlier hand-authored fixture.

## Re-running the import

1. Export your own enrolled courses from the [ANU Web
   Publisher](https://mytimetable.anu.edu.au/even/timetable/) for the target
   term and place the file here.
2. Run `pnpm timetable:import`.
3. For a spreadsheet export, inspect the export's worksheets/columns/
   representative rows, extend the importer's column mapping to match, then
   re-run. For a JSON export, check the console output for excluded rows and
   confirm none of them were actually real bookable sections before trusting
   the result.
4. The importer must preserve each activity's source identifier and the
   source filename/date in the generated dataset's manifest, and must fail
   clearly (not silently drop rows) when a required column or an
   activity-group relationship can't be interpreted.
5. A successfully imported dataset is written to
   `data/timetable/<term>.json` with `manifest.kind: "verified"`, separate
   from the synthetic sample so the two are never confused.
