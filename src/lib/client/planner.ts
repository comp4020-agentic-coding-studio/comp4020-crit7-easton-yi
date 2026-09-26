import { allGroups } from "../timetable/lookup";
import type {
  Commitment,
  Course,
  HardClash,
  Lock,
  Preference,
  RelaxationCandidate,
  Representative,
  Selection,
  Weekday,
} from "../timetable/types";

export type PlannerInitial = {
  mode: "create" | "edit";
  planId?: string;
  expectedRevision?: number;
  name: string;
  courseIds: string[];
  commitments: Commitment[];
  locks: Lock[];
  preference: Preference;
};

export type PlannerConfig = {
  courses: Course[];
  initial: PlannerInitial;
};

type SolveResponse = {
  complete: boolean;
  feasibleCount?: number;
  foundCount?: number;
  representatives: Representative[];
  hardClashes?: HardClash[];
};

type RepairResponse = { candidates: RelaxationCandidate[] };

type ResolvedSelection = {
  groupId: string;
  optionId: string;
  course: Course;
  groupLabel: string;
  optionLabel: string;
  meetings: Course["activityGroups"][number]["options"][number]["meetings"];
  courseIndex: number;
};

type GridEntry = {
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  detail: string;
  courseIndex?: number;
  kind: "meeting" | "block";
};

const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

const WEEKDAY_SHORT: Record<Weekday, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

const PREFERENCE_LABELS: Record<Preference, string> = {
  campusDays: "Fewer campus days",
  gaps: "Shorter gaps between classes",
  early: "Fewer early starts",
};

function formatClock(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function parseClock(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

export function initPlanner(root: HTMLElement, config: PlannerConfig): void {
  const { courses } = config;
  const courseIds = new Set(config.initial.courseIds);
  let commitments: Commitment[] = [...config.initial.commitments];
  let locks: Lock[] = [...config.initial.locks];
  let preference: Preference = config.initial.preference;
  const planId = config.initial.planId ?? crypto.randomUUID();
  let expectedRevision = config.initial.expectedRevision;
  const mode = config.initial.mode;

  let requestSequence = 0;

  const statusEl = root.querySelector<HTMLElement>("#planner-status");
  const cardsEl = root.querySelector<HTMLElement>("#plan-cards");
  const repairEl = root.querySelector<HTMLElement>("#repair-suggestions");
  const clashEl = root.querySelector<HTMLElement>("#clash-notice");
  const courseListEl = root.querySelector<HTMLElement>("#course-list");
  const commitmentListEl = root.querySelector<HTMLElement>("#commitment-list");
  const preferenceListEl = root.querySelector<HTMLElement>("#preference-list");
  const addCommitmentButton = root.querySelector<HTMLButtonElement>("#add-commitment");

  if (!statusEl || !cardsEl || !repairEl || !clashEl || !courseListEl || !commitmentListEl || !preferenceListEl) {
    return;
  }

  function setStatus(message: string, tone: "info" | "error" = "info") {
    statusEl!.textContent = message;
    if (tone === "error") statusEl!.dataset.tone = "error";
    else delete statusEl!.dataset.tone;
  }

  function activeCourses(): Course[] {
    return courses.filter((course) => courseIds.has(course.id));
  }

  function effectiveLocks(): Lock[] {
    const groupIds = new Set(allGroups(activeCourses()).map((group) => group.id));
    return locks.filter((lock) => groupIds.has(lock.groupId));
  }

  function courseForGroup(groupId: string): Course | undefined {
    return courses.find((course) => course.activityGroups.some((group) => group.id === groupId));
  }

  function resolveSelections(selections: Selection[]): ResolvedSelection[] {
    const resolved: ResolvedSelection[] = [];
    for (const selection of selections) {
      const course = courseForGroup(selection.groupId);
      const group = course?.activityGroups.find((candidate) => candidate.id === selection.groupId);
      const option = group?.options.find((candidate) => candidate.id === selection.optionId);
      if (!course || !group || !option) continue;
      resolved.push({
        groupId: selection.groupId,
        optionId: selection.optionId,
        course,
        groupLabel: group.label,
        optionLabel: option.label,
        meetings: option.meetings,
        courseIndex: courses.findIndex((candidate) => candidate.id === course.id) % 4,
      });
    }
    return resolved;
  }

  function withFocusPreserved(container: HTMLElement, rebuild: () => void) {
    const active = document.activeElement as HTMLElement | null;
    const key = active && container.contains(active) ? active.dataset.focusKey : undefined;
    rebuild();
    if (!key) return;
    const next = container.querySelector<HTMLElement>(`[data-focus-key="${cssEscape(key)}"]`);
    if (next) next.focus();
    else statusEl!.focus();
  }

  function buildCommitmentListItem(commitment: Commitment): HTMLLIElement {
    const li = document.createElement("li");
    li.dataset.commitmentId = commitment.id;
    const span = document.createElement("span");
    span.textContent = `${commitment.label}: ${WEEKDAY_LABELS[commitment.weekday]} ${formatClock(commitment.startMinute)}–${formatClock(commitment.endMinute)}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "danger remove-commitment";
    button.dataset.commitmentId = commitment.id;
    button.dataset.focusKey = `remove-commitment:${commitment.id}`;
    button.textContent = "Remove";
    li.append(span, button);
    return li;
  }

  function buildGrid(entries: GridEntry[]): { grid: HTMLElement; agenda: HTMLElement } {
    const grid = document.createElement("div");
    grid.className = "week-grid";
    const agenda = document.createElement("div");
    agenda.className = "day-agenda";

    if (entries.length === 0) {
      grid.textContent = "No scheduled meetings.";
      agenda.textContent = "No scheduled meetings.";
      return { grid, agenda };
    }

    const weekdaysUsed = [...new Set(entries.map((entry) => entry.weekday))].sort((a, b) => a - b);
    grid.style.setProperty("--day-count", String(weekdaysUsed.length));

    const minMinute = Math.floor(Math.min(...entries.map((entry) => entry.startMinute)) / 60) * 60;
    const maxMinuteRaw = Math.ceil(Math.max(...entries.map((entry) => entry.endMinute)) / 60) * 60;
    const maxMinute = Math.max(maxMinuteRaw, minMinute + 60);

    const corner = document.createElement("div");
    corner.className = "week-grid__head";
    corner.style.gridColumn = "1";
    corner.style.gridRow = "1";
    grid.append(corner);

    weekdaysUsed.forEach((weekday, index) => {
      const head = document.createElement("div");
      head.className = "week-grid__head";
      head.style.gridColumn = String(index + 2);
      head.style.gridRow = "1";
      head.textContent = WEEKDAY_SHORT[weekday];
      grid.append(head);
    });

    for (let hour = minMinute; hour <= maxMinute; hour += 60) {
      const rowStart = 2 + (hour - minMinute) / 15;
      const label = document.createElement("div");
      label.className = "week-grid__hour";
      label.style.gridColumn = "1";
      label.style.gridRow = `${rowStart} / span 4`;
      label.textContent = formatClock(hour);
      grid.append(label);
    }

    for (const entry of entries) {
      const dayIndex = weekdaysUsed.indexOf(entry.weekday);
      if (dayIndex === -1) continue;
      const rowStart = 2 + (entry.startMinute - minMinute) / 15;
      const rowEnd = 2 + (entry.endMinute - minMinute) / 15;
      const block = document.createElement("div");
      block.className = entry.kind === "meeting" ? "week-grid__meeting" : "week-grid__meeting week-grid__meeting--block";
      block.style.gridColumn = String(dayIndex + 2);
      block.style.gridRow = `${rowStart} / ${rowEnd}`;
      if (entry.courseIndex !== undefined) block.style.setProperty("--course-color", `var(--course-${entry.courseIndex})`);
      const strong = document.createElement("strong");
      strong.textContent = entry.detail;
      const small = document.createElement("span");
      small.textContent = `${formatClock(entry.startMinute)}–${formatClock(entry.endMinute)}`;
      block.append(strong, small);
      grid.append(block);
    }

    for (const weekday of weekdaysUsed) {
      const section = document.createElement("div");
      const heading = document.createElement("h4");
      heading.textContent = WEEKDAY_LABELS[weekday];
      section.append(heading);
      const list = document.createElement("ul");
      const dayEntries = entries.filter((entry) => entry.weekday === weekday).sort((a, b) => a.startMinute - b.startMinute);
      for (const entry of dayEntries) {
        const li = document.createElement("li");
        if (entry.courseIndex !== undefined) li.style.setProperty("--course-color", `var(--course-${entry.courseIndex})`);
        li.textContent = `${formatClock(entry.startMinute)}–${formatClock(entry.endMinute)} ${entry.detail}`;
        list.append(li);
      }
      section.append(list);
      agenda.append(section);
    }

    return { grid, agenda };
  }

  function buildCard(rep: Representative): HTMLElement {
    const article = document.createElement("article");
    article.className = "plan-card";
    article.setAttribute("aria-label", `Plan optimizing for ${PREFERENCE_LABELS[rep.bestFor]}`);

    const heading = document.createElement("h3");
    heading.textContent = PREFERENCE_LABELS[rep.bestFor];
    article.append(heading);

    if (rep.tradeoff) {
      const tradeoff = document.createElement("p");
      tradeoff.className = "tradeoff";
      tradeoff.textContent = rep.tradeoff;
      article.append(tradeoff);
    }

    const metricsList = document.createElement("dl");
    metricsList.className = "metrics";
    const metricEntries: [string, string][] = [
      ["Campus days", String(rep.metrics.campusDays)],
      ["Gaps", formatDuration(rep.metrics.gapMinutes)],
      ["Early starts", String(rep.metrics.earlyCount)],
    ];
    for (const [label, value] of metricEntries) {
      const wrap = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      wrap.append(dt, dd);
      metricsList.append(wrap);
    }
    article.append(metricsList);

    const resolved = resolveSelections(rep.selections);

    const selectionList = document.createElement("ul");
    selectionList.className = "selection-list";
    for (const selection of resolved) {
      const li = document.createElement("li");
      li.style.setProperty("--course-color", `var(--course-${selection.courseIndex})`);
      const span = document.createElement("span");
      span.textContent = `${selection.course.code} ${selection.groupLabel}: ${selection.optionLabel}`;
      const isLocked = locks.some((lock) => lock.groupId === selection.groupId && lock.optionId === selection.optionId);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary lock-toggle";
      button.textContent = isLocked ? "Unlock" : "Lock";
      button.setAttribute("aria-pressed", String(isLocked));
      button.dataset.focusKey = `lock:${selection.groupId}`;
      button.addEventListener("click", () => {
        locks = isLocked
          ? locks.filter((lock) => lock.groupId !== selection.groupId)
          : [...locks.filter((lock) => lock.groupId !== selection.groupId), { groupId: selection.groupId, optionId: selection.optionId }];
        void runSolve();
      });
      li.append(span, button);
      selectionList.append(li);
    }
    article.append(selectionList);

    const entries: GridEntry[] = [
      ...resolved.flatMap((selection) =>
        selection.meetings.map((meeting) => ({
          weekday: meeting.weekday,
          startMinute: meeting.startMinute,
          endMinute: meeting.endMinute,
          detail: `${selection.course.code} ${selection.groupLabel}: ${selection.optionLabel}${
            meeting.location ? ` — ${meeting.location}` : meeting.mode === "online" ? " — online" : ""
          }`,
          courseIndex: selection.courseIndex,
          kind: "meeting" as const,
        })),
      ),
      ...commitments.map((commitment) => ({
        weekday: commitment.weekday,
        startMinute: commitment.startMinute,
        endMinute: commitment.endMinute,
        detail: `Unavailable: ${commitment.label}`,
        kind: "block" as const,
      })),
    ];

    const { grid, agenda } = buildGrid(entries);
    article.append(grid, agenda);

    const saveForm = document.createElement("div");
    saveForm.className = "save-form";
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save this plan";
    saveButton.dataset.focusKey = `save:${rep.bestFor}`;
    saveButton.addEventListener("click", () => void saveCard(rep));
    saveForm.append(saveButton);
    article.append(saveForm);

    return article;
  }

  async function saveCard(rep: Representative) {
    const nameInput = root.querySelector<HTMLInputElement>("#plan-name");
    const name = nameInput?.value.trim() ?? "";
    if (!name) {
      setStatus("Enter a plan name before saving.", "error");
      nameInput?.focus();
      return;
    }

    const body = {
      id: planId,
      name,
      preference: rep.bestFor,
      courseIds: [...courseIds],
      commitments,
      selections: rep.selections,
      locks: effectiveLocks(),
      expectedRevision: mode === "edit" ? expectedRevision : undefined,
    };

    const url = mode === "edit" ? `/api/plans/${planId}` : "/api/plans";
    const method = mode === "edit" ? "PUT" : "POST";

    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}) as { error?: string; plan?: { revision: number } });
      if (!response.ok) {
        setStatus(payload.error ?? "Could not save this plan.", "error");
        return;
      }
      if (mode === "create") {
        window.location.assign(`/plans/${planId}/`);
        return;
      }
      if (payload.plan) expectedRevision = payload.plan.revision;
      setStatus("Saved.");
    } catch {
      setStatus("Network error while saving.", "error");
    }
  }

  function renderRepairCandidates(candidates: RelaxationCandidate[]) {
    repairEl!.replaceChildren();
    if (candidates.length === 0) return;

    const heading = document.createElement("p");
    heading.textContent = "Removing one of these would restore a valid combination:";
    repairEl!.append(heading);

    const list = document.createElement("ul");
    list.className = "repair-candidates";
    for (const candidate of candidates) {
      const li = document.createElement("li");
      const text = document.createElement("span");
      text.textContent =
        candidate.type === "block"
          ? `Remove "${candidate.label}" (restores ${candidate.restoredCount} combination${candidate.restoredCount === 1 ? "" : "s"})`
          : `Unlock ${candidate.label} (restores ${candidate.restoredCount} combination${candidate.restoredCount === 1 ? "" : "s"})`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = candidate.type === "block" ? "Remove block" : "Unlock";
      button.dataset.focusKey = `repair:${candidate.type}:${candidate.type === "block" ? candidate.id : candidate.groupId}`;
      button.addEventListener("click", () => {
        if (candidate.type === "block") {
          commitments = commitments.filter((commitment) => commitment.id !== candidate.id);
          commitmentListEl!.querySelector(`[data-commitment-id="${cssEscape(candidate.id)}"]`)?.remove();
        } else {
          locks = locks.filter((lock) => lock.groupId !== candidate.groupId);
        }
        void runSolve();
      });
      li.append(text, button);
      list.append(li);
    }
    repairEl!.append(list);
  }

  function removeCourse(courseId: string) {
    courseIds.delete(courseId);
    const checkbox = courseListEl!.querySelector<HTMLInputElement>(
      `input[name="course"][value="${cssEscape(courseId)}"]`,
    );
    if (checkbox) checkbox.checked = false;
    void runSolve();
  }

  function renderHardClashes(clashes: HardClash[]) {
    clashEl!.replaceChildren();
    if (clashes.length === 0) return;

    const heading = document.createElement("h2");
    heading.textContent = "No clash-free plan";
    clashEl!.append(heading);

    const explanation = document.createElement("p");
    explanation.textContent =
      "These are fixed activities in the verified ANU Web Publisher dataset — every student in the section meets at this time, so no combination of choices can avoid the overlap.";
    clashEl!.append(explanation);

    const list = document.createElement("ul");
    list.className = "hard-clashes";
    const clashingCourseIds = new Set<string>();
    for (const clash of clashes) {
      clashingCourseIds.add(clash.a.courseId);
      clashingCourseIds.add(clash.b.courseId);

      const li = document.createElement("li");
      const pair = document.createElement("p");
      pair.textContent = `${clash.a.courseCode} vs ${clash.b.courseCode}`;
      const detailA = document.createElement("p");
      detailA.textContent = `${clash.a.courseCode} ${clash.a.groupLabel} (${clash.a.optionId}): ${WEEKDAY_LABELS[clash.a.weekday]} ${formatClock(clash.a.startMinute)}–${formatClock(clash.a.endMinute)}`;
      const detailB = document.createElement("p");
      detailB.textContent = `${clash.b.courseCode} ${clash.b.groupLabel} (${clash.b.optionId}): ${WEEKDAY_LABELS[clash.b.weekday]} ${formatClock(clash.b.startMinute)}–${formatClock(clash.b.endMinute)}`;
      const weeks = document.createElement("p");
      weeks.textContent = `Overlapping teaching weeks: ${clash.overlappingWeeks.join(", ")}`;
      li.append(pair, detailA, detailB, weeks);
      list.append(li);
    }
    clashEl!.append(list);

    const actions = document.createElement("div");
    actions.className = "clash-actions";
    for (const courseId of clashingCourseIds) {
      const course = courses.find((candidate) => candidate.id === courseId);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "danger";
      button.textContent = `Remove ${course?.code ?? courseId}`;
      button.dataset.focusKey = `clash-remove:${courseId}`;
      button.addEventListener("click", () => removeCourse(courseId));
      actions.append(button);
    }
    clashEl!.append(actions);
  }

  async function offerRepair() {
    try {
      const response = await fetch("/api/repair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseIds: [...courseIds], commitments, locks: effectiveLocks() }),
      });
      if (!response.ok) return;
      const result = (await response.json()) as RepairResponse;
      renderRepairCandidates(result.candidates);
    } catch {
      // suggestions are a courtesy; skip silently on failure
    }
  }

  function renderResults(result: SolveResponse) {
    withFocusPreserved(cardsEl!, () => {
      cardsEl!.replaceChildren();
      for (const rep of result.representatives) {
        cardsEl!.append(buildCard(rep));
      }
    });

    const hardClashes = result.hardClashes ?? [];
    renderHardClashes(hardClashes);

    if (result.representatives.length > 0) {
      const count = result.complete ? (result.feasibleCount ?? result.representatives.length) : (result.foundCount ?? result.representatives.length);
      setStatus(
        result.complete
          ? `Found ${count} valid combination${count === 1 ? "" : "s"}, showing up to 3.`
          : `Search stopped early — showing ${result.representatives.length} of the combinations found so far.`,
      );
    } else if (hardClashes.length > 0) {
      setStatus("No clash-free plan — see details below.", "error");
    } else if (result.complete) {
      setStatus("No combination satisfies every constraint you've set.", "error");
    } else {
      setStatus("Search stopped early without finding a combination — try removing a course or a block.", "error");
    }
  }

  async function runSolve() {
    const seq = ++requestSequence;
    repairEl!.replaceChildren();
    clashEl!.replaceChildren();

    if (courseIds.size === 0) {
      withFocusPreserved(cardsEl!, () => cardsEl!.replaceChildren());
      setStatus("Select at least one course to get started.");
      return;
    }

    setStatus("Generating combinations…");

    let result: SolveResponse;
    try {
      const response = await fetch("/api/solve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          courseIds: [...courseIds],
          commitments,
          locks: effectiveLocks(),
          preference,
        }),
      });
      if (seq !== requestSequence) return;
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}) as { error?: string });
        setStatus(payload.error ?? "Could not generate combinations.", "error");
        return;
      }
      result = (await response.json()) as SolveResponse;
    } catch {
      if (seq !== requestSequence) return;
      setStatus("Network error while generating combinations.", "error");
      return;
    }
    if (seq !== requestSequence) return;

    renderResults(result);
    const hasHardClash = (result.hardClashes ?? []).length > 0;
    if (result.representatives.length === 0 && result.complete && !hasHardClash) void offerRepair();
  }

  courseListEl.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    if (target.name !== "course") return;
    if (target.checked) courseIds.add(target.value);
    else courseIds.delete(target.value);
    void runSolve();
  });

  preferenceListEl.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    if (target.name !== "preference") return;
    preference = target.value as Preference;
    void runSolve();
  });

  commitmentListEl.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".remove-commitment");
    if (!button) return;
    const id = button.dataset.commitmentId;
    commitments = commitments.filter((commitment) => commitment.id !== id);
    button.closest("li")?.remove();
    void runSolve();
  });

  addCommitmentButton?.addEventListener("click", () => {
    const labelInput = root.querySelector<HTMLInputElement>("#commitment-label");
    const weekdaySelect = root.querySelector<HTMLSelectElement>("#commitment-weekday");
    const startInput = root.querySelector<HTMLInputElement>("#commitment-start");
    const endInput = root.querySelector<HTMLInputElement>("#commitment-end");
    if (!labelInput || !weekdaySelect || !startInput || !endInput) return;

    const label = labelInput.value.trim();
    const weekday = Number(weekdaySelect.value) as Weekday;
    const start = parseClock(startInput.value);
    const end = parseClock(endInput.value);

    if (!label) {
      setStatus("Give the block a label.", "error");
      labelInput.focus();
      return;
    }
    if (start === null || end === null || start >= end) {
      setStatus("The block's start time must be before its end time.", "error");
      startInput.focus();
      return;
    }

    const commitment: Commitment = { id: crypto.randomUUID(), label, weekday, startMinute: start, endMinute: end };
    commitments = [...commitments, commitment];
    commitmentListEl!.append(buildCommitmentListItem(commitment));
    labelInput.value = "";
    void runSolve();
  });

  if (courseIds.size > 0) void runSolve();
  else setStatus("Select at least one course to get started.");
}
