import { meetingsForSelections } from "./lookup";
import { EARLY_THRESHOLD_MINUTE_DEFAULT } from "./time";
import type { Course, Meeting, Metrics, Selection } from "./types";

function gapMinutesForDay(meetings: Meeting[]): number {
  const sorted = [...meetings].sort((a, b) => a.startMinute - b.startMinute);
  let total = 0;
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (!previous || !current) continue;
    total += Math.max(0, current.startMinute - previous.endMinute);
  }
  return total;
}

function computeGapMinutes(meetings: Meeting[]): number {
  const byWeekday = new Map<number, Meeting[]>();
  for (const meeting of meetings) {
    const existing = byWeekday.get(meeting.weekday) ?? [];
    existing.push(meeting);
    byWeekday.set(meeting.weekday, existing);
  }

  let total = 0;
  for (const dayMeetings of byWeekday.values()) {
    total += gapMinutesForDay(dayMeetings);
  }
  return total;
}

export function computeMetrics(
  selections: Selection[],
  courses: Course[],
  earlyThresholdMinute: number = EARLY_THRESHOLD_MINUTE_DEFAULT,
): Metrics {
  const meetings = meetingsForSelections(selections, courses);

  const campusDays = new Set(
    meetings.filter((meeting) => meeting.mode === "in-person").map((meeting) => meeting.weekday),
  ).size;

  const gapMinutes = computeGapMinutes(meetings);
  const earlyCount = meetings.filter((meeting) => meeting.startMinute < earlyThresholdMinute).length;

  return { campusDays, gapMinutes, earlyCount };
}
