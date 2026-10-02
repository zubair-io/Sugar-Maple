# Native preview dependency integration

The four original PR #87 commits are rebased without patch changes on updated web candidate cba7e9e, inheriting #85's camera and pinned-Node Mac packaging repairs. At source 5d4c404cedaf8bdb463873bb898969461d66d2a1, 130 model tests / 2,114 assertions, typecheck, Mac build/signing and full native acceptance exited 0. Real sandbox/resource/cancellation gates and both camera handoffs pass.

The earlier 29-suite browser/package proof remains at its 8ae4de1 source. 210 browser runtime/fixture/gate source hashes match byte-for-byte; a new physical or browser run is not implied. The original native human-event proof also retains its original source. Range-diff, source and retained log hashes are in [verification.json](verification.json).

Fresh exact-head CI/review, verified dependencies/current main and resulting-main acceptance remain required. This remains a fixed explicitly trusted native experiment.
