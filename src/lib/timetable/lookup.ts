import type { ActivityGroup, ActivityOption, Course, Meeting, Selection } from "./types";

export function allGroups(courses: Course[]): ActivityGroup[] {
  return courses.flatMap((course) => course.activityGroups);
}

export function findOption(
  courses: Course[],
  groupId: string,
  optionId: string,
): ActivityOption | undefined {
  for (const group of allGroups(courses)) {
    if (group.id !== groupId) continue;
    return group.options.find((option) => option.id === optionId);
  }
  return undefined;
}

export function meetingsForSelections(selections: Selection[], courses: Course[]): Meeting[] {
  return selections.flatMap((selection) => {
    const option = findOption(courses, selection.groupId, selection.optionId);
    return option?.meetings ?? [];
  });
}
