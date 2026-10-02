# Mac packaging recovery

Issue [#94](https://github.com/zubair-io/Sugar-Maple/issues/94) was reproduced in PR #85's terminal cancelled CI run: Angular reported a generated bundle, but packaging never advanced to Xcode. The retained log supports the stalled process boundary, not a diagnosis of the underlying runtime defect.

The Mac build now invokes the repository-pinned Node 26.9.0 runtime directly for Angular's existing production build arguments. Packaging waits for its actual exit status, then proceeds through explicitly logged Xcode and signing phases. The Mac job has a 30-minute deadline and its build step a 10-minute deadline. Dependencies, native build settings and production output paths are unchanged.

A clean managed checkout at 1c332f81b2e4df9112a4ecdb9bbf80facbc7d182 completed the Mac build and signing with exit 0. Full native acceptance, 130 model tests / 2,114 assertions and typecheck also exited 0. Native acceptance includes the actual MCP transport, durable packages, 23 compiled SwiftUI vector consumers and 20 WK drawing cases with both camera handoffs. Source and artifact SHA-256 records are in [verification.json](verification.json).

The first frozen dependency installation encountered a transient scanner EOF; an unchanged retry passed with scanning enabled. No scanner or security check was disabled. Fresh exact-head CI, actual reviewer approval and resulting-main validation remain required.
