import type { Dataset } from "./types";

export class DatasetValidationError extends Error {}

/**
 * Structural validation for a loaded dataset: unique IDs, every required
 * group non-empty, every option has at least one meeting. Throws with a
 * specific message rather than serving a half-valid dataset.
 */
export function validateDataset(dataset: Dataset): void {
  const courseIds = new Set<string>();
  const groupIds = new Set<string>();
  const optionIds = new Set<string>();

  if (dataset.courses.length === 0) {
    throw new DatasetValidationError("Dataset has no courses");
  }

  for (const course of dataset.courses) {
    if (courseIds.has(course.id)) {
      throw new DatasetValidationError(`Duplicate course id: ${course.id}`);
    }
    courseIds.add(course.id);

    if (course.activityGroups.length === 0) {
      throw new DatasetValidationError(`Course ${course.id} has no activity groups`);
    }

    for (const group of course.activityGroups) {
      if (groupIds.has(group.id)) {
        throw new DatasetValidationError(`Duplicate activity group id: ${group.id}`);
      }
      groupIds.add(group.id);

      if (group.options.length === 0) {
        throw new DatasetValidationError(
          `Activity group ${group.id} (course ${course.id}) has no options`,
        );
      }

      for (const option of group.options) {
        if (optionIds.has(option.id)) {
          throw new DatasetValidationError(`Duplicate option id: ${option.id}`);
        }
        optionIds.add(option.id);

        if (option.meetings.length === 0) {
          throw new DatasetValidationError(
            `Option ${option.id} (group ${group.id}) has no meetings`,
          );
        }

        for (const meeting of option.meetings) {
          if (meeting.startMinute >= meeting.endMinute) {
            throw new DatasetValidationError(
              `Option ${option.id} has a meeting where start is not before end`,
            );
          }
        }
      }
    }
  }
}
