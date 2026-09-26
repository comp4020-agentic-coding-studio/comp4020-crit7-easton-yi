import type { Commitment, Preference, Selection, Weekday } from "../timetable/types";

export class BadRequestError extends Error {}

export function isPreference(value: unknown): value is Preference {
  return value === "campusDays" || value === "gaps" || value === "early";
}

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7;
}

/** Also valid for a `Lock` — same {groupId, optionId} shape. */
export function parseSelection(value: unknown): Selection {
  if (typeof value !== "object" || value === null) throw new BadRequestError("Invalid selection");
  const { groupId, optionId } = value as Record<string, unknown>;
  if (typeof groupId !== "string" || typeof optionId !== "string") {
    throw new BadRequestError("Selection must have string groupId and optionId");
  }
  return { groupId, optionId };
}

export function parseCommitment(value: unknown): Commitment {
  if (typeof value !== "object" || value === null) throw new BadRequestError("Invalid unavailable block");
  const { id, label, weekday, startMinute, endMinute } = value as Record<string, unknown>;
  if (typeof id !== "string" || typeof label !== "string") {
    throw new BadRequestError("Unavailable block must have string id and label");
  }
  if (!isWeekday(weekday)) {
    throw new BadRequestError("Unavailable block must have a weekday between 1 and 7");
  }
  if (typeof startMinute !== "number" || typeof endMinute !== "number" || startMinute >= endMinute) {
    throw new BadRequestError("Unavailable block must have startMinute before endMinute");
  }
  return { id, label, weekday, startMinute, endMinute };
}
