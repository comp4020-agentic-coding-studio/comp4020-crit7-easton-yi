import type { Commitment, Lock, Preference } from "../timetable/types";
import { BadRequestError, isPreference, parseCommitment, parseSelection } from "./request-parsing";

export { BadRequestError };

type CommonFields = {
  courseIds: string[];
  commitments: Commitment[];
  locks: Lock[];
};

function parseCommonFields(body: Record<string, unknown>): CommonFields {
  if (!Array.isArray(body.courseIds) || body.courseIds.some((entry) => typeof entry !== "string")) {
    throw new BadRequestError("courseIds must be an array of strings");
  }
  if (!Array.isArray(body.commitments)) throw new BadRequestError("commitments must be an array");
  if (!Array.isArray(body.locks)) throw new BadRequestError("locks must be an array");

  return {
    courseIds: body.courseIds as string[],
    commitments: body.commitments.map(parseCommitment),
    locks: body.locks.map(parseSelection),
  };
}

export type SolveRequestBody = CommonFields & {
  preference: Preference;
  earlyThresholdMinute?: number;
};

export function parseSolveRequestBody(value: unknown): SolveRequestBody {
  if (typeof value !== "object" || value === null) throw new BadRequestError("Body must be an object");
  const body = value as Record<string, unknown>;

  if (!isPreference(body.preference)) throw new BadRequestError("Invalid preference");

  let earlyThresholdMinute: number | undefined;
  if (body.earlyThresholdMinute !== undefined) {
    if (typeof body.earlyThresholdMinute !== "number") {
      throw new BadRequestError("earlyThresholdMinute must be a number");
    }
    earlyThresholdMinute = body.earlyThresholdMinute;
  }

  return { ...parseCommonFields(body), preference: body.preference, earlyThresholdMinute };
}

export type RepairRequestBody = CommonFields;

export function parseRepairRequestBody(value: unknown): RepairRequestBody {
  if (typeof value !== "object" || value === null) throw new BadRequestError("Body must be an object");
  return parseCommonFields(value as Record<string, unknown>);
}
