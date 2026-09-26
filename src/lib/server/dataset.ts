import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateDataset } from "../timetable/validate";
import type { Course, Dataset } from "../timetable/types";

const datasetPath = fileURLToPath(
  new URL("../../../data/timetable/anu-2026-s1.json", import.meta.url),
);

let cached: Dataset | undefined;

/** Loads, validates, and caches the timetable dataset. Throws if it's malformed. */
export function loadDataset(): Dataset {
  if (cached) return cached;

  const raw = readFileSync(datasetPath, "utf-8");
  const parsed = JSON.parse(raw) as Dataset;
  validateDataset(parsed);

  cached = parsed;
  return cached;
}

export function getCourse(courseId: string): Course | undefined {
  return loadDataset().courses.find((course) => course.id === courseId);
}

export function getCourses(courseIds: string[]): Course[] {
  const dataset = loadDataset();
  const found = courseIds
    .map((id) => dataset.courses.find((course) => course.id === id))
    .filter((course): course is Course => course !== undefined);
  return found;
}
