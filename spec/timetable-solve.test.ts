import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/lib/timetable/metrics";
import { rankCombinations, signature } from "../src/lib/timetable/rank";
import { findRelaxations } from "../src/lib/timetable/repair";
import { solve } from "../src/lib/timetable/solve";
import type { Combination, Commitment, Course, Meeting, Weekday } from "../src/lib/timetable/types";

// Pure unit tests against the solver/metrics/rank/repair modules — no
// server, no HTTP, no dataset file. These hand-built fixtures isolate one
// rule at a time; spec/timetable-persistence.test.ts covers the
// end-to-end/HTTP path against the real dataset.

function meeting(partial: Partial<Meeting> & Pick<Meeting, "weekday" | "startMinute" | "endMinute">): Meeting {
  return { mode: "in-person", ...partial };
}

describe("solve: half-open interval conflicts", () => {
  const fixed: Course = {
    id: "fixed",
    code: "FIX1000",
    title: "Fixed",
    activityGroups: [
      {
        id: "fixed-lecture",
        label: "Lecture",
        options: [
          {
            id: "fixed-lecture-only",
            label: "Only",
            meetings: [meeting({ weekday: 1, startMinute: 600, endMinute: 660 })],
          },
        ],
      },
    ],
  };

  function electiveCourse(secondOptionStart: number, secondOptionEnd: number): Course {
    return {
      id: "elective",
      code: "ELE1000",
      title: "Elective",
      activityGroups: [
        {
          id: "elective-tutorial",
          label: "Tutorial",
          options: [
            {
              id: "elective-adjacent",
              label: "Adjacent",
              meetings: [meeting({ weekday: 1, startMinute: 660, endMinute: 720 })],
            },
            {
              id: "elective-overlapping",
              label: "Overlapping",
              meetings: [meeting({ weekday: 1, startMinute: secondOptionStart, endMinute: secondOptionEnd })],
            },
          ],
        },
      ],
    };
  }

  it("treats back-to-back meetings (10-11, 11-12) as non-conflicting", () => {
    const result = solve({
      courses: [fixed, electiveCourse(660, 720)],
      commitments: [],
      locks: [],
    });

    expect(result.complete).toBe(true);
    const optionIds = result.combinations.map((c) => c.find((s) => s.groupId === "elective-tutorial")?.optionId);
    expect(optionIds).toContain("elective-adjacent");
    expect(optionIds).toContain("elective-overlapping");
  });

  it("excludes an option whose meeting overlaps a fixed meeting by even one minute", () => {
    const result = solve({
      // Overlapping option now runs 10:30-11:30, overlapping fixed 10:00-11:00.
      courses: [fixed, electiveCourse(630, 690)],
      commitments: [],
      locks: [],
    });

    expect(result.complete).toBe(true);
    const optionIds = result.combinations.map((c) => c.find((s) => s.groupId === "elective-tutorial")?.optionId);
    expect(optionIds).toContain("elective-adjacent");
    expect(optionIds).not.toContain("elective-overlapping");
  });
});

describe("solve: teaching weeks", () => {
  const base: Course = {
    id: "base",
    code: "BASE1000",
    title: "Base",
    activityGroups: [
      {
        id: "base-lecture",
        label: "Lecture",
        options: [
          {
            id: "base-lecture-only",
            label: "Only",
            meetings: [meeting({ weekday: 1, startMinute: 600, endMinute: 660, weeks: [1, 2] })],
          },
        ],
      },
    ],
  };

  function overlapCourse(weeks: number[]): Course {
    return {
      id: "overlap",
      code: "OVR1000",
      title: "Overlap",
      activityGroups: [
        {
          id: "overlap-tutorial",
          label: "Tutorial",
          options: [
            {
              id: "overlap-only",
              label: "Only",
              meetings: [meeting({ weekday: 1, startMinute: 600, endMinute: 660, weeks })],
            },
          ],
        },
      ],
    };
  }

  it("does not conflict when teaching weeks are disjoint, same day/time", () => {
    const result = solve({ courses: [base, overlapCourse([3, 4])], commitments: [], locks: [] });
    expect(result.combinations).toHaveLength(1);
  });

  it("conflicts when teaching weeks overlap, same day/time", () => {
    const result = solve({ courses: [base, overlapCourse([2, 3])], commitments: [], locks: [] });
    expect(result.combinations).toHaveLength(0);
    expect(result.complete).toBe(true);
  });
});

describe("solve: structural rules", () => {
  function course(id: string, weekday: Weekday): Course {
    return {
      id,
      code: id.toUpperCase(),
      title: id,
      activityGroups: [
        {
          id: `${id}-group`,
          label: "Group",
          options: [
            {
              id: `${id}-only`,
              label: "Only",
              meetings: [meeting({ weekday, startMinute: 540, endMinute: 600 })],
            },
          ],
        },
      ],
    };
  }

  it("every combination contains exactly one selection per required group", () => {
    const courses = [course("c1", 1), course("c2", 2), course("c3", 3)];
    const result = solve({ courses, commitments: [], locks: [] });

    expect(result.combinations).toHaveLength(1);
    const combo = result.combinations[0] ?? [];
    expect(combo).toHaveLength(3);
    expect(new Set(combo.map((s) => s.groupId)).size).toBe(3);
  });

  it("rejects a multi-meeting option when only one of its meetings conflicts", () => {
    const fixed: Course = {
      id: "fixed",
      code: "FIX1000",
      title: "Fixed",
      activityGroups: [
        {
          id: "fixed-lecture",
          label: "Lecture",
          options: [
            {
              id: "fixed-only",
              label: "Only",
              meetings: [meeting({ weekday: 2, startMinute: 900, endMinute: 960 })],
            },
          ],
        },
      ],
    };
    const lab: Course = {
      id: "lab",
      code: "LAB1000",
      title: "Lab",
      activityGroups: [
        {
          id: "lab-group",
          label: "Lab",
          options: [
            {
              id: "lab-two-meetings",
              label: "Two meetings",
              meetings: [
                // First meeting is conflict-free; second overlaps `fixed`'s Tue 15:00-16:00.
                meeting({ weekday: 1, startMinute: 900, endMinute: 1020 }),
                meeting({ weekday: 2, startMinute: 900, endMinute: 1020 }),
              ],
            },
            {
              id: "lab-clean",
              label: "Clean",
              meetings: [
                meeting({ weekday: 1, startMinute: 900, endMinute: 1020 }),
                meeting({ weekday: 3, startMinute: 900, endMinute: 1020 }),
              ],
            },
          ],
        },
      ],
    };

    const result = solve({ courses: [fixed, lab], commitments: [], locks: [] });
    const optionIds = result.combinations.map((c) => c.find((s) => s.groupId === "lab-group")?.optionId);
    expect(optionIds).not.toContain("lab-two-meetings");
    expect(optionIds).toContain("lab-clean");
  });

  it("keeps the locked option in every returned combination", () => {
    const courses = [course("c1", 1)];
    // Give the single group a second option so the lock is meaningful.
    courses[0]?.activityGroups[0]?.options.push({
      id: "c1-second",
      label: "Second",
      meetings: [meeting({ weekday: 1, startMinute: 540, endMinute: 600 })],
    });

    const result = solve({
      courses,
      commitments: [],
      locks: [{ groupId: "c1-group", optionId: "c1-second" }],
    });

    expect(result.combinations.length).toBeGreaterThan(0);
    for (const combo of result.combinations) {
      expect(combo.find((s) => s.groupId === "c1-group")?.optionId).toBe("c1-second");
    }
  });

  it("returns the same combinations (as a set) on repeated runs", () => {
    const courses = [course("c1", 1), course("c2", 2)];
    const first = solve({ courses, commitments: [], locks: [] });
    const second = solve({ courses, commitments: [], locks: [] });

    expect(first.combinations.map(signature).sort()).toEqual(second.combinations.map(signature).sort());
  });
});

describe("rank: preference changes reorder without changing the feasible set", () => {
  it("keeps the same option-set collection across all three preferences", () => {
    const morning: Course = {
      id: "morning",
      code: "MOR1000",
      title: "Morning",
      activityGroups: [
        {
          id: "morning-tutorial",
          label: "Tutorial",
          options: [
            { id: "morning-a", label: "A", meetings: [meeting({ weekday: 1, startMinute: 540, endMinute: 600 })] },
            { id: "morning-b", label: "B", meetings: [meeting({ weekday: 3, startMinute: 780, endMinute: 840 })] },
          ],
        },
      ],
    };
    const afternoon: Course = {
      id: "afternoon",
      code: "AFT1000",
      title: "Afternoon",
      activityGroups: [
        {
          id: "afternoon-tutorial",
          label: "Tutorial",
          options: [
            { id: "afternoon-a", label: "A", meetings: [meeting({ weekday: 1, startMinute: 780, endMinute: 840 })] },
            { id: "afternoon-b", label: "B", meetings: [meeting({ weekday: 5, startMinute: 900, endMinute: 960 })] },
          ],
        },
      ],
    };

    const { combinations } = solve({ courses: [morning, afternoon], commitments: [], locks: [] });
    const asCombinations: Combination[] = combinations.map((selections) => ({
      selections,
      metrics: computeMetrics(selections, [morning, afternoon]),
    }));

    const byCampusDays = rankCombinations(asCombinations, "campusDays").map((c) => signature(c.selections)).sort();
    const byGaps = rankCombinations(asCombinations, "gaps").map((c) => signature(c.selections)).sort();
    const byEarly = rankCombinations(asCombinations, "early").map((c) => signature(c.selections)).sort();

    expect(byCampusDays).toEqual(byGaps);
    expect(byGaps).toEqual(byEarly);
  });
});

describe("repair: only reports relaxations that truly restore a result", () => {
  it("reports the blocking commitment but not an unrelated one", () => {
    const course: Course = {
      id: "only",
      code: "ONLY1000",
      title: "Only",
      activityGroups: [
        {
          id: "only-group",
          label: "Group",
          options: [
            {
              id: "only-option",
              label: "Option",
              meetings: [meeting({ weekday: 1, startMinute: 600, endMinute: 660 })],
            },
          ],
        },
      ],
    };

    const blocking: Commitment = {
      id: "blocking",
      label: "Blocking",
      weekday: 1,
      startMinute: 600,
      endMinute: 660,
    };
    const unrelated: Commitment = {
      id: "unrelated",
      label: "Unrelated",
      weekday: 4,
      startMinute: 600,
      endMinute: 660,
    };

    const baseline = solve({ courses: [course], commitments: [blocking, unrelated], locks: [] });
    expect(baseline.combinations).toHaveLength(0);

    const { candidates } = findRelaxations({
      courses: [course],
      commitments: [blocking, unrelated],
      locks: [],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ type: "block", id: "blocking", restoredCount: 1 });
  });
});
