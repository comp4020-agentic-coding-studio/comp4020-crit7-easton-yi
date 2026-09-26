# Weekwise — ANU Timetable Trade-off Planner

> **Current implementation boundary**
>
> This document records the wider product reasoning. For the current Crit 7 build, implement only the MVP defined in `../WEEKWISE_IMPLEMENTATION_PROMPT.md`: 3–4 preloaded courses, one Excel-to-normalized-data import path, unavailable time blocks, one selected ranking preference, comparison of up to three plans, and SQLite save/reload. Sections describing accounts, sharing, ICS, maps, broader course coverage or other later features are reference only.


> Product design and implementation spec v1.0 · 2026-09-26 · Australia/Sydney
>
> Goal: turn timetable selection into a decision process that can be understood, adjusted, and saved.
>
> This document is the full plan and the recommended implementation baseline; this round of delivery does not include the app implementation. It clearly distinguishes the Crit 7 goal, the reduced version, and later expansion. The repository has not yet been inspected at the time of writing, so all directories and interfaces must be grounded in the existing starter once it is.

## Reading path

- To judge whether the product is worth building: §1–4.
- To see exactly how users use it: §5–8.
- To understand whether the scheduling math is correct: §9–12.
- To hand off to a coding agent for implementation: §13–18, §24.
- To manage progress and prepare for the crit: §19–23.
- To check sources, completed verification, and remaining unknowns: §25–27.

## 1. Product decision: let students own the trade-off

**Product name: Weekwise.** A working name, adjustable once before implementation. English subtitle: Make room for your week. Chinese tagline: This week, save some for yourself.

Core task: the student states which courses they need, which time slots must be kept free, and which scheduling goal matters most; the system finds conflict-free combinations, shows the cost of each, and saves the choice.

Core promises:

1. Every recommendation satisfies the stated hard constraints.
2. Every recommendation's reasoning can be traced to course timing or an explicit computed result.
3. When no feasible plan exists, offer an adjustment suggestion that has been verified by recomputation.
4. Reopening after saving restores the same data version, courses, selections, and personal constraints.

**The reasoning behind a recommendation is a computed result; the UI's "recommended" only means it ranks first under the user's chosen sort goal.** No unexplainable 92-point score, "AI satisfaction," or "best-life timetable" is introduced.

### 1.1 Why this is worth building

Four courses may each have several tutorial/lab groups. Picking a suitable section for one course in isolation isn't hard; the hard part is that one choice affects every other course, the number of days on campus, and gaps across the whole week. Students need to compare whole combinations.

Three experience moments worth preserving:

- "Turns out coming in one day less means accepting an early class on Monday."
- "Once I lock in this lab, Friday can't be fully free anymore."
- "Releasing just this one constraint restores a feasible plan — now I know exactly what to change."

### 1.2 Verified capabilities of existing systems

ANU's MyTimetable already provides plan generation, swapping activities, saving multiple plans, and viewing specific weeks. So this project's value must be demonstrated through personal preferences, direct comparison, and the experience of adjusting after an infeasible result. There is currently no evidence to support claiming "ANU has no timetable planner at all" or "the official system has no optimization features whatsoever." [S3]

The public Web Publisher is the official viewing entry point for teaching activities. The sections it shows are not necessarily open to every student, so Weekwise's time feasibility must not be described as successfully enrolling in a section or having a place available. [S4]

### 1.3 Shortest product positioning statement

> Weekwise helps ANU students compare feasible timetable plans around their commitments, understand the trade-offs, and save the week they choose.

This is a draft product pitch, not a conclusion drawn from completed user research.

## 2. Understanding users and assumptions to verify

| User scenario | Concrete task | What the product should help with |
|---|---|---|
| Commuting student | Reduce trips to campus for a single class | Compare number of days on campus across courses |
| Student with research or part-time work commitments | Keep confirmed unavailable time blocks | Treat personal commitments as hard constraints |
| Student who dislikes early classes | Avoid starting too early | Compare number of early classes, and explain unavoidable early classes |
| Student who has already chosen some sections | Adjust the remaining courses around existing choices | Lock activities, re-solve the remaining activities |
| Student planning ahead for a new semester | Draft a few options first, then go pick sections in the official system later | Save named plans, and retain section source and applicable semester |

Your own research and course-timing coordination can serve as design motivation, but actual experience should be confirmed by yourself and written into PROCESS.md. Do not write assumed pain points into the document as observed facts.

Initial validation only needs two students, about ten minutes each:

1. Ask them to describe one real scheduling trade-off, noting what tools they used at the time.
2. Have them keep half a day free and find and save an acceptable plan in the prototype.
3. Ask "why did you pick it," "where did this card mislead you," "do you think saving here is the same as enrolling in a section."

If both agree that fewer days on campus matters more than fewer early classes, the default priority can be adjusted; no new recommendation model is needed for this alone.

## 3. Three-tier scope: finish on time while keeping the full direction

| Tier | Deliverable | Completion criteria |
|---|---|---|
| Basic end-to-end flow | Choose courses, choose sections, backend validation, named save, refresh-restore | A real data read/write path works live |
| **Crit 7 target version** | Auto-generation, three preferences, personal unavailable time blocks, locking, comparison, single-constraint infeasibility repair, save and restore | Core acceptance in §19 passes; plan still present after a restart on Fly |
| Later product | Multi-constraint repair, walking time, ICS, sharing, accounts, more course data | Each feature extended only once it has its own data and test evidence |

**Crit 7 scope: one dataset, one teaching period, 3–4 real courses, with each course's already-verified activity structure preserved.** If these courses' combinations turn out to be very few, a clearly labeled synthetic dataset may additionally be provided to illustrate trade-offs — the real timetable must not be artificially altered to manufacture an effect.

The first version keeps:

- The course selection you yourself will actually use.
- Correct modeling of every required activity for those courses.
- Conflict detection covering the dataset's date range.
- Full enumeration of small-scale combinations, clearly ranked.
- Up to three distinct representative plans.
- Editing, named save, restore, save-as, delete.
- A statement of course-data provenance and save scope.

The following are deferred past the core version: complex drag-and-drop, real school login, automatic seat-grabbing, live seat counts, two-person social scheduling, a school-wide course crawler, map navigation, exam scheduling, an LLM chat box. All of these need extra interfaces or rules and would change the current delivery scope.

## 4. Four product principles

### 4.1 Separate "must satisfy" from "prefer to satisfy" in the UI

"Can't have class Wednesday afternoon" excludes combinations; "prefer fewer early classes" only affects ordering. The UI calls these "Must satisfy" and "What matters most" respectively.

### 4.2 Show the user's week before the control panel

Opening the app should immediately show courses, feasible plans, and a timetable. Using the sample data should take a single action; first entry should not require signing up, entering full history, or reading a long explanation first.

### 4.3 Compare concrete costs

Show days, minutes, number of early classes; when switching plans, state how much has changed relative to the comparison baseline that was set. When there is no difference, show "these metrics are the same, only the sections differ."

### 4.4 Every relaxation of a constraint is user-triggered

The system may suggest releasing a lock or opening up a time block, but must only change the constraint after the user selects that suggestion. When there is no solution, the original input is still preserved, with undo available.

## 5. Information architecture and pages

| Route | Purpose | Primary action |
|---|---|---|
| `/` | Main planning workspace; also serves as the product entry point | Start planning / load sample |
| `/plans/` | Plans saved under the current browser identity | Reopen |
| `/plans/[id]/` | Load one plan from the database, continue editing | Save changes / save as |
| `/about-data/` | Data source, coverage dates, usage limits, version | View official source |
| `/readme/` | Satisfies the starter's README content contract | Read project description |

Do not add a landing page, leaderboard, personal profile, or admin dashboard unrelated to the core task.

### 5.1 Desktop layout

- Top bar: product name, plan timetable, saved, data notes.
- Workspace header: current dataset/semester, data verification timestamp.
- Left column, about 240px: courses, must-satisfy constraints, sort goal.
- Main column: result count, representative plan cards, change explanation, weekly timetable, save bar.
- Activity detail: expands below the timetable or in a side panel, offering a view of other sections and locking.

The first version avoids a four-column layout. Once there is already a full weekly timetable, don't repeat the same information in a second thumbnail timetable.

### 5.2 Phone layout

On narrow screens, switch to a three-step vertical flow: constraint summary → plan selection → day-by-day course list.

The course list uses the full date, start and end time, course code, activity group, and location. The core task on mobile does not depend on shrinking things into an unclickable seven-column grid.

"Edit constraints" expands the same set of controls; the save button sits after the timetable. Wide and narrow layouts share the same state and computed results — there is no separate scheduling logic maintained for each.

## 6. The full flow from first open to save

### 6.1 Getting started

The home page offers "Try the sample timetable" and "Choose courses." The former loads a synthetic fixture with a built-in trade-off, and the whole page carries a "simulated time slot" label. The latter enters the already-verified course dataset.

After choosing a course, its required activity groups are listed immediately. For example, Lecture A, Lecture B, and Tutorial A are three groups — the UI must not let the user pick "one lecture" and miss one of them.

If a course has unsupported cross-group combination rules, tell the user before generation that the course is not yet fully supported. Never generate a plausible-looking recommendation from an incomplete course structure.

### 6.2 Adding fixed commitments

Clicking "Add unavailable time block" opens a form with fields: name, day of week, start time, end time, applicable date range. In the first version this defaults to covering the whole date range supported by the current dataset.

Example: Research time, Wednesday, 13:00–18:00. It is shown as a gray time block with an editable entry.

Form validation: start before end; same-day time range; name length 1–60; date within the data-coverage range. In the first version, a personal commitment that crosses midnight must be split into two same-day blocks.

Overlapping personal commitments don't cause a mutual "timetable infeasible" — they are simply combined into the union of unavailable time. The original entries are each kept separately, for ease of editing.

### 6.3 Adjusting the sort goal

Default is "fewest days on campus." The other two options are "fewest gaps between classes" and "fewest early classes." The user can set the early-class threshold, defaulting to 10:00.

The UI explains that "days on campus" only counts in-person classes; a personal study/work location is not part of the first-version commute calculation. "Gaps between classes" is the raw time difference between classes, not adjusted for personal commitments; the term "wasted time" is not used to make that judgment for the user.

### 6.4 Viewing plans

Every representative plan card shows:

- Plan A/B/C and the basis for its selection, e.g. "based on your priority."
- Days on campus / week.
- Minutes of gaps / week.
- Number of early classes / week.
- Change relative to the current comparison baseline.

Clicking a card updates the timetable while other constraints stay unchanged. Changed activities are highlighted, with text like "Lab moved from Friday to Tuesday."

If there is only one distinct plan, show only one — don't duplicate it into three differently labeled recommendations.

### 6.5 Locking

Clicking an activity shows the available sections for that group. The activity detail shows all its meeting times, applicable dates, and source notes.

After clicking "Pin this section," other activities are automatically re-solved. Every lock has an explicit unlock button.

A required activity that only ever had one option uses a "Fixed activity" label, distinct from a lock the user set themselves. Users must not be led to believe that unlocking a fixed lecture could conjure up another class out of nowhere.

### 6.6 Saving

After entering a name, clicking "Save plan" — "Saved" is shown only once the backend transaction succeeds. The button is disabled while submitting; on failure, all input is kept and a retry is offered.

A new save and "Save as" create an independent plan. Saving changes updates the same plan and carries a version number to prevent multiple tabs from overwriting each other.

The "Saved" page is listed by modification time, and reopening reads from the server. The first version uses an anonymous browser identity, with a single line of text explaining "these plans are tied to this browser; clearing site data may make them unrecoverable."

### 6.7 Returning to the official system

The plan detail page provides a "Verify and enroll in MyTimetable" link plus a list of the chosen activities. Use "saved plan" to describe the state — do not use words like "enrolled," "allocated," or "available," which the data does not support.

## 7. The state most worth polishing: no feasible plan

Four cases must be distinguished:

| Case | Correct feedback | Available action |
|---|---|---|
| Every option in some group is excluded by personal constraints | List that group's options and each one's conflicting time | Preview a verified relaxation suggestion |
| Each group individually has options, but they can't all be satisfied together | Explain the combination conflict between activities | View the specific conflict relationship, unlock one lock |
| Data is missing or activity rules are unknown | Current data is insufficient to determine | Add / verify course data |
| Search hit its computation limit | Search not fully completed | Reduce courses / lock some activities and retry |

**An incomplete search must never be reported as "no feasible timetable."**

First-version infeasibility-repair flow: for each hard constraint the user added, remove it one at a time and re-solve. Only generate the corresponding suggestion if doing so restores a feasible solution.

Example copy:

> The locked Studio session is Wednesday 15:30–17:00, which overlaps with your research time 13:00–18:00.
>
> Unlock the Studio session → restores 18 combinations.
>
> Allow classes Wednesday afternoon → restores 27 combinations.

The numbers above are a copy-formatting example; the actual values must come from a fresh computation on the current data and must never be hardcoded in the implementation.

After the user clicks a suggestion, the corresponding constraint is updated, showing "Studio lock removed" and "Undo." If no single adjustment can restore a solution, just say "multiple constraints need to change together"; Crit 7 does not promise to find the minimal set of changes.

## 8. Other states and specific copy

| State | Copy / behavior |
|---|---|
| No courses selected | Start by adding a course. |
| Generating | Comparing section combinations…; existing results marked as updating |
| Constraints changed, old results not yet updated | Mark old results as stale, disable save temporarily |
| Only one solution | Only one feasible arrangement exists under the current constraints. |
| A preference can't be improved further | Every feasible plan includes this fixed early class. Use only after verification |
| Saving | Saving… |
| Save failed | Not saved yet — your changes are still on this page. |
| Plan version conflict | Another tab has modified this plan. You can reload or save this page as a new plan. |
| Dataset is outdated | This plan was saved against an older data version; you can view the original plan or replan with the new data. |
| Not your plan | Plan not found. Return to your own plan list |
| Real seat availability unknown | The timing is feasible; enrollment eligibility and seat availability must be verified in MyTimetable. |

Error messages should appear near the relevant control or result area, and use status hints that assistive technology can read.

## 9. Domain model for time and activities

The school's scheduling units need to be represented correctly before the algorithm means anything.

### 9.1 Four-level relationship

Course offering → required activity group → selectable option → actual occurrence.

For example, one course:

- Lecture A: mandatory, has one section.
- Lecture B: mandatory, has one section.
- Tutorial A: three selectable sections, choose one.
- A particular Lab section: contains two lab sessions, Tuesday and Thursday, which must be chosen together.

An option can contain multiple occurrences. This prevents choosing only half of the same lab.

### 9.2 First-version time representation

- Date: local calendar date `YYYY-MM-DD`.
- Time: integer minutes since local midnight.
- Timezone: `Australia/Sydney`; Canberra follows the same timezone rules relevant to this project as Sydney.
- Interval: half-open `[start, end)`.
- Course meetings are only compared for overlap on the same actual date.

10:00–11:00 and 11:00–12:00 do not count as a time overlap. Without walking-time data, only "no time overlap" is promised — not that there is enough time to actually walk to the next room.

### 9.3 Date coverage and fortnightly courses

The dataset explicitly records the teaching weeks it covers and their corresponding dates; the generation stage validates against the whole supported date set, while the UI only shows the week the user has selected.

Classes on the same weekday and same hour, but occurring in different weeks, can coexist. Semester breaks are determined by the dataset's dates — Week 7 must not simply be computed as the seventh calendar week after semester start.

**Single-week fallback mode:** if multi-week data hasn't been verified, a version clearly labeled "only checked for one specific week" may be released instead; the title, metrics, and saved data must all carry that week's range, and it must not claim the whole semester is conflict-free. If a single-week prototype is built first, this labeling must also be used.

### 9.4 Activity eligibility and unsupported rules

Every option may record an `eligibility_note` and `availability_status`. "Unknown" in public data must not be converted into "assignable"; a section that is known to be closed to the current dataset's target population is not entered into the candidate pool.

Cross-group stream linkages, co-taught shared sessions, roster-forced grouping, and similar rules need to be modeled explicitly. The Crit dataset should preferentially pick courses without these rules; where unavoidable, bundle the jointly-required activities into a single composite option and have a human verify it.

Synchronous online classes also occupy time; asynchronous materials do not have a fabricated time. The recommended first-version dataset uses in-person synchronous activities so that "days on campus" has an unambiguous meaning; once online activities are added, they must be handled per the definitions in the next section.

## 10. Metric contract: how every number is computed

All metrics are recomputed by the server from the final selected occurrences. The frontend must never submit a total score for the backend to simply trust.

Let W be the set of supported teaching weeks. Compute per week, then take the sum divided by |W|; ranking compares integer sums, and rounding only happens at display time.

| Metric | Precise definition | Display |
|---|---|---|
| Days on campus | Number of dates per week with at least one in-person class | Whole number for a single week; average to one decimal place across multiple weeks |
| Gaps between classes | Sum of the non-negative time differences between adjacent synchronous classes each day, sorted by time | Minutes / teaching week; detail view can convert to hours and minutes |
| Number of early classes | Count of synchronous occurrences whose start time is strictly less than the threshold | Sessions / teaching week; threshold defaults to 10:00 |
| Earliest start time | Earliest class start time in the week currently being viewed | Supplementary note, not used as an independent sort goal |
| Latest end time | Latest class end time in the week currently being viewed | Supplementary note |

Additional rules:

- A day with only one class has zero gap for that day; time before the first class and after the last class does not count as a gap.
- A day with no classes does not add to the gap total.
- School classes and personal commitments have different semantics — personal commitments do not count as early classes, nor do they automatically offset the gap total.
- Synchronous online classes participate in conflict checking and gap calculations, but do not add to days-on-campus.
- Data for which the mode of delivery is unknown must be filled in, or the metric renamed to "days with classes" — it must not be guessed as in-person.
- Multi-week aggregation always uses the teaching weeks explicitly listed in the dataset; it must not be inferred from the currently displayed week.

## 11. Solving, ranking, and explaining results

### 11.1 Small-scale exact solving

Recommended approach: implement backtracking enumeration as pure TypeScript functions. With 4 courses, 2 activity groups per course that have choices, and 3 options per group, the raw combination count is 3^8 = 6,561 — this illustrates that exact enumeration is feasible at small scale, not that production performance has been measured.

Procedure:

1. Validate the dataset, the selected course list, personal commitments, and lock references.
2. Aggregate all required activity groups.
3. For each group, keep only the options that satisfy its locks, eligibility, and personal time constraints.
4. Precompute occurrence conflicts for option pairs.
5. Process groups with the fewest options first.
6. Depth-first selection, stopping the current branch immediately on conflict.
7. For every complete feasible combination, compute metrics, an activity signature, and explanatory evidence.
8. Rank and select distinct representative plans.

A supported fixed activity is a group with only one option, and it still participates in solving. The algorithm must not omit a required activity just to reduce conflicts.

### 11.2 Compute budget

For the Crit target dataset, recommend keeping the raw combination count under 50,000 and at most 200,000 expanded nodes per search. The exact values must be determined by measuring on the Fly instance; the above are initial suggested caps.

Also set a time limit for solving. The response includes `complete`:

- Search completed with 0 solutions: infeasibility repair can proceed.
- Search completed with solutions: it may be claimed that all combinations within the currently supported scope have been enumerated.
- Search interrupted with solutions found: show the partial plans found; do not claim global optimality or a total count.
- Search interrupted with 0 solutions: show that the check is not yet complete.

Plans that have been fully verified but come from a partial search may still be saved; saving re-verifies feasibility, and the result card does not call it globally optimal.

Limit the number of courses, personal time blocks, and occurrences per input request, to avoid a single solve request tying up the site's only server for a long time.

### 11.3 Ranking rules

The first version uses lexicographic order, with the primary metric taking priority and secondary metrics used only to break ties:

| User's choice | Order |
|---|---|
| Fewest days on campus | Days on campus → gaps between classes → number of early classes → stable activity signature |
| Fewest gaps | Gaps between classes → days on campus → number of early classes → stable activity signature |
| Fewest early classes | Number of early classes → days on campus → gaps between classes → stable activity signature |

The trade-off is explicit: in "fewest days on campus" mode, reducing one day takes priority over reducing any amount of gap time. Other representative plans let the user see the cost of that. If later user research shows this priority is too strong, an interpretable weighting can be added.

### 11.4 Up to three representative plans

1. Must include the current primary sort's top result.
2. Then consider the top result of the other two sort orders.
3. Deduplicate by the option-ID set; if three representative plans have identical metrics on all three dimensions, merge their summaries.
4. If slots remain, pick from the non-dominated solutions those with different metrics and changed sections.
5. If there isn't enough difference, show fewer cards; a "view other combinations" follow-up entry point is enough.

Meaning of non-dominated: no other plan is at least as good on all three metrics and strictly better on at least one. It's used to narrow the comparison panel — it does not mean other plans have no value on preferences the user hasn't stated.

In the small first-version dataset, metrics can be compared pairwise directly; optimize this only once the data grows, to avoid introducing a solver dependency prematurely.

### 11.5 Reasoning must be backed by evidence

`same_primary_lower_secondary`: primary metric is the same, secondary metric is lower.

`tradeoff`: relative to the specified plan, one fewer day on campus, 90 more minutes of gaps.

`forced_meeting`: an occurrence that appears in every feasible solution. Only writable as "unavoidable" after a full enumeration.

`blocked_option`: the actual date and overlapping interval between an option and a personal time block.

`restored_by_relaxation`: the number of plans obtained from a full re-solve after removing one specific constraint.

Do not directly treat the number of branches pruned by DFS as "how many complete plans this constraint excluded," and do not claim that counts from multiple reasons can be added together.

### 11.6 A stable state model for constraint changes

Generation requests carry a locally incrementing `requestSequence`. Only the latest request may update the display; earlier responses that arrive later are discarded.

Once a constraint changes, clear the "current changes saved" status while keeping the most recently saved server version. Save is disabled while old results are being updated.

If the previously selected plan is still feasible, it may be kept while noting that a new sort-order top choice exists; on first generation and whenever the user actively changes the primary sort order, the new top choice is selected by default. This behavior is fixed by frontend tests.

## 12. Data sourcing and preparation plan

### 12.1 Boundary between verified and unverified

The official Web Publisher 2026 page has been opened, confirming it offers course search and teaching-activity viewing. [S5]

This reading of the public page did not obtain the complete actual activity data for your courses, nor did it confirm a directly-dependable official public JSON API. So the implementation plan takes a manually curated small-scale dataset as the executable path, and does not treat scraper success as a launch precondition.

### 12.2 Data acquisition order

1. In the official Web Publisher, select the current semester and your own courses.
2. Check all options by activity group, verifying date ranges, class times, locations, and restriction notes.
3. Organize the data into versioned JSON; if a PDF export is used, manually verify the parsed result item by item.
4. Supplement with required-activity notes from course websites, to ensure the count of required groups is correct.
5. Load the curated data into SQLite via a one-off seed/import script.

The first version does not let ordinary students upload arbitrary course JSON or edit backend data, to reduce UI work unrelated to the core task.

### 12.3 Manifest per dataset

Must include: `datasetId`, `version`, `kind: verified | synthetic`, semester, timezone, coverage dates, list of teaching-week start dates, source URL, verification timestamp, verifier, applicable courses/population, known limitations, content hash.

Each option keeps its original activity identifier and source note. An unknown location shows "not provided" — never invent a room.

Mixing synthetic data into a real dataset would confuse the trustworthiness of the result, so the two kinds of dataset are kept separate.

### 12.4 Import quality checks

- IDs are unique and every foreign key resolves.
- Every course's required activity groups are non-empty.
- Every activity group has at least one option; every option has at least one valid occurrence.
- Occurrence dates belong to the coverage set, and times are valid.
- Multiple occurrences within the same option don't conflict with each other, unless explicitly modeled as the same shared activity.
- Multi-part activities must be included in full.
- Locks only reference activity groups within the current course.
- Unrecognized cross-group restrictions prevent that course from being marked as supported.

### 12.5 Frozen version

Freeze one dataset version before the Crit; saved plans reference that version. Updating course data creates a new version; already-saved plans can still be opened fully against the old data.

There's no need to implement smart migration after automatic updates for Crit 7. Providing "replan with new data" is enough, with the user actively confirming their new selections.

## 13. Database design

The following is the recommended logical schema; the concrete Drizzle definitions must match the version already installed in the repository.

| Table | Key fields | Constraint / purpose |
|---|---|---|
| `datasets` | id, version, kind, term, timezone, covered_dates_json, teaching_weeks_json, source_manifest_json, content_hash | Content version is immutable; JSON must pass schema validation |
| `offerings` | id, dataset_id, course_code, title | Course code is unique within the same dataset |
| `activity_groups` | id, offering_id, label, type | Each group requires exactly one option |
| `options` | id, group_id, external_label, eligibility_note, mode | Describes a selectable section |
| `occurrences` | id, option_id, date, start_minute, end_minute, location | Time-range checks; indexed by option_id and date |
| `sessions` | id, token_hash, created_at, expires_at | Anonymous browser identity; a random token goes in the cookie |
| `plans` | id, session_id, dataset_id, name, preference_json, revision, created_at, updated_at | Ownership check; optimistic concurrency via revision |
| `plan_courses` | plan_id, offering_id | Composite primary key; records the complete set of chosen courses |
| `plan_selections` | plan_id, group_id, option_id, is_locked | Unique per plan per group; stores the full option and lock state |
| `commitments` | id, plan_id, label, weekday, start_minute, end_minute, applies_dates_json | Stores the personal hard constraints used at generation time |

Ten small tables total, determined by the actual relationships. No microservices, message queue, or separate recommendation service are needed.

### 13.1 Cross-table relationships that must be guaranteed

- Courses in plan_courses must belong to plan.dataset_id.
- The group in plan_selections must belong to a course chosen by that plan.
- The option must belong to its corresponding group.
- A completed saved plan must cover every required group of the selected courses, exactly one option per group.
- Deleting a dataset must not cascade-delete saved plans; published datasets are retained.

Whatever can be expressed via foreign keys, unique constraints, or composite keys is left to SQLite; everything else is checked within the same server-side transaction. Enable foreign-key constraints, and test that invalid writes are rejected.

### 13.2 Save transaction

1. Parse identity from the cookie, validate the request origin and input structure.
2. Load the server-side dataset and option references.
3. Re-validate the entire course structure, conflicts, personal constraints, and locks.
4. A new plan uses a client-pregenerated UUID as its resource ID; an existing plan checks `revision`.
5. Write the plan, courses, selections, and personal commitments within a single transaction.
6. On successful commit, return the new revision and a server-computed summary.

A repeated "create new" request with the same UUID: same identity and same content returns the already-created result; different content returns a conflict. If the first request succeeds but the response is lost, this must not result in two duplicate plans being created.

### 13.3 Anonymous identity

Use a sufficiently random persistent cookie; the server only stores the hash of the token. In production, set the cookie HttpOnly, Secure, SameSite=Lax, with a recommended 90-day lifetime.

Every plan query, modification, and deletion must be constrained on both plan ID and session ID simultaneously. A hard-to-guess plan UUID alone must not be treated as sufficient security. Cross-browser sync belongs to the later account feature.

Deletion uses a plain confirmation or an undoable design, to avoid accidentally deleting the only plan with a single click; a clear confirmation dialog is acceptable for the first version. No registration email is needed.

## 14. API contract

REST-style endpoints are recommended; build on the starter's existing server capabilities rather than introducing another backend framework just for these endpoints.

| Method and path | Input | Output |
|---|---|---|
| `GET /api/datasets` | none | Summary of supported datasets |
| `GET /api/datasets/:id/courses` | Optional search string | Course and group summaries |
| `POST /api/solve` | datasetId, offeringIds, commitments, pins, preferences, requestSequence | complete, feasibleCount, representatives, metrics, explanations |
| `POST /api/repair` | Same constraints as solve | Verified single-constraint change and resulting count |
| `GET /api/plans` | Cookie identity | Plan list for the current identity |
| `PUT /api/plans/:uuid` | New: expectedRevision=0; edit: current revision; full plan content | Saved plan and new revision |
| `GET /api/plans/:uuid` | Cookie identity | Full plan and its original dataset version |
| `DELETE /api/plans/:uuid` | expectedRevision | Delete success or version conflict |

solve's `feasibleCount` only represents a total when `complete=true`; when interrupted, use `foundCount` instead.

Generation returns option IDs and occurrence info sufficient for rendering, not the entire school dataset. The backend does not accept a client's claim that some option has no conflict, is assignable, or has passed eligibility checks.

Unified error format: `{ code, message, fieldErrors?, requestId }`. Error codes must cover at least `INVALID_INPUT`, `UNSUPPORTED_DATA`, `VERSION_CONFLICT`, `NOT_FOUND`, `SEARCH_LIMIT`.

Synchronous requests target under one second; exact figures should be measured on the small dataset and the deployed instance. When the network is slow, updating status and request-ordering protection must still hold.

## 15. Frontend and module boundaries

Keep Astro + starter backend + Drizzle + SQLite. If React/Svelte or similar component integration already exists, reuse it; if not, a small amount of TypeScript can manage interactions — don't stack an extra state-management framework onto the planner page just for this.

Suggested module responsibilities:

| Module | Responsibility | Should not own |
|---|---|---|
| Data validation | JSON schema, activity structure, and coverage-date checks | UI rendering |
| Time utilities | Date equality, minute intervals, week membership | Database queries |
| Solver | Takes validated input, outputs feasible combinations | Cookies, HTTP, HTML |
| Metrics and ranking | Numeric values, stable sort, representative plans | Random recommendations |
| Explainer | Maps evidence to copy structure | Making up scheduling reasons on its own |
| Plan service | Ownership, transactions, versioning, validation | Calendar layout |
| Pages and components | Constraint input, comparison, timetable, save | Duplicating the algorithm itself |

The suggested directory layout is for discussion only; check the actual repository before implementing:

```text
src/lib/timetable/{types,validate,time,solve,metrics,rank,explain}.ts
src/lib/server/{session,plan-service,dataset-service}.ts
src/components/planner/{Controls,PlanCards,WeekGrid,DayAgenda,SaveBar}.*
src/pages/api/...
src/pages/{index,plans,about-data,readme}...
data/timetable/<dataset-version>.json
spec/{planner,persistence,ownership}.test.ts
```

Export pure functions from the same shared solver module for unit testing; actual saves are still re-verified by the server. Check the starter's existing schema, migrations, and identity capabilities first, and reuse them where possible.

## 16. Visual and interaction spec

### 16.1 Overall style

A quiet, clear study-tool style: light warm background, dark green as the primary text and action color, low-saturation course colors. Color helps track course identity, and does not indicate course quality. If a dark appearance is supported, verify text contrast separately.

Use English in the main UI to make it easier for crit classmates to try; copy choices should be finalized on the first day of implementation. This document uses Chinese to explain the design, but the product UI's English copy should be settled before work begins, with the brand name kept in English.

### 16.2 Typography and density

Body text 14–16px, secondary text at least 12px, touch targets around 44px on touchscreens. Times and metrics use tabular (monospace) numerals. Headings are moderately large, leaving the main area for the weekly timetable.

A class block must show: course code, start time, activity type. Clicking it shows end time, date, location, other sections, and lock status — not everything crammed into one 45-minute-tall block.

### 16.3 Action feedback

- Changing a constraint: controls respond immediately, the result area shows an updating state.
- Switching plans: class blocks animate briefly to their new position, with accompanying text describing the difference.
- Locking: a visible lock marker and unlock action.
- Unsaved changes: the top bar / save bar shows "unsaved changes."
- Save success: shows the server-confirmed timestamp, not just a fleeting toast.

Respect `prefers-reduced-motion`. Animation is an enhancement, not the only way to understand that results have updated.

### 16.4 Accessibility

One h1 per page; nav and main landmarks present; every control has a label; activities are focusable buttons; keyboard alone can complete course selection, constraint editing, plan switching, and saving.

Information is conveyed with course code, activity name, and lock text in addition to color. Dynamic result counts use a polite live region; form errors are associated with their inputs. The weekly timetable has an equivalent day-by-day list view.

Keyboard focus is preserved across control re-renders, rather than being sent back to the top of the page every time. Closing a dialog returns focus to the button that triggered it.

## 17. Fly.io deployment and persistence

This project deploys per the user's original Fly.io target and the course starter, and does not migrate to another hosting platform. [S1]

Recommended Crit configuration: a single app process, a single Fly Machine, a single persistent volume. The SQLite file lives on the mounted volume directory, e.g. `/data/weekwise.sqlite`; the actual path follows the existing starter configuration.

Fly's own documentation states that a persistent volume is for saving data that persists on the machine; a plain SQLite file inside the deploy image cannot survive across redeploys. [S6]

Migrations need access to the mounted volume. Fly's `release_command` runs by default on a temporary machine with no persistent volume, so migrations for a local SQLite volume must not simply be placed there. Check the starter's startup script, and run idempotent migrations during the app's startup phase after the volume is mounted, before starting the server. [S7]

Deployment checks:

1. The database directory exists and is writable by the current process.
2. Schema migrations are version-tracked, so a restart doesn't repeatedly re-break data.
3. Seeding is idempotent per dataset version, and does not overwrite user plans.
4. Foreign keys are enabled; use WAL and a reasonable busy timeout where needed for small-scale concurrency.
5. Health checks pass before the app accepts traffic.
6. Create a plan, refresh to restore it; then perform a controlled process/machine restart and confirm the plan is still there.
7. Redeploy once, and confirm old plans and their datasets can still be opened.

Items 6 and 7 are this project's reliability goal, above the bare minimum of "still there after a refresh." Backups should use SQLite's consistent backup method — with WAL active, simply copying the main database file is not sufficient.

Before going live, record the actual number of Machines, to avoid multiple independent SQLite instances causing requests to land on different data copies. Open the live URL ahead of the crit to verify auto-wake and a normal response.

## 18. Near-implementation state transitions

| Current state | Action | Next state / effect |
|---|---|---|
| empty | Add a course | solving |
| ready | Change a hard constraint | solving, old result marked stale |
| solving | Latest response has a feasible solution | ready |
| solving | Full search finds no solution | no_solution |
| solving | Budget reached | incomplete |
| no_solution | Click a verified repair | Updates the corresponding constraint, enters solving |
| ready | Click save | saving |
| saving | Server transaction succeeds | saved, revision recorded |
| saving | Network / server failure | ready_dirty, input preserved |
| saved | Course or constraint changed | ready_dirty or solving |
| saved | Open an existing plan | Restored from the server, then re-validated against the original data |

Switching the representative plan also changes what's pending to be saved. The first version has no implicit autosave, to avoid a plan someone was only briefly comparing overwriting their actual choice.

## 19. Acceptance and test contract

Tests focus on behavior that could genuinely go wrong, building on the starter's existing page invariants and README checks. Whether the guestbook test is retired follows the repository's own guidance — a still-applicable test must not be deleted just to get a green check.

| ID | Scenario | Must-observe result |
|---|---|---|
| T01 | Two adjacent classes, 10–11 and 11–12 | Time check allows coexistence |
| T02 | Two classes overlap by 1 minute on the same date | Combination excluded |
| T03 | Same weekday/time but different teaching weeks | Coexistence allowed |
| T04 | A lab option contains two sessions, one of which conflicts | The whole option is excluded |
| T05 | A course has Lecture A and Lecture B | Both required groups appear in every complete result |
| T06 | A personal unavailable block partially overlaps a class | Combination excluded; touching boundaries are allowed |
| T07 | Two personal unavailable blocks overlap each other | This alone must not be used to declare the timetable infeasible |
| T08 | A valid option is locked | It appears in every result |
| T09 | A lock conflicts with a personal commitment | No solution; at least one genuinely valid repair comes from re-solving |
| T10 | No single adjustment can restore a solution | It's not claimed that any single button can fix it |
| T11 | A small set of manually enumerable combinations | The solver's complete result set matches an independent enumeration |
| T12 | Sort goal is changed | Feasible set is the same; ordering changes per the published rules |
| T13 | Same input, regenerated | Signature, order, and explanations are stable |
| T14 | Three sort orders produce the same solution | No fabricated triple of duplicate recommendations |
| T15 | Search interrupted | No display of "fully checked / no solution / global best" |
| T16 | A hand-computed metrics fixture | Days, minutes, early-class count all match exactly |
| T17 | A save request missing one required group is submitted | Server rejects it; database has no half-saved plan |
| T18 | Browser A saves, then refreshes | All selections, constraints, name, and dataset version are restored |
| T19 | Browser B guesses browser A's plan ID | Cannot read, update, or delete it |
| T20 | The same save request is sent twice | No duplicate plan is created |
| T21 | Two tabs update the same revision in sequence | The second gets a conflict; existing content is not overwritten |
| T22 | Simulated save failure | Page does not show "saved"; the user's input remains |
| T23 | Requests return out of order | Old results do not overwrite results for newer constraints |
| T24 | Server restarts / redeploys after saving | The plan can still be opened against the original data |
| T25 | 390px-wide screen and keyboard-only operation | All core actions can be completed, no overall horizontal overflow |
| T26 | Dataset contains an unsupported linkage rule or missing time | Explicitly refused / flagged unsupported, no full-feasibility claim is output |
| T27 | Deep link opens `/plans/:id/` | Content is correct after SSR / client-side initialization, no memory-only dependency |
| T28 | `pnpm check` and every registered route | Starter's applicable contract passes, including `/readme/` |

T01–T16 and T26 are mainly tested with pure-function tests; T17 and T19–T21 with service/API tests; T18, T22–T25, T27–T28 with browser or deployment checks. There's no need for a one-to-one test for every icon or style property.

### 19.1 Performance goals

On the target dataset, an ordinary constraint change should get feedback in roughly one second; record the actual solve time and combination count both locally and on Fly. Correctness first, then measurement — don't write "millisecond-level" before it's actually measured.

If the target is exceeded, prioritize reducing dataset size, precomputing conflicts, and pruning during solving. Only introduce a worker once measurement shows the main thread / server process is actually blocked.

## 20. Implementation order and realistic time budget

The following are suggested human-effort and agent-collaboration budgets, including reading results, trying things out, and fixing issues; they are not guarantees, and model runtime speed should not be treated as the entirety of development time.

| Phase | Budget | Reviewable output | Condition to move to next phase |
|---|---:|---|---|
| A. Repo review and scope freeze | 1–2h | Notes on existing stack / migrations / deployment / tests; feature list | Starter itself runs, scope is clear |
| B. Data model and one real save flow | 4–6h | A real course dataset, manually chosen plan, SQLite save/restore, first Fly verification | Refresh restores it; no data-structure gaps |
| C. Solving and metrics | 4–6h | Pure functions, hand-checked fixtures, accurate ranking | Core math contract passes |
| D. Main page and comparison experience | 4–6h | Responsive workspace, options, locking, three cards, saved list | Keyboard and phone can complete the flow |
| E. Infeasibility repair and failure states | 2–3h | Single-constraint repair, save-failure, version-conflict feedback | No misleading success / no-solution states appear |
| F. Deployment and crit evidence | 3–4h | Persistent-volume verification, pnpm check, PROCESS, reflection evidence, demo script | Evidence exists for every required contract |
| **Total** | **18–27h + a small buffer** | Complete Crit version | Assumes familiarity with the starter |

A buffer of about 20% is recommended. If actual available time is significantly less than this budget, use the scope-cutting order below — do not substitute "have the agent write faster" for verification.

### 20.1 Day-by-day schedule

Assuming a start on Saturday, September 26, 2026, with the user still in the Thursday tutorial group:

- Saturday Sep 26: main parts of A + B. Prioritize seeing an online save/restore working that day.
- Sunday Sep 27: finish B + C; independently verify the timetable numbers.
- Monday Sep 28: D; have two classmates try it and fix issues.
- Tuesday Sep 29: E + F, freeze features that evening.
- Wednesday Sep 30: only online re-checks and demo prep; aim to have final checks done before 12:00.

The official site lists the tutorial slot as Wednesday 15:30–17:00 with a 13:30 cutoff; Sep 30 is the corresponding date derived from the current Week 8 schedule — re-verify against the announcement before submitting. The Crit 7 page is still marked Draft. [S1][S2]

### 20.2 How to cut scope when time is short

Defer in this order: animations → ICS → multi-week view switching → "view all combinations" → multi-objective non-dominated-solution enhancement → single-constraint repair auto-counting.

Keep: the required activity structure for courses, accurate conflict detection, clearly stated data scope, at least one comparable sort order, backend save, refresh-restore, Fly persistence, and process evidence.

If only one week has been verified, clearly publish the single-week version; if multi-week data already exists, the week-switching UI can be simplified, but the algorithm must still check the entire covered date range.

## 21. Commits and human decision log

Suggested commits to form as work actually proceeds, not fabricated after the fact:

1. document timetable scope and data contract
2. add versioned timetable dataset and schema
3. persist a manually selected plan end to end
4. implement and verify timetable enumeration
5. add metric ranking and representative plans
6. build planner controls and week comparison
7. explain infeasible plans and tested relaxations
8. verify deployment persistence and document critique

Attach one runnable or observable result to each commit. PROCESS.md should record the real dates, the basis for inputs, your own judgment, the agent's output, specific corrections, and where the evidence lives.

Design decisions worth discussing:

- Why hard constraints must not be quietly relaxed.
- Why an option must be allowed to contain multiple sessions.
- Why the old Timetable Viewer should not be treated as the primary new data interface.
- Why a single weighted "satisfaction score" is not used.
- Why a small amount of trustworthy course data is published first.
- Why saving requires server-side re-validation.

The reflection document should record only what actually happened; this list is a set of things to observe and note, not something to be passed off directly as lived experience.

## 22. Crit demo script

Prepare a 90-second main line and a 30-second backup proof. Adjust to the actual time available for the demo.

| Time | Action | Judgment the audience should see |
|---|---|---|
| 0–12s | Show the courses and two clearly different plans | There's a real trade-off between life commitments and course combinations |
| 12–30s | Switch between "fewest days on campus" and "fewest gaps" | Every recommendation's cost can be explained |
| 30–45s | Keep half a day free, lock a conflicting section | The constraints genuinely participate in solving |
| 45–60s | Click a verified repair suggestion | The system helps the user decide the next step |
| 60–80s | Name and save, refresh, reopen | The core flow is persisted through the backend |
| 80–90s | One sentence on a real correction that happened | How you directed, grounded, and corrected |

If a synthetic fixture is used to demo the trade-off, say so in one sentence at the start; also have a real-course-data page ready to prove the connection to your own actual ANU scenario.

Pre-demo checks: the link is publicly reachable, the service is awake, the sample has at least two distinct metric combinations, saved plan names are distinguishable, and the timetable data label is clear.

Evidence of persistence across a backend restart can be prepared ahead of time — it doesn't need to be done live while the whole group waits for a deploy. A screen recording can serve as a backup, but it does not replace the requirement of a live URL.

## 23. Later enhancements, ranked by value

| Rank | Enhancement | Precondition | Main benefit |
|---|---|---|---|
| 1 | Diff against the student's current actual timetable | Student confirms their existing activities | Clearly shows which sections to change to get the new plan |
| 2 | Preview of each option's impact per group | Small, complete solution set | See how many feasible combinations would be lost before clicking |
| 3 | ICS download | Date, timezone, UID, and update rules verified | Bring the chosen plan into a personal calendar |
| 4 | Two-constraint combined repair | Single-constraint repair stable, search budget set | Handle more complex infeasible cases |
| 5 | Configurable transition buffer | User can specify a buffer; map estimate has a basis | Reduce back-to-back class pressure |
| 6 | Login and cross-device sync | Real user need, account-flow budget | Long-term retention of plans across multiple semesters |
| 7 | More courses and ongoing updates | Stable data-acquisition method and a maintainer | Broaden applicable scope |

The first step for walking time can be a user-defined uniform buffer, e.g. 10 minutes, explicitly called "reserved transition time" — a number without a real basis must not be called actual walking time. After adding a buffer, T01's time-overlap definition stays unchanged; a separate transition-constraint test is added.

ICS must handle `Australia/Sydney` daylight saving, correct activity dates, stable UIDs, and escaping; this is not something to hastily string-build in the last half hour before delivery.

## 24. Execution contract handoff for a coding agent

The following can serve as a task opener; hand this document and the existing Crit spec to the agent together.

> Implement Weekwise in the current Crit 7 repository, following this product spec. First read AGENTS.md, README, package.json, the database schema/migrations, Fly config, PROCESS.md, and spec/README.md, to confirm what the starter already provides. Preserve the existing hosting target, tech stack, course test contract, and any uncommitted user changes.
>
> First complete and deploy one flow — course data → manually chosen section → server validation → SQLite save → refresh-restore — before implementing automatic solving and UI enhancements. For each phase, give the concrete changes, how they were verified, the results, and remaining issues, then move to the next phase.
>
> Treat the offering/group/option/occurrence relationship as the domain basis; a multi-session section must be chosen as a whole, and conflicts are judged by actual date and half-open time intervals. User hard constraints must be preserved. Ranking uses the three lexicographic orders defined in this document; recommendation copy must come from computed evidence.
>
> A course whose data hasn't been fully verified must not be marked as supported. Keep real data and synthetic demo data separate. Do not assume a directly-dependable public ANU API exists; prefer already-verified versioned seed data.
>
> Save the plan, courses, sections, locks, and personal commitments within the same transaction; the server re-validates. Plans are scoped to the current anonymous browser identity, and edits check the revision; do not treat in-memory state or localStorage as the real save path.
>
> Use the starter's applicable checks, and add the key contract tests from §19. Confirm SQLite lives on the Fly persistent volume, that migrations can access that volume, and that a restart does not lose plans. Commit in real, incremental steps, recording PROCESS.md as you go. The reflection should record only judgments and corrections that actually happened.
>
> When a data, semantic, or scope conflict comes up, state the concrete evidence and use the scope-cutting order already defined in this document; do not "complete" a feature by deleting a required activity, silently relaxing a hard constraint, fabricating seat availability, or calling an incomplete search infeasible.

### 24.1 Four questions the agent should answer at each phase

1. What can the user actually accomplish right now?
2. Which rule/risk was verified, and what's the evidence?
3. What is still example data, an assumption, or unsupported?
4. Does the next phase require changing any already-confirmed product decision?

## 25. Sources and verification log

Date checked: 2026-09-26 (user's local time). The following factual summaries are used to bound the design; the remaining sections are this plan's design recommendations.

- **[S1] C7 brief/spec**: Full-stack ANU scenario, Fly address, refresh persistence and process notes; page still marked Draft. https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/07-anu-system/
- **[S2] Crits overview**: Thursday tutorial is Wednesday 15:30–17:00, cutoff 13:30; exact date depends on the teaching week. https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/
- **[S3] MyTimetable access and support**: Already has a planner, multi-plan save, activity groups, etc.; used to avoid describing existing capabilities as if they don't exist. https://www.anu.edu.au/students/program-administration/timetabling/01-access-and-support-for-mytimetable
- **[S4] Timetable Viewer / Web Publisher guidance**: Web Publisher is the official teaching-activity viewing entry point, the old Viewer is legacy; activity visibility does not mean it's open to everyone. https://www.anu.edu.au/students/program-administration/timetabling/07-anu-timetable-viewer
- **[S5] Web Publisher 2026**: Public search interface has been opened; complete actual course data was not obtained. https://mytimetable.anu.edu.au/even/timetable/
- **[S6] Fly Volumes / SQLite**: Basis for persistent-volume and SQLite placement. https://fly.io/docs/volumes/overview/ and https://fly.io/docs/rails/advanced-guides/sqlite3/
- **[S7] Fly deploy configuration**: release_command's temporary machine has no persistent volume by default. https://fly.io/docs/reference/configuration/#the-deploy-section

## 26. Planning completeness and implementation boundary

This round of delivery is a product and implementation plan. Verification has been completed for official requirements, existing system capabilities, data access, and Fly persistence limits; user flows, scheduling semantics, states, interfaces, schema, development order, and acceptance contracts have all been concretely defined.

This document does not claim that complete real course data has been obtained, that the existing repository has been inspected, that the backend has been implemented, that app tests have been run, or that deployment has been completed. §19 is the acceptance requirement for future implementation, §20 is a budget estimate — neither should be read as something that has already happened.

Before starting development, it's recommended to freeze the default decisions in §27, then correct them against two sets of facts: the actual structure of the existing starter, and the real activity rules of your own courses. If the facts don't match the plan, prioritize fixing the plan's assumptions and record why.

This round does not need product code written ahead of time just to prove the plan is detailed; the next development task can be broken down directly from §24.

## 27. Frozen decisions and remaining inputs needed

Decisions that can be adopted directly:

- The Weekwise name and the life-commitments-first product positioning.
- Astro/starter backend, Drizzle, SQLite, Fly.
- Small dataset, exact solving, explicit ranking, single-constraint repair.
- Versioned data, modeled by activity group and multi-session sections.
- Anonymous browser identity, explicit save, revision-based overwrite protection.
- Up to three distinct representative plans, day-by-day list on mobile.

Facts still needed before implementation:

| Input | Why it's needed | Minimal way to obtain it |
|---|---|---|
| Current repository and branch | Avoid rebuilding existing features or overwriting uncommitted work | Agent reads the current checkout directly |
| The 3–4 courses you'll demo | Real ANU scenario and data preparation | Your own selected course list |
| Complete activity data for the courses | Determines the algorithm's actual input | Web Publisher export / manual compilation and verification |
| Actual time available | Determines whether the full Crit target or a reduced version is used | Choose against §20 |
| At least one real personal pain point | Gives the design and reflection a factual basis | A brief description or a past scheduling example |

These inputs don't prevent implementing the domain model, save service, solver, and UI against a synthetic fixture. Real course-data support must be filled in before recommending real courses is publicly released.
