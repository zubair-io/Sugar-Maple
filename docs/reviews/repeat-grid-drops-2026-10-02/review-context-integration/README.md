Drop review context integration

Candidate a2d6098baf2fac1a1b1263447efe0a688e0c6084 rebases drops, hover hit targets and the monotonic deadline onto control candidate c3d1769 and delivered review tooling. Every src/tools/prototypes/package.json/bun.lock file matches previous head fbd9b26. Fresh 150 model tests / 2,248 assertions, app/reviewer typecheck and 42 reviewer tests passed.

Original integrated/full and hover/monotonic/folder-chooser proofs retain their source attribution; no new native/browser/physical run is claimed during this tooling-only rebase. Active review sessions are retained; source integration is not an observation-timeout restart. Fresh final-head review/CI and delivery gates remain required.
