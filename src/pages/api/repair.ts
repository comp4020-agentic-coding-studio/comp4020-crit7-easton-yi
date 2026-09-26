import type { APIRoute } from "astro";
import { loadDataset } from "../../lib/server/dataset";
import { BadRequestError, parseRepairRequestBody } from "../../lib/server/solve-request";
import { findRelaxations } from "../../lib/timetable/repair";

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
    input = parseRepairRequestBody(body);
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

  const result = findRelaxations({
    courses: resolvedCourses,
    commitments: input.commitments,
    locks: input.locks,
    nodeBudget: NODE_BUDGET,
  });

  return Response.json(result);
};
