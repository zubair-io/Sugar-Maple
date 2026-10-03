# Snapshot repair with historical metadata-map guard

Source `6c73511dd514ea86aed0e33d7f4b882d0639fffe` integrates the complete snapshot/receipt repair onto metadata parent `a1a0330d66d8c9ac71d84ce6ba299844a89d5be1`. Public reads clone the full private projection; the private projection retains the optional historical metadata-map guard. Validated internal edits/replay retain the private path. The two previously conflicting getter changes are both preserved.

All 166 model tests / 2,378 assertions, typecheck, Mac build, all 35 owned browser/consumer suites and full native acceptance pass. The first native run overlapped another checkout's comparison suite; the complete native acceptance was repeated sequentially after that comparison exited, and only the separate run is retained here. Browser provenance verifies the clean source revision and successful owned-server cleanup.

Original fail-before snapshot/receipt evidence and earlier source proofs remain historical in their folders. The exact public legacy extra-CRDT property was already ignored and normalized safely; the meaningful missing-map regression deliberately injects the historical in-memory CRDT shape. No new raw-CRDT loading API is introduced.

Previous head c7422c1 had actual APPROVE (session 3529372412981073967), green review 37086577758 and Editor 37086577743. That verdict does not cover this updated parent/head. Fresh independent review/CI, current-main integration, dependency delivery and resulting-main verification remain required. No physical latency, hardware input or complete VoiceOver claim is made.
