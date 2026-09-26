import { eq } from "drizzle-orm";
import { db } from "../db";
import { planCourses, planSelections, plans, unavailableBlocks } from "../schema";
import { allGroups } from "../timetable/lookup";
import { meetingConflictsWithCommitment, meetingsConflict } from "../timetable/time";
import type { Commitment, Lock, Meeting, Preference, Selection, Weekday } from "../timetable/types";
import { loadDataset } from "./dataset";

export class PlanValidationError extends Error {}
export class PlanConflictError extends Error {}
export class PlanNotFoundError extends Error {}

export type SavePlanInput = {
  id: string;
  sessionId: string;
  name: string;
  preference: Preference;
  courseIds: string[];
  commitments: Commitment[];
  selections: Selection[];
  locks: Lock[];
  /** Absent/0 to create; the plan's last-seen revision to update. */
  expectedRevision?: number;
};

export type SavedPlan = {
  id: string;
  name: string;
  preference: Preference;
  datasetVersion: string;
  revision: number;
  courseIds: string[];
  commitments: Commitment[];
  selections: Selection[];
  locks: Lock[];
  createdAt: string;
  updatedAt: string;
};

export type SavedPlanSummary = {
  id: string;
  name: string;
  preference: Preference;
  revision: number;
  updatedAt: string;
};

/** Re-validates every reference and conflict server-side — never trusts a client-submitted conflict-free claim. */
function validate(input: SavePlanInput) {
  const dataset = loadDataset();
  const courses = input.courseIds.map((id) => dataset.courses.find((course) => course.id === id));
  if (courses.some((course) => course === undefined)) {
    throw new PlanValidationError("Unknown course id");
  }

  const requiredGroups = allGroups(courses.filter((course) => course !== undefined));

  if (input.selections.length !== requiredGroups.length) {
    throw new PlanValidationError("Selections must cover every required activity group exactly once");
  }

  const chosenMeetings: Meeting[] = [];
  for (const group of requiredGroups) {
    const selection = input.selections.find((candidate) => candidate.groupId === group.id);
    if (!selection) {
      throw new PlanValidationError(`Missing selection for group ${group.id}`);
    }

    const option = group.options.find((candidate) => candidate.id === selection.optionId);
    if (!option) {
      throw new PlanValidationError(`Unknown option ${selection.optionId} for group ${group.id}`);
    }

    for (const meeting of option.meetings) {
      if (input.commitments.some((commitment) => meetingConflictsWithCommitment(meeting, commitment))) {
        throw new PlanConflictError(`Option ${option.id} conflicts with an unavailable block`);
      }
      if (chosenMeetings.some((chosen) => meetingsConflict(meeting, chosen))) {
        throw new PlanConflictError(`Option ${option.id} conflicts with another selection in this plan`);
      }
      chosenMeetings.push(meeting);
    }
  }

  for (const lock of input.locks) {
    const matches = input.selections.some(
      (selection) => selection.groupId === lock.groupId && selection.optionId === lock.optionId,
    );
    if (!matches) {
      throw new PlanValidationError(`Lock for group ${lock.groupId} does not match its selection`);
    }
  }

  return dataset;
}

function toSavedPlan(
  plan: { id: string; name: string; preference: string; datasetVersion: string; revision: number; createdAt: string; updatedAt: string },
  courseIds: string[],
  selections: Selection[],
  commitments: Commitment[],
  locks: Lock[],
): SavedPlan {
  return {
    id: plan.id,
    name: plan.name,
    preference: plan.preference as Preference,
    datasetVersion: plan.datasetVersion,
    revision: plan.revision,
    courseIds,
    commitments,
    selections,
    locks,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

/** Creates or updates a plan in one transaction, checked against `expectedRevision` for optimistic concurrency. */
export function savePlan(input: SavePlanInput): SavedPlan {
  const dataset = validate(input);

  return db.transaction((tx) => {
    const existing = tx.select().from(plans).where(eq(plans.id, input.id)).get();

    if (existing) {
      if (existing.sessionId !== input.sessionId) {
        throw new PlanNotFoundError("Plan not found");
      }
      if (input.expectedRevision !== undefined && input.expectedRevision !== existing.revision) {
        throw new PlanConflictError("Plan was modified by another request");
      }

      tx.update(plans)
        .set({
          name: input.name,
          datasetVersion: dataset.manifest.version,
          preference: input.preference,
          revision: existing.revision + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(plans.id, input.id))
        .run();

      tx.delete(planCourses).where(eq(planCourses.planId, input.id)).run();
      tx.delete(planSelections).where(eq(planSelections.planId, input.id)).run();
      tx.delete(unavailableBlocks).where(eq(unavailableBlocks.planId, input.id)).run();
    } else {
      if (input.expectedRevision !== undefined && input.expectedRevision !== 0) {
        throw new PlanConflictError("Plan does not exist");
      }

      tx.insert(plans)
        .values({
          id: input.id,
          sessionId: input.sessionId,
          name: input.name,
          datasetVersion: dataset.manifest.version,
          preference: input.preference,
          revision: 1,
        })
        .run();
    }

    for (const courseId of input.courseIds) {
      tx.insert(planCourses).values({ planId: input.id, courseId }).run();
    }

    for (const selection of input.selections) {
      const isLocked = input.locks.some(
        (lock) => lock.groupId === selection.groupId && lock.optionId === selection.optionId,
      );
      tx.insert(planSelections)
        .values({
          planId: input.id,
          groupId: selection.groupId,
          optionId: selection.optionId,
          isLocked: isLocked ? 1 : 0,
        })
        .run();
    }

    for (const commitment of input.commitments) {
      tx.insert(unavailableBlocks)
        .values({
          id: commitment.id,
          planId: input.id,
          label: commitment.label,
          weekday: commitment.weekday,
          startMinute: commitment.startMinute,
          endMinute: commitment.endMinute,
        })
        .run();
    }

    const saved = tx.select().from(plans).where(eq(plans.id, input.id)).get();
    if (!saved) throw new Error("Plan disappeared inside its own transaction");
    return toSavedPlan(saved, input.courseIds, input.selections, input.commitments, input.locks);
  });
}

export function listPlans(sessionId: string): SavedPlanSummary[] {
  return db
    .select()
    .from(plans)
    .where(eq(plans.sessionId, sessionId))
    .all()
    .map((plan) => ({
      id: plan.id,
      name: plan.name,
      preference: plan.preference as Preference,
      revision: plan.revision,
      updatedAt: plan.updatedAt,
    }));
}

/** Ownership-scoped: returns undefined for another session's plan, never a distinguishable "forbidden". */
export function getPlan(id: string, sessionId: string): SavedPlan | undefined {
  const plan = db.select().from(plans).where(eq(plans.id, id)).get();
  if (!plan || plan.sessionId !== sessionId) return undefined;

  const courseRows = db.select().from(planCourses).where(eq(planCourses.planId, id)).all();
  const selectionRows = db.select().from(planSelections).where(eq(planSelections.planId, id)).all();
  const blockRows = db.select().from(unavailableBlocks).where(eq(unavailableBlocks.planId, id)).all();

  return toSavedPlan(
    plan,
    courseRows.map((row) => row.courseId),
    selectionRows.map((row) => ({ groupId: row.groupId, optionId: row.optionId })),
    blockRows.map((row) => ({
      id: row.id,
      label: row.label,
      weekday: row.weekday as Weekday,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
    })),
    selectionRows
      .filter((row) => row.isLocked)
      .map((row) => ({ groupId: row.groupId, optionId: row.optionId })),
  );
}

export function deletePlan(id: string, sessionId: string, expectedRevision: number): void {
  const plan = db.select().from(plans).where(eq(plans.id, id)).get();
  if (!plan || plan.sessionId !== sessionId) {
    throw new PlanNotFoundError("Plan not found");
  }
  if (plan.revision !== expectedRevision) {
    throw new PlanConflictError("Plan was modified by another request");
  }
  db.delete(plans).where(eq(plans.id, id)).run();
}
