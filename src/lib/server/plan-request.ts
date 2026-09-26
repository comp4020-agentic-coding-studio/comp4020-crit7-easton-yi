import type { Commitment, Lock, Preference, Selection, Weekday } from "../timetable/types";

export class BadRequestError extends Error {}

function isPreference(value: unknown): value is Preference {
  return value === "campusDays" || value === "gaps" || value === "early";
}

function isWeekday(value: unknown): value is Weekday {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7;
}

function parseSelection(value: unknown): Selection {
  if (typeof value !== "object" || value === null) throw new BadRequestError("Invalid selection");
  const { groupId, optionId } = value as Record<string, unknown>;
  if (typeof groupId !== "string" || typeof optionId !== "string") {
    throw new BadRequestError("Selection must have string groupId and optionId");
  }
  return { groupId, optionId };
}

function parseCommitment(value: unknown): Commitment {
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

export type SavePlanBody = {
  id: string;
  name: string;
  preference: Preference;
  courseIds: string[];
  commitments: Commitment[];
  selections: Selection[];
  locks: Lock[];
  expectedRevision?: number;
};

/** Strict runtime validation for a save-plan request body — never trusts client-shaped JSON. */
export function parseSavePlanBody(value: unknown): SavePlanBody {
  if (typeof value !== "object" || value === null) throw new BadRequestError("Body must be an object");
  const body = value as Record<string, unknown>;

  if (typeof body.id !== "string" || body.id.length === 0) throw new BadRequestError("Missing plan id");
  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    throw new BadRequestError("Missing plan name");
  }
  if (!isPreference(body.preference)) throw new BadRequestError("Invalid preference");
  if (!Array.isArray(body.courseIds) || body.courseIds.some((entry) => typeof entry !== "string")) {
    throw new BadRequestError("courseIds must be an array of strings");
  }
  if (!Array.isArray(body.commitments)) throw new BadRequestError("commitments must be an array");
  if (!Array.isArray(body.selections)) throw new BadRequestError("selections must be an array");
  if (!Array.isArray(body.locks)) throw new BadRequestError("locks must be an array");

  let expectedRevision: number | undefined;
  if (body.expectedRevision !== undefined) {
    if (typeof body.expectedRevision !== "number") {
      throw new BadRequestError("expectedRevision must be a number");
    }
    expectedRevision = body.expectedRevision;
  }

  return {
    id: body.id,
    name: body.name.trim().slice(0, 200),
    preference: body.preference,
    courseIds: body.courseIds as string[],
    commitments: body.commitments.map(parseCommitment),
    selections: body.selections.map(parseSelection),
    locks: body.locks.map(parseSelection),
    expectedRevision,
  };
}
