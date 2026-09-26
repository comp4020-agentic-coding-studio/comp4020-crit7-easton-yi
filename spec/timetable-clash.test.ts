import { describe, expect, inject, it } from "vitest";
import { findHardClashes } from "../src/lib/timetable/clash";
import type { Course, HardClash, Meeting, Representative } from "../src/lib/timetable/types";

// Contract tests for the conflict-aware empty state: when courses carry
// unavoidable clashes between fixed (single-option) activities, /api/solve
// must surface exact clash detail instead of silently returning zero
// combinations, and removing either conflicting course must restore the
// normal ranked-plans flow. spec/timetable-solve.test.ts covers the solver
// itself; this file covers clash detection (pure) and the end-to-end
// behaviour against the real verified ANU S1 2026 dataset.

function meeting(partial: Partial<Meeting> & Pick<Meeting, "weekday" | "startMinute" | "endMinute">): Meeting {
  return { mode: "in-person", ...partial };
}

function fixedCourse(id: string, code: string, groupId: string, groupLabel: string, meetings: Meeting[]): Course {
  return {
    id,
    code,
    title: code,
    activityGroups: [
      {
        id: groupId,
        label: groupLabel,
        options: [{ id: `${groupId}-01`, label: `${groupLabel} 01`, meetings }],
      },
    ],
  };
}

describe("findHardClashes: pure detection", () => {
  it("reports no clash between fixed activities that don't overlap", () => {
    const a = fixedCourse("a", "AAA1000", "a-lec", "Lecture", [meeting({ weekday: 1, startMinute: 480, endMinute: 540 })]);
    const b = fixedCourse("b", "BBB1000", "b-lec", "Lecture", [meeting({ weekday: 2, startMinute: 480, endMinute: 540 })]);
    expect(findHardClashes([a, b], [1, 2, 3])).toHaveLength(0);
  });

  it("ignores a clash where at least one side has an alternative option (not fixed)", () => {
    const a = fixedCourse("a", "AAA1000", "a-lec", "Lecture", [meeting({ weekday: 1, startMinute: 480, endMinute: 540 })]);
    const b: Course = {
      id: "b",
      code: "BBB1000",
      title: "BBB1000",
      activityGroups: [
        {
          id: "b-tut",
          label: "Tutorial",
          options: [
            { id: "b-tut-01", label: "Tutorial 01", meetings: [meeting({ weekday: 1, startMinute: 480, endMinute: 540 })] },
            { id: "b-tut-02", label: "Tutorial 02", meetings: [meeting({ weekday: 3, startMinute: 480, endMinute: 540 })] },
          ],
        },
      ],
    };
    expect(findHardClashes([a, b], [1, 2, 3])).toHaveLength(0);
  });

  it("reports exact conflict detail for two fixed activities that overlap", () => {
    const a = fixedCourse("a", "AAA1000", "a-lec", "Lecture A", [
      meeting({ weekday: 1, startMinute: 480, endMinute: 600, weeks: [1, 2, 4] }),
    ]);
    const b = fixedCourse("b", "BBB1000", "b-lec", "Lecture A", [
      meeting({ weekday: 1, startMinute: 480, endMinute: 540, weeks: [1, 2, 3] }),
    ]);

    const clashes = findHardClashes([a, b], [1, 2, 3, 4]);
    expect(clashes).toHaveLength(1);
    const [clash] = clashes as [HardClash];
    expect(clash.a).toMatchObject({
      courseId: "a",
      courseCode: "AAA1000",
      groupId: "a-lec",
      groupLabel: "Lecture A",
      optionId: "a-lec-01",
      weekday: 1,
      startMinute: 480,
      endMinute: 600,
    });
    expect(clash.b).toMatchObject({
      courseId: "b",
      courseCode: "BBB1000",
      groupId: "b-lec",
      optionId: "b-lec-01",
      weekday: 1,
      startMinute: 480,
      endMinute: 540,
    });
    expect(clash.overlappingWeeks).toEqual([1, 2]);
  });

  it("treats an undefined weeks field as meeting every teaching week", () => {
    const a = fixedCourse("a", "AAA1000", "a-lec", "Lecture", [meeting({ weekday: 2, startMinute: 840, endMinute: 960 })]);
    const b = fixedCourse("b", "BBB1000", "b-lec", "Lecture", [meeting({ weekday: 2, startMinute: 900, endMinute: 960 })]);

    const clashes = findHardClashes([a, b], [1, 2, 3]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]?.overlappingWeeks).toEqual([1, 2, 3]);
  });
});

const baseUrl = inject("baseUrl");

type SolveResponse = { complete: boolean; representatives: Representative[]; hardClashes?: HardClash[] };

async function solve(courseIds: string[]): Promise<SolveResponse> {
  const res = await fetch(new URL("/api/solve", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courseIds, commitments: [], locks: [], preference: "campusDays" }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as SolveResponse;
}

describe("timetable clash: real dataset unavoidable clashes", () => {
  it("reports the four-course unavoidable-clash state with no ranked plans", async () => {
    const result = await solve(["comp3242", "comp4450", "comp4680", "comp4712"]);

    expect(result.complete).toBe(true);
    expect(result.representatives).toHaveLength(0);
    expect(result.hardClashes).toBeDefined();
    expect(result.hardClashes!.length).toBeGreaterThanOrEqual(2);
  });

  it("gives exact conflict details for the COMP4450/COMP3242 Monday clash", async () => {
    const result = await solve(["comp3242", "comp4450", "comp4680", "comp4712"]);
    const monday = result.hardClashes!.find(
      (clash) =>
        (clash.a.courseCode === "COMP4450" && clash.b.courseCode === "COMP3242") ||
        (clash.a.courseCode === "COMP3242" && clash.b.courseCode === "COMP4450"),
    );
    expect(monday).toBeDefined();
    const comp4450Side = monday!.a.courseCode === "COMP4450" ? monday!.a : monday!.b;
    const comp3242Side = monday!.a.courseCode === "COMP3242" ? monday!.a : monday!.b;

    expect(comp4450Side).toMatchObject({
      courseCode: "COMP4450",
      optionId: "comp4450-leca-01",
      weekday: 1,
      startMinute: 480,
      endMinute: 600,
    });
    expect(comp3242Side).toMatchObject({
      courseCode: "COMP3242",
      optionId: "comp3242-leca-01",
      weekday: 1,
      startMinute: 480,
      endMinute: 540,
    });
    expect(monday!.overlappingWeeks).toEqual([1, 2, 4, 5, 6, 7, 9, 10, 11, 12]);
  });

  it("gives exact conflict details for the COMP3242/COMP4680 Tuesday clash", async () => {
    const result = await solve(["comp3242", "comp4450", "comp4680", "comp4712"]);
    const tuesday = result.hardClashes!.find(
      (clash) =>
        (clash.a.courseCode === "COMP3242" && clash.b.courseCode === "COMP4680") ||
        (clash.a.courseCode === "COMP4680" && clash.b.courseCode === "COMP3242"),
    );
    expect(tuesday).toBeDefined();
    const comp3242Side = tuesday!.a.courseCode === "COMP3242" ? tuesday!.a : tuesday!.b;
    const comp4680Side = tuesday!.a.courseCode === "COMP4680" ? tuesday!.a : tuesday!.b;

    expect(comp3242Side).toMatchObject({ optionId: "comp3242-lecb-01", weekday: 2, startMinute: 900, endMinute: 960 });
    expect(comp4680Side).toMatchObject({ optionId: "comp4680-leca-01", weekday: 2, startMinute: 840, endMinute: 960 });
    expect(tuesday!.overlappingWeeks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("removing either conflicting course restores a clash and regenerates normal ranked plans", async () => {
    const pairResult = await solve(["comp3242", "comp4450"]);
    expect(pairResult.complete).toBe(true);
    expect(pairResult.representatives).toHaveLength(0);
    expect(pairResult.hardClashes).toHaveLength(1);

    const withoutComp3242 = await solve(["comp4450"]);
    expect(withoutComp3242.complete).toBe(true);
    expect(withoutComp3242.representatives.length).toBeGreaterThan(0);
    expect(withoutComp3242.hardClashes ?? []).toHaveLength(0);
    for (const rep of withoutComp3242.representatives) expect(rep.metrics).toBeDefined();

    const withoutComp4450 = await solve(["comp3242"]);
    expect(withoutComp4450.complete).toBe(true);
    expect(withoutComp4450.representatives.length).toBeGreaterThan(0);
    expect(withoutComp4450.hardClashes ?? []).toHaveLength(0);
    for (const rep of withoutComp4450.representatives) expect(rep.metrics).toBeDefined();
  });

  it("the chosen default three-course subset (COMP4450/COMP4680/COMP4712) is feasible", async () => {
    const result = await solve(["comp4450", "comp4680", "comp4712"]);
    expect(result.complete).toBe(true);
    expect(result.representatives.length).toBeGreaterThan(0);
    expect(result.hardClashes ?? []).toHaveLength(0);
  });
});
