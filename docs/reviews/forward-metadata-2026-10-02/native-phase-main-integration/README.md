# Metadata integration with repaired native comparison main

Source `da1e5e32d5c56e92320016475bd047538be599c5`, tree `829d6480da0d2553de046f12dc3f9f0738d34454`, passes 161 model tests / 2,361 assertions, typecheck, Mac build, all 34 owned browser/consumer suites, full native acceptance and both complete legacy/scene owner comparisons. Native UI and helper acceptance runs were sequential. Browser ownership verifies clean source attribution and cleanup.

PR #113 is merged at `fc847d498e1e70149c02aedf5e3b9c50a71b6b9c` (tree exactly equals reviewed head f655d14). After fetching that actual main, `git merge-tree --write-tree origin/main a1a0330d66d8c9ac71d84ce6ba299844a89d5be1` returns the exact source tree above. This verifies the metadata candidate against the resulting base without changing its live-review head. Metadata exact-head independent review and resulting-main delivery checks are still required; #100 stays open.
