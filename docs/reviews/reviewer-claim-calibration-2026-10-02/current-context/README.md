Current PR context follow-up

The event pins the code head, while API metadata supplies the current description, base and eligibility. Source preparation uses a validated common-ancestor revision and complete committed Git trees; JSON comparison patches are never used. Revalidation rejects head/base movement before agent creation and marks changed eligibility as a failed preparation rather than leaving a pending status.

At source 3958ea6b0ab5eef6a821b078172e5f907e175114, typecheck, 41 reviewer tests and production bundle passed. The real unchanged PR #90 diff contains 38,835 lines; all 18 shipping-source hunks are retained. Archive omissions are reported explicitly in real-pr90-context.json.

The initial prompt-only proof remains historical. A fresh actual #90 verdict is still required; compilation and fixtures do not prove model interpretation.
