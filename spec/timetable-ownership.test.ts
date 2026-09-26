import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";
import type { Representative } from "../src/lib/timetable/types";

// Cross-session ownership isolation (T19), over real HTTP against the built
// app: two separate anonymous sessions (two cookie jars) must not be able to
// see or modify each other's saved plans. spec/timetable-persistence.test.ts
// covers the single-session save/reload/reject/concurrency contract.

const baseUrl = inject("baseUrl");

function makeSession() {
  let cookie: string | undefined;

  async function request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (cookie) headers.set("cookie", cookie);
    const res = await fetch(new URL(path, baseUrl), { ...init, headers });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return res;
  }

  return {
    async get(path: string) {
      return request(path);
    },
    async postJson(path: string, body: unknown) {
      return request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    async putJson(path: string, body: unknown) {
      return request(path, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    async deleteJson(path: string, body: unknown) {
      return request(path, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    },
  };
}

const COURSE_IDS = ["comp4680", "comp4712", "comp4450"];

describe("timetable ownership: session B cannot see or touch session A's plan (T19)", () => {
  it("hides another session's plan behind a plain 404, and refuses to update or delete it", async () => {
    const sessionA = makeSession();
    const sessionB = makeSession();

    const solveRes = await sessionA.postJson("/api/solve", {
      courseIds: COURSE_IDS,
      commitments: [],
      locks: [],
      preference: "campusDays",
    });
    const { representatives } = (await solveRes.json()) as { representatives: Representative[] };
    const representative = representatives[0];

    const id = randomUUID();
    const createRes = await sessionA.postJson("/api/plans", {
      id,
      name: "Session A's plan",
      preference: "campusDays",
      courseIds: COURSE_IDS,
      commitments: [],
      selections: representative.selections,
      locks: [],
    });
    expect(createRes.status).toBe(201);
    const { plan: created } = (await createRes.json()) as { plan: { revision: number } };

    // Establish session B's own cookie before probing (a session is only created on its first request).
    await sessionB.get("/");

    const getAsB = await sessionB.get(`/api/plans/${id}`);
    expect(getAsB.status).toBe(404);

    const putAsB = await sessionB.putJson(`/api/plans/${id}`, {
      id,
      name: "Hijacked",
      preference: "campusDays",
      courseIds: COURSE_IDS,
      commitments: [],
      selections: representative.selections,
      locks: [],
      expectedRevision: created.revision,
    });
    expect(putAsB.status).toBe(404);

    const deleteAsB = await sessionB.deleteJson(`/api/plans/${id}`, { expectedRevision: created.revision });
    expect(deleteAsB.status).toBe(404);

    // Session B's own plan list stays empty — it never sees A's plan.
    const listAsB = await sessionB.get("/api/plans");
    const { plans: plansForB } = (await listAsB.json()) as { plans: { id: string }[] };
    expect(plansForB.some((plan) => plan.id === id)).toBe(false);

    // Session A's plan is untouched by B's attempts.
    const getAsA = await sessionA.get(`/api/plans/${id}`);
    expect(getAsA.status).toBe(200);
    const { plan: intact } = (await getAsA.json()) as { plan: { name: string; revision: number } };
    expect(intact.name).toBe("Session A's plan");
    expect(intact.revision).toBe(created.revision);
  });

  it("does not let session B create a plan with the same id as session A's", async () => {
    const sessionA = makeSession();
    const sessionB = makeSession();

    const solveRes = await sessionA.postJson("/api/solve", {
      courseIds: COURSE_IDS,
      commitments: [],
      locks: [],
      preference: "campusDays",
    });
    const { representatives } = (await solveRes.json()) as { representatives: Representative[] };
    const representative = representatives[0];
    const id = randomUUID();

    const createAsA = await sessionA.postJson("/api/plans", {
      id,
      name: "A's plan",
      preference: "campusDays",
      courseIds: COURSE_IDS,
      commitments: [],
      selections: representative.selections,
      locks: [],
    });
    expect(createAsA.status).toBe(201);

    // B tries to "create" (no expectedRevision) against the same id — the row already
    // belongs to A, so this must be refused rather than silently taking it over.
    const createAsB = await sessionB.postJson("/api/plans", {
      id,
      name: "B trying to steal the id",
      preference: "campusDays",
      courseIds: COURSE_IDS,
      commitments: [],
      selections: representative.selections,
      locks: [],
    });
    expect(createAsB.status).toBe(404);

    const getAsA = await sessionA.get(`/api/plans/${id}`);
    const { plan } = (await getAsA.json()) as { plan: { name: string } };
    expect(plan.name).toBe("A's plan");
  });
});
