# Just Maple design handoff

September 22, 2026 · State / Activities / Tasks

Start with the [PRD](PRD-state-activities-tasks.md). Open `Just Maple.syrup` inside this handoff directory in Sugar Maple for editable screens and navigation links. This is a verified copy of the live document saved at `/Users/riabuz/Documents/Just Maple.syrup`. Hand over this whole directory, including its `screens` subdirectory. Older files in the parent directory describe earlier design iterations; this handoff supersedes their Jobs/Activities terminology.

## What changed

- Overview now has Right now → Needs your attention → Activities. State supplies context; tasks supply actions.
- Tasks and Activities are separate primary destinations. Six domain state lenses remain under Your World.
- Activities represent ongoing areas and temporary pursuits. Family is an activity; taking kids to soccer is a task.
- Tasks can show multiple Activity tags. A shared task is not copied into separate activity-owned tasks.
- Task suggestions require review. Example accept/reject, task-completion, and travel-context mismatch snapshots illustrate intended decisions.
- Home-family, state, and notebook navigation is consistent. Existing onboarding and notebook content is preserved.

## Screen map

Screenshots are revision-bound captures of the actual Sugar Maple editor window, including its surrounding chrome. All examples use synthetic content. Exact page/artboard IDs and capture revision are in [verification.json](verification.json).

| Screen | Purpose and route | PRD acceptance coverage | Preview |
| --- | --- | --- | --- |
| Overview | Landing page; Tasks, Activities, evidence and attention entry points | AC-01, 16–19 | [View](screens/overview.png) |
| First day | Unknown state, no tasks, capture/connect actions | AC-25 | [View](screens/first-day.png) |
| Activities | Ongoing areas plus current pursuits, state and task counts | AC-02, 03, 21 | [View](screens/activities.png) |
| Activity · Family | State, associated tasks, people/events/documents | AC-03–06 | [View](screens/activity-family.png) |
| Activity · Job Search | Pursuit state, goal, evidence and overlapping task tags | AC-02, 20 | [View](screens/activity-job-search.png) |
| Tasks | Six unique open tasks, activity tags, dates and suggested-task entry | AC-03–06, 20 | [View](screens/tasks.png) |
| Task · Soccer | Concrete action with owner, time, place, source and relevance | AC-07, 16–18 | [View](screens/task-soccer.png) |
| Task · Completed | Completion of today's occurrence only | AC-07 | [View](screens/task-completed.png) |
| Task · Context mismatch | Airport/travel conflicts with transport responsibility | AC-16, 17 | [View](screens/task-context-mismatch.png) |
| New activity | Capture area or pursuit, not a task | AC-02 | [View](screens/new-activity.png) |
| New task | Multi-activity associations and concrete-action fields | AC-03, 05, 06 | [View](screens/new-task.png) |
| Suggested task | Evidence, due interpretation, Add / Not a task decision | AC-09–12, 19, 28 | [View](screens/suggested-task.png) |
| Task · Permission slip | Accepted-suggestion snapshot | AC-10 | [View](screens/task-permission-slip.png) |
| Suggestion dismissed | Rejection snapshot and Undo route | AC-11 | [View](screens/suggestion-dismissed.png) |
| State evidence | Current behavior evidence, confidence and sources | AC-13–15 | [View](screens/state-evidence.png) |
| Evidence | Evidence behind Job Search state and response attention | AC-13, 20 | [View](screens/evidence.png) |
| Correction | User correction takes priority; original evidence retained | AC-13 | [View](screens/correction.png) |

State pages Me, People, Home, Work, Schedule and Health remain in the States folder. Supporting History and Notebooks retain their existing content; sidebar navigation is updated. The Health screen demonstrates not-enabled behavior, not health ingestion.

## Review paths

1. Overview → soccer task → Mark complete → completed occurrence snapshot.
2. Tasks → soccer task → context mismatch example → responsibility review.
3. Activities → Family → task tagged Family + Health; inspect the multi-tag New task form.
4. Activities → Job Search → Why this state? → This state is wrong → Correction.
5. Overview or Tasks → suggested-task review → Add task → accepted-task snapshot.
6. Suggested task → Not a task → Undo dismissal → original suggestion.
7. Overview → Why? → current behavior evidence → This is wrong → correction example.

## Sample data contract

The default design fixture has six distinct open tasks:

| Task | Activity associations | When |
| --- | --- | --- |
| Take kids to soccer practice | Family | Today, 4:30 PM; recurring weekly |
| Turn down Acme offer | Job Search | Today |
| Review PR | Work | Today |
| Schedule pediatrician appointment | Family, Health | This week; exact date unset |
| Tell current manager my last day | Job Search, Work | Tomorrow |
| Call HVAC company | House | Friday |

Therefore Family has 2 open tasks, Work 2, House 1, Job Search 2, and Health 1. These overlapping counts must not be summed into a global count. Fitness and Plan Italy Trip have no open tasks. The permission-slip suggestion is not counted until accepted. Alternate acceptance/completion screens are independent scenario snapshots, not additional records in the default list.

The Activities index is a representative selection of areas and pursuits, not an exhaustive list of every tag in the sample data. The product implementation must expose all accessible activities, including a Health area if the user creates or selects it.

## Implementation fidelity and known prototype limits

This is a visual navigation prototype. It does not implement persisted form submission, task mutations, connector ingestion, calendar scheduling, inference, multi-select mechanics, filtering, automatic notifications, or external actions. Prototype buttons navigate to illustrative result screens. Returning to a list shows its baseline fixture.

Record-specific routes, all task filters, inline editing, explicit reminder controls, state-correction scope, complete recurrence editing, and error/loading/permission states must be implemented to the PRD. Some rows link to related context or a representative form rather than a dedicated page for that record. Labels and associations convey the product model, but these representative links are not routing specifications.

Visual style retains cream backgrounds, white surfaces, dark warm text, and restrained brick-red accents. Normal state is quiet. Attention and changed context are visible without turning every state into a green health indicator. All UI elements remain editable; the screenshots are not the design source.

## Verification

`verification.json` records live document identifiers, structural target validation, visible node bounds, preservation checks, and native screenshot captures. These checks validate the design artifact—not the acceptance criteria of a future implemented product. See its explicit limitations. No production accessibility, connector, persistence, inference or task workflow tests are claimed.

Engineering should begin with PRD slice 1 (canonical Activity/Task entities and many-to-many associations), then add explainable state/attention, followed by recurrence and review-first extraction.
