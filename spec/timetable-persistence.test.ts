import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";
import type { Preference, Representative, Selection } from "../src/lib/timetable/types";

// HTTP-level persistence tests against the BUILT app (spec/global-setup.ts
// boots dist/server/entry.mjs on a throwaway database). These check the
// save/reload/reject/idempotency/optimistic-concurrency contract from
// docs/WEEKWISE_IMPLEMENTATION_PROMPT.md's persistence section (T17, T18,
// T20, T21). spec/timetable-ownership.test.ts covers cross-session isolation
// (T19); spec/timetable-solve.test.ts covers the pure solver/rank/repair
// rules with hand-built fixtures.

const baseUrl = inject("baseUrl");

/** A minimal cookie jar: captures Set-Cookie from responses, resends it on every request. */
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

async function solveFor(session: ReturnType<typeof makeSession>, preference: Preference = "campusDays") {
  const res = await session.postJson("/api/solve", {
    courseIds: COURSE_IDS,
    commitments: [],
    locks: [],
    preference,
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { representatives: Representative[] };
  expect(body.representatives.length).toBeGreaterThan(0);
  return body.representatives[0];
}

describe("timetable persistence: save then reload (T18)", () => {
  it("returns exactly what was saved — same courses, blocks, selections, preference, name", async () => {
    const session = makeSession();
    const representative = await solveFor(session);
    const id = randomUUID();

    const saveRes = await session.postJson("/api/plans", {
      id,
      name: "My semester plan",
      preference: "campusDays",
      courseIds: COURSE_IDS,
      commitments: [],
      selections: representative.selections,
      locks: [],
    });
    expect(saveRes.status).toBe(201);

    const reloadRes = await session.get(`/api/plans/${id}`);
    expect(reloadRes.status).toBe(200);
    const { plan } = (await reloadRes.json()) as { plan: { name: string; preference: string; courseIds: string[]; selections: Selection[]; commitments: unknown[]; revision: number } };

    expect(plan.name).toBe("My semester plan");
    expect(plan.preference).toBe("campusDays");
    expect([...plan.courseIds].sort()).toEqual([...COURSE_IDS].sort());
    expect(plan.commitments).toEqual([]);
    expect(plan.revision).toBe(1);
    expect(
      [...plan.selections].sort((a, b) => a.groupId.localeCompare(b.groupId)),
    ).toEqual([...representative.selections].sort((a, b) => a.groupId.localeCompare(b.groupId)));
  });

  it("round-trips an unavailable block and a lock", async () => {
    const session = makeSession();
    const representative = await solveFor(session);
    const id = randomUUID();
    const lock = representative.selections[0];
    const commitment = { id: randomUUID(), label: "Work shift", weekday: 6, startMinute: 540, endMinute: 600 };

    const saveRes = await session.postJson("/api/plans", {
      id,
      name: "With a block and a lock",
      preference: "gaps",
      courseIds: COURSE_IDS,
      commitments: [commitment],
      selections: representative.selections,
      locks: [lock],
    });
    expect(saveRes.status).toBe(201);

    const reloadRes = await session.get(`/api/plans/${id}`);
    const { plan } = (await reloadRes.json()) as {
      plan: { commitments: (typeof commitment)[]; locks: Selection[] };
    };
    expect(plan.commitments).toEqual([commitment]);
    expect(plan.locks).toEqual([lock]);
  });
});

describe("timetable persistence: invalid/incomplete references are rejected (T17)", () => {
  it("rejects an unknown course id and writes nothing", async () => {
    const session = makeSession();
    const id = randomUUID();

    const res = await session.postJson("/api/plans", {
      id,
      name: "Bad plan",
      preference: "campusDays",
      courseIds: ["not-a-real-course"],
      commitments: [],
      selections: [],
      locks: [],
    });
    expect(res.status).toBe(400);

    const listRes = await session.get("/api/plans");
    const { plans } = (await listRes.json()) as { plans: { id: string }[] };
    expect(plans.some((plan) => plan.id === id)).toBe(false);
  });

  it("rejects selections that don't cover every required activity group and writes nothing", async () => {
    const session = makeSession();
    const representative = await solveFor(session);
    const id = randomUUID();

    const res = await session.postJson("/api/plans", {
      id,
      name: "Incomplete plan",
      preference: "campusDays",
      courseIds: COURSE_IDS,
      commitments: [],
      selections: representative.selections.slice(0, 1),
      locks: [],
    });
    expect(res.status).toBe(400);

    const listRes = await session.get("/api/plans");
    const { plans } = (await listRes.json()) as { plans: { id: string }[] };
    expect(plans.some((plan) => plan.id === id)).toBe(false);
  });

  it("rejects a lock that doesn't match any selection", async () => {
    const session = makeSession();
    const representative = await solveFor(session);
    const id = randomUUID();

    const res = await session.postJson("/api/plans", {
      id,
      name: "Bad lock",
      preference: "campusDays",
      courseIds: COURSE_IDS,
      commitments: [],
      selections: representative.selections,
      locks: [{ groupId: "not-a-real-group", optionId: "not-a-real-option" }],
    });
    expect(res.status).toBe(400);
  });
});

describe("timetable persistence: duplicate create with the same client id (T20)", () => {
  it("does not create a second plan row", async () => {
    const session = makeSession();
    const representative = await solveFor(session);
    const id = randomUUID();

    const first = await session.postJson("/api/plans", {
      id,
      name: "First save",
      preference: "campusDays",
      courseIds: COURSE_IDS,
      commitments: [],
      selections: representative.selections,
      locks: [],
    });
    expect(first.status).toBe(201);

    const second = await session.postJson("/api/plans", {
      id,
      name: "Second save, same id",
      preference: "campusDays",
      courseIds: COURSE_IDS,
      commitments: [],
      selections: representative.selections,
      locks: [],
    });
    expect(second.status).toBe(201);

    const listRes = await session.get("/api/plans");
    const { plans } = (await listRes.json()) as { plans: { id: string }[] };
    expect(plans.filter((plan) => plan.id === id).length).toBe(1);

    const reloadRes = await session.get(`/api/plans/${id}`);
    const { plan } = (await reloadRes.json()) as { plan: { name: string } };
    expect(plan.name).toBe("Second save, same id");
  });
});

describe("timetable persistence: stale revision is rejected without clobbering (T21)", () => {
  it("keeps the current row when an update targets an out-of-date revision", async () => {
    const session = makeSession();
    const representative = await solveFor(session);
    const id = randomUUID();

    const createRes = await session.postJson("/api/plans", {
      id,
      name: "Original name",
      preference: "campusDays",
      courseIds: COURSE_IDS,
      commitments: [],
      selections: representative.selections,
      locks: [],
    });
    expect(createRes.status).toBe(201);
    const { plan: created } = (await createRes.json()) as { plan: { revision: number } };
    expect(created.revision).toBe(1);

    const updateRes = await session.putJson(`/api/plans/${id}`, {
      id,
      name: "Updated name",
      preference: "campusDays",
      courseIds: COURSE_IDS,
      commitments: [],
      selections: representative.selections,
      locks: [],
      expectedRevision: 1,
    });
    expect(updateRes.status).toBe(200);
    const { plan: updated } = (await updateRes.json()) as { plan: { revision: number } };
    expect(updated.revision).toBe(2);

    const staleRes = await session.putJson(`/api/plans/${id}`, {
      id,
      name: "Should not stick",
      preference: "campusDays",
      courseIds: COURSE_IDS,
      commitments: [],
      selections: representative.selections,
      locks: [],
      expectedRevision: 1,
    });
    expect(staleRes.status).toBe(409);

    const finalRes = await session.get(`/api/plans/${id}`);
    const { plan: final } = (await finalRes.json()) as { plan: { name: string; revision: number } };
    expect(final.name).toBe("Updated name");
    expect(final.revision).toBe(2);
  });
});
