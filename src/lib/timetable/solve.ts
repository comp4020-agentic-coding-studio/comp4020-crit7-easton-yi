import { allGroups } from "./lookup";
import { meetingConflictsWithCommitment, meetingsConflict } from "./time";
import type { ActivityGroup, ActivityOption, Commitment, Course, Lock, Meeting, Selection } from "./types";

const DEFAULT_NODE_BUDGET = 200_000;

export type SolveOptions = {
  courses: Course[];
  commitments: Commitment[];
  locks: Lock[];
  nodeBudget?: number;
};

export type SolveOutput = {
  /** False when the node budget was exhausted before the search finished. */
  complete: boolean;
  combinations: Selection[][];
};

type EligibleGroup = {
  group: ActivityGroup;
  options: ActivityOption[];
};

/** Options in a group that don't collide with a hard-condition commitment, filtered to a lock if one applies. */
function eligibleOptions(
  group: ActivityGroup,
  commitments: Commitment[],
  locks: Lock[],
): ActivityOption[] {
  const lock = locks.find((candidate) => candidate.groupId === group.id);
  const candidates = lock ? group.options.filter((option) => option.id === lock.optionId) : group.options;

  return candidates.filter(
    (option) =>
      !option.meetings.some((meeting) =>
        commitments.some((commitment) => meetingConflictsWithCommitment(meeting, commitment)),
      ),
  );
}

function optionConflicts(option: ActivityOption, chosenMeetings: Meeting[]): boolean {
  return option.meetings.some((meeting) =>
    chosenMeetings.some((chosen) => meetingsConflict(meeting, chosen)),
  );
}

/**
 * Deterministic backtracking enumeration: exactly one option per required
 * activity group, no two chosen meetings conflicting, no chosen meeting
 * conflicting with a user commitment. Never claims `complete: true` unless
 * the whole search tree was actually explored — a budget cutoff always
 * reports `complete: false` rather than pretending the result is exhaustive.
 */
export function solve(options: SolveOptions): SolveOutput {
  const nodeBudget = options.nodeBudget ?? DEFAULT_NODE_BUDGET;
  const groups = allGroups(options.courses);

  const eligible: EligibleGroup[] = groups.map((group) => ({
    group,
    options: eligibleOptions(group, options.commitments, options.locks),
  }));

  if (eligible.some((entry) => entry.options.length === 0)) {
    return { complete: true, combinations: [] };
  }

  // Fewest-options-first ordering gives the search early pruning wins.
  const ordered = [...eligible].sort((a, b) => a.options.length - b.options.length);

  const combinations: Selection[][] = [];
  let nodes = 0;
  let complete = true;

  function backtrack(index: number, chosen: Selection[], chosenMeetings: Meeting[]): boolean {
    if (nodes >= nodeBudget) {
      complete = false;
      return false;
    }
    nodes += 1;

    if (index === ordered.length) {
      combinations.push([...chosen]);
      return true;
    }

    const entry = ordered[index];
    if (!entry) return true;

    for (const option of entry.options) {
      if (optionConflicts(option, chosenMeetings)) continue;

      chosen.push({ groupId: entry.group.id, optionId: option.id });
      chosenMeetings.push(...option.meetings);

      const keepGoing = backtrack(index + 1, chosen, chosenMeetings);

      chosenMeetings.length -= option.meetings.length;
      chosen.pop();

      if (!keepGoing) return false;
    }

    return true;
  }

  backtrack(0, [], []);

  return { complete, combinations };
}
