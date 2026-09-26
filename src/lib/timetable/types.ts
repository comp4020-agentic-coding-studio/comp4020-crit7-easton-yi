// Domain types for the timetable planner. See docs/WEEKWISE_IMPLEMENTATION_PROMPT.md
// for the contract these mirror.

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Meeting = {
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  weeks?: number[];
  location?: string;
  mode: "in-person" | "online";
};

export type ActivityOption = {
  id: string;
  label: string;
  meetings: Meeting[];
  eligibilityNote?: string;
};

export type ActivityGroup = {
  id: string;
  label: string;
  options: ActivityOption[];
};

export type Course = {
  id: string;
  code: string;
  title: string;
  activityGroups: ActivityGroup[];
};

export type DatasetKind = "synthetic" | "verified";

export type DatasetManifest = {
  datasetId: string;
  version: string;
  kind: DatasetKind;
  term: string;
  timezone: string;
  teachingWeeks: number[];
  sourceUrl: string | null;
  reviewedAt: string;
  reviewedBy: string;
  notice: string;
  notes?: string;
};

export type Dataset = {
  manifest: DatasetManifest;
  courses: Course[];
};

/** A user-declared unavailable time block — a hard condition. */
export type Commitment = {
  id: string;
  label: string;
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
};

export type Preference = "campusDays" | "gaps" | "early";

/** A lock pins a specific option as required for its activity group. */
export type Lock = {
  groupId: string;
  optionId: string;
};

export type SolveInput = {
  datasetVersion: string;
  courseIds: string[];
  commitments: Commitment[];
  locks: Lock[];
  preference: Preference;
  earlyThresholdMinute?: number;
};

/** One fully-resolved selection: exactly one option per required group. */
export type Selection = {
  groupId: string;
  optionId: string;
};

export type Metrics = {
  campusDays: number;
  gapMinutes: number;
  earlyCount: number;
};

export type Combination = {
  selections: Selection[];
  metrics: Metrics;
};

export type Representative = Combination & {
  /** Preference this representative is the best plan under. */
  bestFor: Preference;
  /** Short factual trade-off text vs. the primary representative, empty for it. */
  tradeoff: string;
};

/** One side of an unavoidable clash: the fixed activity that can't be avoided by choice. */
export type ClashSide = {
  courseId: string;
  courseCode: string;
  groupId: string;
  groupLabel: string;
  optionId: string;
  optionLabel: string;
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
};

/**
 * Two fixed (single-option) activities from different selected courses whose
 * meetings conflict — no combination of choices can route around this, since
 * neither side has an alternative option.
 */
export type HardClash = {
  a: ClashSide;
  b: ClashSide;
  overlappingWeeks: number[];
};

export type SolveResult = {
  complete: boolean;
  feasibleCount?: number;
  foundCount?: number;
  representatives: Representative[];
  /** Populated only when complete === true and no feasible combination exists. */
  hardClashes?: HardClash[];
};

export type RelaxationCandidate =
  | { type: "block"; id: string; label: string; restoredCount: number }
  | { type: "lock"; groupId: string; label: string; restoredCount: number };

export type RepairResult = {
  candidates: RelaxationCandidate[];
};
