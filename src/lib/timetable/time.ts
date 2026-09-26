import type { Commitment, Meeting } from "./types";

/** Half-open interval overlap: [start, end). Adjacent meetings (10-11, 11-12) do not overlap. */
export function minutesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** True when two meetings' teaching weeks are known to be disjoint (never meet). */
export function weeksDisjoint(a: number[] | undefined, b: number[] | undefined): boolean {
  if (!a || !b) return false;
  const bSet = new Set(b);
  return !a.some((week) => bSet.has(week));
}

/** Whether two meetings conflict: same weekday, overlapping time, and overlapping (or unknown) weeks. */
export function meetingsConflict(a: Meeting, b: Meeting): boolean {
  if (a.weekday !== b.weekday) return false;
  if (!minutesOverlap(a.startMinute, a.endMinute, b.startMinute, b.endMinute)) return false;
  if (weeksDisjoint(a.weeks, b.weeks)) return false;
  return true;
}

/** Whether a meeting falls inside a user's unavailable block. */
export function meetingConflictsWithCommitment(meeting: Meeting, commitment: Commitment): boolean {
  return (
    meeting.weekday === commitment.weekday &&
    minutesOverlap(
      meeting.startMinute,
      meeting.endMinute,
      commitment.startMinute,
      commitment.endMinute,
    )
  );
}

export const EARLY_THRESHOLD_MINUTE_DEFAULT = 600; // 10:00
