import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Import module boundary: this is where a real ANU Web Publisher export
// would be converted into a normalized timetable dataset. No export has been
// seen yet, so this script does not invent a spreadsheet column schema — see
// data/source/README.md for what happens once one is placed there.
const sourceDir = join(import.meta.dirname, "..", "data", "source");
const supportedExtensions = [".xlsx", ".xls", ".csv"];

function findSourceFile(): string | undefined {
  if (!existsSync(sourceDir)) return undefined;
  return readdirSync(sourceDir).find((name) =>
    supportedExtensions.some((ext) => name.toLowerCase().endsWith(ext)),
  );
}

const found = findSourceFile();

if (!found) {
  console.log(
    "No ANU Web Publisher export found under data/source/. Weekwise is " +
      "running against the synthetic fixture at " +
      "data/timetable/anu-2026-s2.sample.json. See data/source/README.md " +
      "for where to place a real export.",
  );
  process.exit(0);
}

console.error(
  `Found ${found} under data/source/, but its column layout has not been ` +
    "inspected or mapped yet. This importer refuses to guess a spreadsheet " +
    "schema: inspect the export's worksheets and columns, extend the " +
    "column mapping in scripts/timetable-import.ts to match what you find, " +
    "then re-run pnpm timetable:import. See data/source/README.md.",
);
process.exit(1);
