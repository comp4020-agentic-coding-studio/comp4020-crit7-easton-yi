import { meetingsConflict } from "./time";
import type { Course, HardClash, Meeting } from "./types";

type FixedActivity = {
  course: Course;
  groupId: string;
  groupLabel: string;
  optionId: string;
  optionLabel: string;
  meeting: Meeting;
};

function weeksOf(meeting: Meeting, teachingWeeks: number[]): number[] {
  return meeting.weeks ?? teachingWeeks;
}

function overlappingWeeks(a: Meeting, b: Meeting, teachingWeeks: number[]): number[] {
  const aWeeks = new Set(weeksOf(a, teachingWeeks));
  return weeksOf(b, teachingWeeks)
    .filter((week) => aWeeks.has(week))
    .sort((x, y) => x - y);
}

/**
 * Finds unavoidable clashes between fixed activities (activity groups with
 * exactly one option) from different courses. A fixed activity has no
 * alternative section a student could pick instead, so a conflict between two
 * of them can never be routed around by any combination of choices — this is
 * a structural property of the selected courses, independent of the solver's
 * search.
 */
export function findHardClashes(courses: Course[], teachingWeeks: number[]): HardClash[] {
  const fixed: FixedActivity[] = [];
  for (const course of courses) {
    for (const group of course.activityGroups) {
      if (group.options.length !== 1) continue;
      const option = group.options[0]!;
      for (const meeting of option.meetings) {
        fixed.push({
          course,
          groupId: group.id,
          groupLabel: group.label,
          optionId: option.id,
          optionLabel: option.label,
          meeting,
        });
      }
    }
  }

  const clashes: HardClash[] = [];
  for (let i = 0; i < fixed.length; i++) {
    for (let j = i + 1; j < fixed.length; j++) {
      const x = fixed[i]!;
      const y = fixed[j]!;
      if (x.course.id === y.course.id) continue;
      if (!meetingsConflict(x.meeting, y.meeting)) continue;
      clashes.push({
        a: {
          courseId: x.course.id,
          courseCode: x.course.code,
          groupId: x.groupId,
          groupLabel: x.groupLabel,
          optionId: x.optionId,
          optionLabel: x.optionLabel,
          weekday: x.meeting.weekday,
          startMinute: x.meeting.startMinute,
          endMinute: x.meeting.endMinute,
        },
        b: {
          courseId: y.course.id,
          courseCode: y.course.code,
          groupId: y.groupId,
          groupLabel: y.groupLabel,
          optionId: y.optionId,
          optionLabel: y.optionLabel,
          weekday: y.meeting.weekday,
          startMinute: y.meeting.startMinute,
          endMinute: y.meeting.endMinute,
        },
        overlappingWeeks: overlappingWeeks(x.meeting, y.meeting, teachingWeeks),
      });
    }
  }
  return clashes;
}
