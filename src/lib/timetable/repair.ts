import { findOption } from "./lookup";
import { solve } from "./solve";
import type { Commitment, Course, Lock, RelaxationCandidate, RepairResult } from "./types";

export type RepairOptions = {
  courses: Course[];
  commitments: Commitment[];
  locks: Lock[];
  nodeBudget?: number;
};

/**
 * For each hard condition (an unavailable block, or a lock) individually
 * removed, re-solves and reports it only if that removal actually restores
 * at least one feasible combination. Never applies anything itself — the
 * caller decides whether to act on a candidate.
 */
export function findRelaxations(options: RepairOptions): RepairResult {
  const candidates: RelaxationCandidate[] = [];

  for (const commitment of options.commitments) {
    const remaining = options.commitments.filter((candidate) => candidate.id !== commitment.id);
    const result = solve({
      courses: options.courses,
      commitments: remaining,
      locks: options.locks,
      nodeBudget: options.nodeBudget,
    });

    if (result.combinations.length > 0) {
      candidates.push({
        type: "block",
        id: commitment.id,
        label: commitment.label,
        restoredCount: result.combinations.length,
      });
    }
  }

  for (const lock of options.locks) {
    const remaining = options.locks.filter((candidate) => candidate.groupId !== lock.groupId);
    const result = solve({
      courses: options.courses,
      commitments: options.commitments,
      locks: remaining,
      nodeBudget: options.nodeBudget,
    });

    if (result.combinations.length > 0) {
      const label = findOption(options.courses, lock.groupId, lock.optionId)?.label ?? lock.groupId;
      candidates.push({
        type: "lock",
        groupId: lock.groupId,
        label,
        restoredCount: result.combinations.length,
      });
    }
  }

  return { candidates };
}
