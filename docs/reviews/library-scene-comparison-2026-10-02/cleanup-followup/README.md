# Native shutdown regression follow-up

Two terminal PR #95 CI runs failed the outer 30-second watchdog around a complete real comparison. That deadline covered source setup, compilation, rendering and shutdown together. Their prior logs did not identify the child phase, so they do not establish a cleanup leak. Failed logs are retained.

At f385bfc73e281a165d9a82b7923370fba6ecc683, preparation is bounded by the existing owned editor's 10-minute lifetime. The 30-second cleanup deadline starts after the real native owner is stopped. Native compiler/runtime/resource and geometry gates remain unchanged. The entire comparison must publish success before the injected shutdown failure; a shutdown exception can no longer hide an earlier comparison failure. Child phase/output/stderr are retained on failure.

Both actual legacy and nine-state scene comparison/ownership gates exited 0 locally. Actual shutdown completed in about 0.32 seconds. A real unclosed Bun listener was terminated and rejected after the unchanged 30-second cleanup deadline in both modes. Source and artifacts are hashed in [verification.json](verification.json). Fresh exact-head CI/review, dependency integration and resulting-main verification remain pending.
