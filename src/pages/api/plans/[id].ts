import type { APIRoute } from "astro";
import { BadRequestError, parseSavePlanBody } from "../../../lib/server/plan-request";
import {
  PlanConflictError,
  PlanNotFoundError,
  PlanValidationError,
  deletePlan,
  getPlan,
  savePlan,
} from "../../../lib/server/plan-service";
import { getOrCreateSession } from "../../../lib/server/session";

export const GET: APIRoute = ({ params, cookies }) => {
  const sessionId = getOrCreateSession(cookies);
  const id = params.id;
  if (!id) return Response.json({ error: "Missing plan id" }, { status: 400 });

  const plan = getPlan(id, sessionId);
  if (!plan) return Response.json({ error: "Plan not found" }, { status: 404 });
  return Response.json({ plan });
};

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const sessionId = getOrCreateSession(cookies);
  const id = params.id;
  if (!id) return Response.json({ error: "Missing plan id" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const input = parseSavePlanBody(body);
    if (input.id !== id) {
      return Response.json({ error: "Body id does not match URL" }, { status: 400 });
    }
    const plan = savePlan({ ...input, sessionId });
    return Response.json({ plan });
  } catch (error) {
    if (error instanceof BadRequestError || error instanceof PlanValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof PlanConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof PlanNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }
};

export const DELETE: APIRoute = async ({ params, request, cookies }) => {
  const sessionId = getOrCreateSession(cookies);
  const id = params.id;
  if (!id) return Response.json({ error: "Missing plan id" }, { status: 400 });

  let expectedRevision: number;
  try {
    const body = (await request.json()) as { expectedRevision?: unknown };
    if (typeof body.expectedRevision !== "number") throw new Error("not a number");
    expectedRevision = body.expectedRevision;
  } catch {
    return Response.json({ error: "Body must include a numeric expectedRevision" }, { status: 400 });
  }

  try {
    deletePlan(id, sessionId, expectedRevision);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof PlanConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof PlanNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }
};
