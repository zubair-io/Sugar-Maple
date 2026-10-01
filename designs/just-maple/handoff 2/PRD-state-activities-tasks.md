# Just Maple: State, Activities, and Tasks

Engineering handoff · Version 1.0 · September 22, 2026

Status: proposed MVP product specification, ready for engineering review and estimation. This document defines intended behavior; it does not assert that the application or integrations are implemented.

Design source: [Just Maple.syrup](Just%20Maple.syrup/), a verified snapshot of the open document saved in the user's Documents folder. Navigation and scenario coverage: [design handoff](DESIGN-HANDOFF.md). Machine-readable identifiers and verification evidence are supplied alongside this document.

## 1. Product decision

Just Maple is a live, explainable representation of a person's world. It answers three questions: what is true now, what changed, and what needs attention?

Separate three concepts that were previously overloaded into “Jobs to Be Done”:

| Concept | Question | Example | Product behavior |
| --- | --- | --- | --- |
| State | What is true right now? | Zubair is home; Job Search is offer accepted | Evidence-backed, time-bounded claims about an entity |
| Activity | What is going on in my life? | Family, Work, House, Job Search, Plan Italy Trip | An entity that connects state, people, documents, events, and tasks |
| Task | What needs to happen? | Take kids to soccer practice | A concrete action with status, responsibility, timing, and context |
| History | What changed? | Location changed Away → Home | An ordered record of events and decisions, not current state |

“Activities” is the UI label. Do not expose “Jobs” as a navigation category. A job search is one possible activity. “Take kids to soccer practice” is a task associated with Family, not an activity. The Me state property “current activity” means an immediate behavior such as working or getting kids ready; it is not an Activity entity.

Tasks and activities have a many-to-many relationship. “Tell current manager my last day” can be associated with Job Search and Work. A task appears in both activity views but remains one task with one status and one history. Tags reference Activity IDs, not independent strings or exclusive parent projects.

## 2. Goals, scope, and non-goals

### Goals

- Make Home calm when nothing requires intervention and useful when something does.
- Let a user understand, correct, and trust state without a separate memory-management screen.
- Organize concrete actions across persistent areas and temporary pursuits without a rigid hierarchy.
- Preserve evidence, provenance, and user control through task extraction and state inference.
- Use context to decide when to surface an action without silently dropping responsibilities.

### MVP scope

Desktop experience with Overview, Tasks, Activities, the six domain state views (Me, People, Home, Work, Schedule, Health), and History. Activities replaces the former Jobs destination and remains an entity-oriented view with its own states. Retain Notebooks and Connections as supporting destinations.

MVP includes manual activity/task management, many-to-many task associations, recurring task occurrences, read models for current state, evidence inspection and correction, review-first task suggestions, and an in-app attention queue. Health has an explicit off/not-enabled state and permission boundary; collecting health measurements is not required for this release.

Initial automated extraction can use one supported email connector plus one calendar connector. Engineering must confirm their actual availability; mock design data is not evidence of an integration. Home Assistant and device presence can be staged independently. Unsupported sources remain disconnected/unknown, and their absence must not block manual Tasks and Activities.

### Not in MVP

- Autonomous emails, offer responses, bookings, calendar changes, or contact with other people.
- Automatically accepting tasks solely because confidence is high.
- Team project management, relationship scores, arbitrary workflow builders, or nested activity hierarchies.
- Health diagnosis, medication inference, or automatic collection of sensitive health data.
- A new notebook editor, full search implementation, or changes to onboarding unrelated to these concepts.
- Guaranteed background/push notifications. The MVP attention surface is in-app; push delivery requires a separate platform and permission decision.

## 3. User stories

1. As a user, I can see my current context and the few tasks that matter without scanning service dashboards.
2. I can create Family as an ongoing area and Job Search as a temporary pursuit, each with its own state.
3. I can associate a pediatrician task with both Family and Health, then complete it once from either activity.
4. I can open a state, see its sources and freshness, and correct it with an explicit scope.
5. I can review an extracted task, adjust it, accept it, or reject it without granting permission for external action.
6. I can complete today's soccer task without completing Family or ending the weekly routine.
7. If I am traveling, Maple can ask who is covering school drop-off rather than blindly telling me to leave or silently deleting the task.

## 4. Information architecture and screen requirements

Primary navigation: Overview, Tasks, Activities. Under Your World: Me, People, Home, Work, Schedule, Health. Supporting navigation: History, Notebooks, Connections. “Overview” distinguishes the landing page from the physical-home domain.

### 4.1 Overview

Three primary layers:

1. Right now: compact natural-language synthesis of fresh state. Immediate behavior, location, availability, home condition, and next event are examples, not mandatory populated fields.
2. Needs your attention: actionable tasks and exceptional events derived from current context. Each item shows its reason, time relevance, and activity associations. Suggested tasks are visibly separate from accepted tasks.
3. Activities: persistent areas and pursuits, each showing useful state and unique open-task count. Include a link to all tasks, not a dense metrics dashboard.

Recent changes are subordinate and link to History. Health information must not leak into synthesis or previews without permission. First-day Home shows unknown context, no invented normal state, and paths to add an activity, add a task, or connect sources.

Attention items must explain why they appear. Routine normal state is quiet; a change is visible; a decision or responsibility needing intervention is prominent. Do not promote every state change to an alert. Non-task events such as a moved dinner remain events unless the user creates or accepts a concrete action.

### 4.2 Activities index and details

Display ongoing areas and current pursuits as light groupings, not a heavy taxonomy. Store `kind = area | pursuit`; a user may change the classification without losing associations. Example areas: Family, Work, House, Fitness. Example pursuits: Job Search, Plan Italy Trip.

Each summary includes name, meaningful current state, and unique nonterminal task count. Each detail includes purpose/outcome, lifecycle, current state with evidence entry, associated tasks, relevant people, documents, events, and history. Use empty states instead of invented related records.

An ongoing area does not need a goal or completion date. A pursuit may complete or pause. Completing or archiving an activity never automatically completes its tasks. Activity removal is recoverable archival in MVP; existing task associations remain visible and can be removed explicitly.

The Health activity tag is an Activity entity describing context. The Health navigation lens is a state projection. Equal display names do not make these the same object. Associating a task with a Health activity does not grant permission to access health sources.

### 4.3 Tasks index and details

Default list contains unique accepted, nonterminal tasks, sorted by actionable due time, then user priority, then creation time. Provide All open, Today, Upcoming, Suggested, Completed, and activity filters. A task matching several selected activities appears once; multiple-activity filtering uses OR by default and states that behavior in the UI.

Today includes overdue tasks, today's dated tasks, and tasks the user explicitly scheduled for today. Upcoming includes future-dated tasks. Undated open tasks remain in All open. Date-only due values are not converted to arbitrary timestamps in the UI.

Task details contain title, optional description, Activity associations, responsible person, when, where, related people, status, relevance conditions, recurrence if present, sources, and task history. Provide Edit, Complete, Reopen, Cancel, and reminder snooze where relevant. Changing responsibility records an assignment; it must not notify the assignee without a separately authorized action.

Task editing supports multiple activity associations and zero associations. An untagged task remains accessible rather than forcing organization before capture. Retagging does not duplicate the task. New task suggestions can prefill fields, but editable extracted fields remain visibly proposed until accepted.

### 4.4 Domain state views

| Lens | Initial properties | Constraints |
| --- | --- | --- |
| Me | Presence, immediate behavior, availability, social context, travel, focus | Unknown is valid; `currentBehavior` is separate from Activity entities |
| People | Relationship, interaction recency, relevant upcoming events, commitments | No relationship scores; do not infer someone else's current location without evidence |
| Home | Occupancy, mode, security, climate; expand to devices/maintenance as sources exist | “Normal” requires fresh evidence for the named scope; never implies all unseen systems are healthy |
| Work | Employment, role, current projects, responsibilities/open loops | Professional state; Work Activity associations organize related tasks |
| Schedule | Now/next, upcoming events, pressure, conflicts, preparation | Events are not automatically tasks; calculate with timezone-aware times |
| Health | Not enabled in MVP; permission and sharing controls | No inferred health values from absent data; show what is not connected |

State lenses are projections over claims, not six independent service dashboards or giant editable JSON blobs. The same claim may be presented in multiple places without being copied.

### 4.5 State inspector and correction

Click a state to see value, epistemic status (observed/inferred/user-confirmed), confidence where applicable, effective period, evidence, source freshness, and why it was selected. Offer “This is wrong” and Edit.

A correction captures value, effective start, and expiration/scope. Changing a temporary behavior must not permanently pin “Resting.” A suggested default is “for now,” with a visible duration or end condition. Durable relationships may remain in effect until changed. Log the correction, preserve prior evidence, and recompute affected projections.

### 4.6 Suggestions and context mismatches

Suggestion review shows proposed action, proposed activities, due date, relevant person, source excerpt/link, extraction confidence, and duplicate warning if applicable. Controls: Add task, Edit first, Not a task. Acceptance creates one task; rejection creates none. Both decisions are undoable where safe and auditable.

Context mismatch is a separate presentation of an open task: show the contradictory state and ask the user to confirm responsibility or adjust the task. Example: Airport + Vacation versus a task requiring the user to take kids to school. Do not change task status based solely on location. Keep a user-set due time visible even if a routine reminder is withheld.

## 5. Domain model and invariants

Storage technology is an engineering decision. The following logical contract is required regardless of tables, documents, or graph implementation.

| Record | Required fields and meaning |
| --- | --- |
| Entity | `id`, `ownerId`, `type`, display name, created/updated timestamps, version; typed references for person, place, activity, event, document, etc. |
| Activity | Entity ID, name, optional purpose, `kind: area|pursuit`, `lifecycle: active|paused|completed|archived`, timestamps, version |
| StateClaim | ID, owner, subject entity ID, property key, typed value, origin, confidence if inferred, evidence refs, observed/ingested times, valid interval, supersession and correction metadata |
| Task | ID, owner, title, optional description, status, assignee nullable, due specification nullable, scheduled window nullable, place/person references, priority, relevance conditions, recurrence occurrence reference nullable, evidence refs, timestamps/version |
| TaskActivity | Unique `(taskId, activityId)` association, origin, createdAt; no exclusive parent field |
| TaskSeries | ID, owner, template, recurrence rule, local timezone, start/end bounds, paused flag, version |
| TaskOccurrence | Stable series + occurrence key, task ID, original scheduled local time, override/cancellation/completion fields |
| TaskSuggestion | ID, owner, candidate fields, field-level evidence/confidence, source identity/version, dedup fingerprint, review status, accepted task ID nullable, timestamps/version |
| Evidence | ID, connector/source identity, external record ID/version, original event time, fetched time, permissions, safe source reference and minimum retained excerpt |
| AttentionItem | Derived ID, referenced task/event/suggestion, reason codes, evidence/state revision, severity, relevance window, acknowledgment/snooze; not a domain state group |
| HistoryEvent | ID, owner, subject IDs, event type, effective time, recorded time, actor/origin, before/after refs, correlation ID |
| SourceHealth | Connector ID, authorization status, last successful sync, last event time, failure/retry status, freshness policy |

Invariants:

- An Activity is not a Task. Completing one task never completes its tagged activities.
- Activity lifecycle is separate from descriptive state: Job Search may be `active` while its state is `Offer accepted`.
- A task has one authoritative status; all views and counts derive from it.
- Suggested tasks are not included in open-task counts until accepted.
- A global count is distinct task IDs. Activity counts can overlap and must not be summed into a global total.
- A connector event is evidence, not authority to perform an external action.
- References must remain owner-scoped. No cross-user joins, leaked excerpts, or metadata-only count leaks.
- State projections are derived; they can be rebuilt from claims and retained history without treating cached prose as truth.

### Task status transitions

`open ↔ in_progress ↔ waiting`; any nonterminal status may transition to `completed` or `cancelled`. Complete stores `completedAt` and actor; Reopen clears terminal presentation and writes an explicit event rather than deleting history. Waiting requires a waiting reason or related person where known. Overdue and snoozed are derived/reminder attributes, not completion states.

### Suggestion transitions

`pending → accepted | rejected | expired`. Accept atomically records the linked task and review decision. Repeated acceptance of the same suggestion returns that task, never another copy. Undo rejection returns to pending if the source and permissions are still valid. Undo acceptance must not silently delete a task someone has edited; confirm removal or detach the suggestion association.

### Time and recurrence

Store absolute instants in UTC plus original timezone/offset where relevant. Preserve date-only due dates and their interpretation timezone. Store recurring schedules in local calendar time with an IANA timezone so daylight-saving transitions do not shift a 7:45 AM routine by an hour.

Materialize occurrences idempotently using a unique series + original scheduled occurrence key. Completing today's occurrence affects only today. Offer “this occurrence” versus “this and future occurrences” for changes. A skipped occurrence is an explicit cancelled/skipped event, not completed. Travel must not automatically rewrite the series timezone. Engineering must select a recurrence library and define ambiguous/nonexistent local-time policy before shipping recurrence.

## 6. State resolution and correction rules

Each property has a catalog entry specifying type, allowed values, freshness policy, sensitivity, and resolution policy. Begin with the properties in section 4.4; the schema remains extensible without making every unknown property inference-eligible.

Resolution order:

1. Exclude inaccessible, retracted, out-of-validity, or expired candidates. Retain explainable references subject to retention policy.
2. Apply a still-valid user correction for the same subject/property and scope.
3. Apply the property-specific resolution policy to eligible direct observations and inferences; do not universally choose newest ingestion time or highest numeric confidence.
4. If incompatible credible claims cannot be resolved, show uncertain/conflicting rather than inventing consensus.
5. If no eligible claim exists, show unknown. Retain a clearly labeled “last known” value only when useful.

For a temporary correction, an expiration or explicit superseding action ends precedence; new inference must not immediately overwrite a valid correction. If new evidence strongly conflicts with an authoritative correction, surface a review prompt. Changes to source permissions trigger recomputation and removal of unauthorized content from synthesized summaries.

Freshness is property-specific, not one global TTL. Suggested initial policies for engineering validation: presence/current behavior expire after 15 minutes without renewal; home operational observations after 5 minutes; calendar completeness becomes uncertain after 30 minutes without successful sync; user-confirmed relationships persist until superseded or explicitly expired. These are tunable product defaults, not measured guarantees. History timestamps remain factual even when a current-state claim becomes stale.

An activity's durable milestone may remain valid until superseded even when its email connector disconnects. Display the source's stale/disconnected status separately. Distinguish “we lack new evidence” from “the known offer acceptance is now false.”

Confidence labels require calibrated thresholds and an explicit unknown/unavailable state. High extraction confidence is not the same as verified task relevance, source reliability, or authorization. Do not expose fabricated numerical precision.

## 7. Attention and task relevance

The relevance evaluator reads accepted task context, valid states, events, and source health and returns reason codes plus one of: relevant now, upcoming, context mismatch, uncertain, or not currently relevant. It does not own task status.

Example reason codes: `due_soon`, `overdue`, `assignee_missing`, `state_conflict`, `waiting_response`, `source_stale`, `needs_user_confirmation`. Include reason and supporting references on each attention item so the UI can explain it.

Order attention deterministically: user-prioritized/overdue responsibilities, time-sensitive due or departure items, unresolved responsibility/context conflicts, then lower-urgency decisions. Within a class use relevant time, then stable ID. Product must tune alert thresholds with real usage; the mockup's ordering is illustrative.

Rules:

- A fresh mismatch replaces an inappropriate “leave now” routine nudge with a clarification when the responsibility still matters.
- Stale location cannot justify suppressing a task. Show uncertain context; retain manual due reminders and the task in Tasks.
- Dismissing an attention card acknowledges that presentation only. It does not complete, cancel, or reject its underlying task.
- Snoozing changes the next eligible presentation time, not due date or status. Changed material evidence may create a new reason to surface; deduplicate unchanged reminders.
- Completing/cancelling a task invalidates its task-derived attention atomically or through a versioned update that cannot resurrect stale cards.
- Automatic completion of tasks or external actions is outside MVP.

Suggested pipeline: source event → evidence/knowledge updates → state claims and task candidates → current projections → attention evaluation. Reprocessing must be idempotent. Use effective event time as well as arrival time so late events do not reverse newer confirmed state incorrectly.

## 8. Task extraction and duplicate control

1. Receive a source record under a valid connector permission.
2. Normalize its external ID/version, event time, sender, participants, and timezone context.
3. Extract candidate action, deadline, person, and proposed activity associations with field-level confidence and source spans.
4. Resolve relative dates using the source's event time and timezone, not the current processing date. If ambiguous, request review rather than quietly selecting a date.
5. Deduplicate against suggestions from the same source and matching accepted tasks. Exact replays must be suppressed by unique source/extraction keys. Semantic matches show a possible-duplicate review; do not automatically merge unrelated tasks.
6. Present a pending suggestion. Add accepts once; Not a task persists a rejection for that source version/candidate so it is not offered again unchanged.
7. A materially changed deadline or request creates an update/review proposal linked to the existing task, not a silent overwrite or duplicate.

Suggested activities are proposals. If no matching Activity exists, offer create/link/no tag; do not proliferate automatically generated areas. No automatic task acceptance in MVP. Any later opt-in requires per-source policy, quality evaluation, audit/undo, and a separate approval decision.

## 9. Application boundaries and command contracts

These are logical contracts, not claims about existing endpoints. Engineering can implement RPC, REST, or local commands but must preserve the semantics.

| Operation | Input essentials | Required result |
| --- | --- | --- |
| Create/update Activity | owner context, fields, idempotency key; expected version for update | Stable entity ID, new version, validation errors |
| Create/update Task | fields, Activity IDs, timing, expected version | Task and associations committed together; canonical updated record |
| Transition Task | task/occurrence ID, transition, expected version, request key | One status event and refreshed counts/attention |
| Review suggestion | suggestion ID/version, accept/reject, edited fields, request key | Atomic decision; accepted task ID or rejection record |
| Correct state | subject/property, value, validity scope, evidence/reason, expected version | User claim, supersession info, updated projected value |
| Get overview | viewer context, as-of time | State summaries, attention reasons, unique counts, freshness and revision |
| Get activity | Activity ID, viewer context | State/evidence refs, distinct tasks, related context, history cursor |
| Get task | Task ID, viewer context | Canonical task, all associations, occurrence, evidence, relevance explanation |
| Get history | subjects, cursor, time range | Stable ordering, effective and recorded time, actor/origin |

All mutations validate ownership and association visibility. Reject stale edits with a recoverable conflict response; retain unsaved input and offer reload/merge. Use request idempotency keys for retry safety. Persist domain changes and their history/outbox atomically so derived views cannot lose a committed update. Projection responses expose revision/as-of metadata so clients discard out-of-order updates.

Read models may be cached, but Activities, Tasks, Home and History must converge on the same canonical IDs and versions. A failed write must restore optimistic state or clearly mark it unsaved; never show “saved” after failure. With connectivity loss, show cached data and its age; offline write/queued-sync support is a separate implementation decision unless already provided by the application.

## 10. Privacy, accessibility, and operational requirements

- Minimize source excerpts. Deep-link to originals where authorized; mask inaccessible/deleted sources instead of retaining plaintext in attention cards or telemetry.
- Separate consent for source access, inference, and external actions. Connecting a calendar is not permission to send invitations.
- Health is off by default. Explicitly opt in by source/category, show revocation controls, and exclude sensitive details from previews and aggregate summaries without permission.
- Source disconnection, access revocation, and user deletion must invalidate dependent caches and respect retention/deletion policy. Revocation must not leave sensitive values in generated prose. Engineering must decide physical retention versus redacted history before production.
- Do not log task titles, source excerpts, names, or health values in product analytics. Use event names, counts, opaque IDs, and reason codes with appropriate access controls.
- All lists, forms, chips, dialogs and state inspectors support keyboard navigation, visible focus, screen-reader labels, and textual status cues. Do not rely on red/green alone. Multi-select chips announce selection and removal.
- Validate text contrast against WCAG AA and support increased text size without hiding due dates or task actions. This is a release requirement, not a claim that the design artifact passed a full accessibility audit.
- Loading, empty, partial-source, disconnected, uncertain/conflict, permission-denied, save-failed and concurrent-edit states must be explicitly implemented. Preserve drafts on recoverable failure.

Proposed performance budgets to validate on a representative 1,000-task/50-activity local dataset: cached route transition under 200 ms p95; first usable Overview under 1 s p95; local mutation acknowledgment under 300 ms p95. Source sync latency is reported separately. These are targets, not measured results. Paginate history and large task lists; never block manual capture on inference or source synchronization.

## 11. Acceptance criteria

| ID | Given / when | Expected result |
| --- | --- | --- |
| AC-01 | User opens navigation | Overview, Tasks and Activities are distinct; no Jobs navigation label |
| AC-02 | User creates Family and Job Search | Family can be ongoing without a goal; Job Search can be active with state Offer accepted |
| AC-03 | One task has Family + Health tags | Appears in both activities, once in Tasks; global count increments once |
| AC-04 | User completes that task from either activity | All views show completion; both activity open counts decrement; history records one completion |
| AC-05 | User removes one association | Task and other association remain; no duplicate task is created |
| AC-06 | Task is captured without tags | It is saved and discoverable in All open |
| AC-07 | User completes today's soccer occurrence | Today is complete; next occurrence and Family remain active |
| AC-08 | A recurrence crosses daylight saving | Configured local wall time is preserved under the documented ambiguity policy |
| AC-09 | Identical source message is reprocessed | No duplicate suggestion/task; existing acceptance/rejection is respected |
| AC-10 | User clicks Add twice or retries after timeout | One accepted task ID; one review decision; counts increment once |
| AC-11 | User rejects and then undoes a suggestion | No task on reject; pending restored on undo if permitted; other tasks untouched |
| AC-12 | Source changes the deadline of an accepted task | Linked update proposal appears; user's edits are not silently overwritten |
| AC-13 | User opens Working and corrects it for one hour | Sources remain inspectable; valid correction wins; expiry allows reevaluation |
| AC-14 | Home source exceeds freshness policy | UI shows stale/unknown, not unqualified “everything normal” |
| AC-15 | Two credible current observations conflict | Uncertain/conflicting state and evidence are visible |
| AC-16 | Fresh state says Airport + Vacation during school routine | Context mismatch asks who is covering; task remains open; no blind departure nudge |
| AC-17 | Location is stale | Do not treat stale location as proof of nonrelevance; due task remains visible |
| AC-18 | User dismisses/snoozes an attention item | Task due date/status remain unchanged; unchanged nudge respects acknowledgment/snooze |
| AC-19 | A source yields a high-confidence action request | Pending suggestion shown; no task or external response without approval |
| AC-20 | A task appears under Work and Job Search | Both links resolve to the same canonical task and source history |
| AC-21 | User archives an activity | Tasks remain accessible; archived association is identifiable and removable |
| AC-22 | Two clients update the same task version | Stale mutation is rejected/reconciled without losing the later edit |
| AC-23 | Persistence fails after an optimistic edit | Draft preserved; failure visible; no false saved/completed message |
| AC-24 | Health is off or permission is revoked | No health inference/summary leak; off or unavailable state shown; caches invalidated |
| AC-25 | User opens first-day Home with no sources/tasks | Unknown states and useful setup actions; no invented tasks or normal conditions |
| AC-26 | User navigates via keyboard/screen reader | Can inspect state, edit a task, manage tags and review a suggestion without a pointer |
| AC-27 | Calendar dinner changes without an action request | History/event change appears; a task is not automatically created |
| AC-28 | A relative deadline is processed days after receipt | Due date uses source time/timezone; ambiguous interpretation requires review |

Testing should include unit fixtures for relevance, state resolution, occurrence generation and duplicate extraction; integration tests for atomic review/association/status mutations; and end-to-end tests covering Overview → Task → Complete, Activity → tagged task, and Suggestion → Accept/Reject/Undo. Use deterministic clocks and source fixtures. Exercise stale, revoked, delayed and contradictory evidence—not just happy paths.

## 12. Delivery plan, measurements, and open decisions

### Slice 1: manual foundation

Deliver canonical entities, TaskActivity associations, task/status commands, activity lifecycle, navigation and manual capture/edit, counts, and basic History. Prove many-to-many completion and concurrency semantics before connecting AI extraction. Exit: AC-01–06, 20–23 pass.

### Slice 2: explainable state and contextual Home

Deliver property catalog, projections, source freshness, state inspector/correction, Overview layers and reason-coded attention. Include unknown, conflict and travel mismatch. Exit: AC-13–18, 24–25, 27 pass.

### Slice 3: recurrence and review-first extraction

Deliver recurrence series/occurrences, one verified email extraction source, calendar interpretation, suggestions, duplicate control, and accept/reject/undo. Exit: AC-07–12, 19, 28 pass. Do not enable automatic task acceptance.

### Slice 4: release hardening

Complete accessibility, permissions/revocation and retention checks, integration failures, performance measurements, and full end-to-end regression. AC-26 and all previous criteria are release gates. Health ingestion and additional connectors remain separate follow-ups unless explicitly added to scope.

Measure suggestion acceptance, rejection reasons and pre-acceptance edits; duplicate suggestion rate; state-correction recurrence; context-mismatch usefulness; attention dismissal/snooze rate; and time from task completion to consistent projections. Treat acceptance as user preference, not proof of extraction accuracy. Evaluate extraction precision with consented or synthetic labeled fixtures before any future auto-accept policy. Establish numeric quality targets from a pilot rather than inventing baseline performance.

Open engineering/product decisions (not assumed implemented):

1. Which email/calendar/device sources actually exist, and which are in the first release?
2. Storage/identity boundary and offline-write support in the target app.
3. Property-specific freshness thresholds, calibrated confidence labels, and correction default durations.
4. Recurrence library and daylight-saving ambiguity policy.
5. Source retention, deletion, revocation, and encrypted local/cloud processing boundaries.
6. Whether reminder delivery stays in-app or includes separately permissioned system notifications.
7. Whether another person can be assigned merely as a private label or needs a shared-task workflow; no external notification in this MVP.

## 13. Design status and implementation gap

The `.syrup` file is an editable navigation prototype, not an implementation of persistence, connectors, inference, multi-select, task completion, or notification delivery. It includes representative scenarios, not an exhaustive screen for every state in this PRD. Forms and scenario buttons demonstrate intent; returning to a list resets to its illustrative fixture rather than retaining changes.

Some activity cards and task rows link to related context or representative editing screens rather than unique detail pages for every record. The product must implement canonical record-specific routes and fully functional controls. Counts in the static fixture describe six distinct open tasks with overlapping activity tags; accepted-suggestion and completed-task pages are alternate snapshots, not live mutations of that fixture.

This specification supersedes earlier mockup language that treated soccer practice as an Activity or positioned job search as the main product category. Unrelated onboarding and notebook designs are preserved and are not re-specified here.
