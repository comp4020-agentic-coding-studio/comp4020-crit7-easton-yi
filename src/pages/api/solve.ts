import type { APIRoute } from "astro";
import { loadDataset } from "../../lib/server/dataset";
import { BadRequestError, parseSolveRequestBody } from "../../lib/server/solve-request";
import { findHardClashes } from "../../lib/timetable/clash";
import { computeMetrics } from "../../lib/timetable/metrics";
import { selectRepresentatives } from "../../lib/timetable/rank";
import { solve } from "../../lib/timetable/solve";
import type { Combination } from "../../lib/timetable/types";

const NODE_BUDGET = 200_000;

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let input;
  try {
    input = parseSolveRequestBody(body);
  } catch (error) {
    if (error instanceof BadRequestError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }

  const dataset = loadDataset();
  const courses = input.courseIds.map((id) => dataset.courses.find((course) => course.id === id));
  if (courses.some((course) => course === undefined)) {
    return Response.json({ error: "Unknown course id" }, { status: 400 });
  }
  const resolvedCourses = courses.filter((course) => course !== undefined);

  const { complete, combinations } = solve({
    courses: resolvedCourses,
    commitments: input.commitments,
    locks: input.locks,
    nodeBudget: NODE_BUDGET,
  });

  const withMetrics: Combination[] = combinations.map((selections) => ({
    selections,
    metrics: computeMetrics(selections, resolvedCourses, input.earlyThresholdMinute),
  }));

  const representatives = selectRepresentatives(withMetrics, input.preference);

  const hardClashes =
    complete && combinations.length === 0
      ? findHardClashes(resolvedCourses, dataset.manifest.teachingWeeks)
      : undefined;

  return Response.json({
    complete,
    feasibleCount: complete ? combinations.length : undefined,
    foundCount: complete ? undefined : combinations.length,
    representatives,
    hardClashes,
  });
};
