import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Dataset, Meeting, Weekday } from "../src/lib/timetable/types";

// Import module boundary: this is where a real ANU Web Publisher export is
// converted into a normalized timetable dataset. It refuses to guess a
// column mapping for a spreadsheet it hasn't seen, and it refuses to guess a
// field mapping for a JSON shape it hasn't seen — see data/source/README.md.
const sourceDir = join(import.meta.dirname, "..", "data", "source");
const outputDir = join(import.meta.dirname, "..", "data", "timetable");
const spreadsheetExtensions = [".xlsx", ".xls", ".csv"];

function findSourceFile(extensions: string[]): string | undefined {
  if (!existsSync(sourceDir)) return undefined;
  return readdirSync(sourceDir).find((name) =>
    extensions.some((ext) => name.toLowerCase().endsWith(ext)),
  );
}

// --- ANU Web Publisher JSON export -----------------------------------------
//
// The Web Publisher's own JSON export is a flat array of activity rows (one
// row per weekly meeting pattern of one section), keyed by fields like
// subject_code, activity_group_code, activity_code, day_of_week, start_time,
// duration and activitiesDays. This does not resemble the app's Dataset
// schema, so it's mapped explicitly below rather than guessed field-by-field
// at load time.

type RawActivity = {
  subject_code: string;
  activity_group_code: string;
  activity_code: string;
  day_of_week: string;
  start_time: string;
  duration: string;
  location: string;
  activity_type: string;
  activitiesDays: string[];
  title_subject_description: string;
  semester_description: string;
};

const WEEKDAY_BY_NAME: Record<string, Weekday> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

// Rows that describe a one-off exam/assessment slot or a Web Publisher
// clone/placeholder row rather than a real weekly section a student chooses
// between. Excluded explicitly (and logged) rather than silently dropped.
const EXCLUDED_ACTIVITY_TYPES = new Set(["Assessment", "Clone"]);

function parseDdMmYyyy(date: string): Date {
  const [day, month, year] = date.split("/").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function mondayOf(date: Date): number {
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - daysSinceMonday,
  );
}

function activityGroupLabel(row: RawActivity): string {
  const code = row.activity_group_code;
  switch (row.activity_type) {
    case "Lecture":
      return code.startsWith("LecB") ? "Lecture B" : code.startsWith("LecA") ? "Lecture A" : "Lecture";
    case "Tutorial":
      return "Tutorial";
    case "Computer Laboratory":
      return "Lab";
    case "Workshop":
      return "Workshop";
    default:
      return code;
  }
}

function importAnuWebPublisherJson(path: string): void {
  const sourceFileName = path.split("/").pop()!;
  const importedOn = new Date().toISOString().slice(0, 10);
  const rows = JSON.parse(readFileSync(path, "utf-8")) as RawActivity[];

  const kept: RawActivity[] = [];
  const excluded: string[] = [];

  for (const row of rows) {
    const label = `${row.subject_code} ${row.activity_group_code}/${row.activity_code}`;
    if (EXCLUDED_ACTIVITY_TYPES.has(row.activity_type)) {
      excluded.push(`${label} (activity_type "${row.activity_type}")`);
      continue;
    }
    if (row.location === "NA") {
      excluded.push(`${label} (location "NA")`);
      continue;
    }
    kept.push(row);
  }

  if (kept.length === 0) {
    console.error(`Every row in ${path} was excluded (${excluded.join(", ")}); nothing to import.`);
    process.exit(1);
  }

  // Number the distinct Monday-anchored weeks that actually have a class,
  // in order, as this dataset's teaching-week axis.
  const mondays = [...new Set(kept.flatMap((row) => row.activitiesDays.map((d) => mondayOf(parseDdMmYyyy(d)))))].sort(
    (a, b) => a - b,
  );
  const weekNumberByMonday = new Map(mondays.map((m, i) => [m, i + 1]));
  const teachingWeeks = mondays.map((_, i) => i + 1);

  type CourseAcc = {
    code: string;
    title: string;
    groups: Map<string, { label: string; options: Map<string, RawActivity[]> }>;
  };
  const courseOrder: string[] = [];
  const courses = new Map<string, CourseAcc>();

  for (const row of kept) {
    const courseId = row.subject_code.split("_")[0].toLowerCase();
    let course = courses.get(courseId);
    if (!course) {
      course = {
        code: row.subject_code.split("_")[0],
        title: row.title_subject_description.replace(/\s*\(Class:[^)]*\)\s*$/, "").replace(/_/g, ": "),
        groups: new Map(),
      };
      courses.set(courseId, course);
      courseOrder.push(courseId);
    }

    let group = course.groups.get(row.activity_group_code);
    if (!group) {
      group = { label: activityGroupLabel(row), options: new Map() };
      course.groups.set(row.activity_group_code, group);
    }

    const optionRows = group.options.get(row.activity_code) ?? [];
    optionRows.push(row);
    group.options.set(row.activity_code, optionRows);
  }

  const dataset: Dataset = {
    manifest: {
      datasetId: "anu-2026-s1",
      version: "2026-s1.1",
      kind: "verified",
      term: rows[0]?.semester_description ?? "First Semester, 2026",
      timezone: "Australia/Sydney",
      teachingWeeks,
      sourceUrl: null,
      reviewedAt: importedOn,
      reviewedBy: "student self-review (ANU Web Publisher export, saved manually)",
      notice: "Planning data only. Confirm class availability and allocation in ANU MyTimetable.",
      notes:
        `Converted by scripts/timetable-import.ts on ${importedOn} from the ANU Web ` +
        `Publisher JSON export data/source/${sourceFileName}. Meeting times and locations ` +
        `are as published; each option's id preserves the export's own ` +
        `activity_group_code/activity_code. ${excluded.length} row(s) excluded as ` +
        `non-bookable sections: ${excluded.join("; ") || "none"}.`,
    },
    courses: courseOrder.map((courseId) => {
      const course = courses.get(courseId)!;
      return {
        id: courseId,
        code: course.code,
        title: course.title,
        activityGroups: [...course.groups.entries()].map(([groupCode, group]) => ({
          id: `${courseId}-${groupCode.toLowerCase()}`,
          label: group.label,
          options: [...group.options.entries()].map(([optionCode, optionRows]) => ({
            id: `${courseId}-${groupCode.toLowerCase()}-${optionCode.toLowerCase()}`,
            label: `${group.label} ${optionCode}`,
            meetings: optionRows.map((row): Meeting => {
              const [hour, minute] = row.start_time.split(":").map(Number);
              const startMinute = hour * 60 + minute;
              const endMinute = startMinute + Number(row.duration);
              const weeks = [
                ...new Set(row.activitiesDays.map((d) => weekNumberByMonday.get(mondayOf(parseDdMmYyyy(d)))!)),
              ].sort((a, b) => a - b);
              const meeting: Meeting = {
                weekday: WEEKDAY_BY_NAME[row.day_of_week],
                startMinute,
                endMinute,
                location: row.location.replace(/_/g, ", "),
                mode: "in-person",
              };
              if (weeks.length !== teachingWeeks.length) meeting.weeks = weeks;
              return meeting;
            }),
          })),
        })),
      };
    }),
  };

  const outputPath = join(outputDir, "anu-2026-s1.json");
  writeFileSync(outputPath, `${JSON.stringify(dataset, null, 2)}\n`);

  console.log(`Wrote ${dataset.courses.length} course(s) to data/timetable/anu-2026-s1.json.`);
  if (excluded.length > 0) {
    console.log(`Excluded ${excluded.length} non-bookable row(s):\n  ${excluded.join("\n  ")}`);
  }
}

const jsonFile = findSourceFile([".json"]);

if (jsonFile) {
  importAnuWebPublisherJson(join(sourceDir, jsonFile));
  process.exit(0);
}

const spreadsheetFile = findSourceFile(spreadsheetExtensions);

if (!spreadsheetFile) {
  console.log(
    "No ANU Web Publisher export found under data/source/. Weekwise is " +
      "running against the synthetic fixture at " +
      "data/timetable/anu-2026-s2.sample.json. See data/source/README.md " +
      "for where to place a real export.",
  );
  process.exit(0);
}

console.error(
  `Found ${spreadsheetFile} under data/source/, but its column layout has not been ` +
    "inspected or mapped yet. This importer refuses to guess a spreadsheet " +
    "schema: inspect the export's worksheets and columns, extend the " +
    "column mapping in scripts/timetable-import.ts to match what you find, " +
    "then re-run pnpm timetable:import. See data/source/README.md.",
);
process.exit(1);
