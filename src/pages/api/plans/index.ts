import type { APIRoute } from "astro";
import { PlanConflictError, PlanNotFoundError, PlanValidationError, listPlans, savePlan } from "../../../lib/server/plan-service";
import { BadRequestError, parseSavePlanBody } from "../../../lib/server/plan-request";
import { getOrCreateSession } from "../../../lib/server/session";

export const GET: APIRoute = ({ cookies }) => {
  const sessionId = getOrCreateSession(cookies);
  return Response.json({ plans: listPlans(sessionId) });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const sessionId = getOrCreateSession(cookies);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const input = parseSavePlanBody(body);
    const plan = savePlan({ ...input, sessionId });
    return Response.json({ plan }, { status: 201 });
  } catch (error) {
    if (error instanceof BadRequestError || error instanceof PlanValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof PlanConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof PlanNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }
};
