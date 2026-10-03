# Native comparison lifetime scheduling

The authored-scene comparison started its fixed-budget native helper before Canvas/DOM/package screenshots and observations. Waiting on those engines spent the helper's unchanged 60-second lifetime. Source `c129dc3210821957d8d5636b5f01bd9548405fd0` captures the same source scenes and enqueues native checks in their original order, then starts one helper for the native phase. All nine state checks, the reset, thirty observations, strict unsupported-state checks, source/checkpoint identity, geometry and authored paint assertions remain. Reply/CPU/wall/RSS/output limits and the thirty-second cleanup deadline are unchanged.

Controlled negative proof uses the actual full source fixtures before (`8c54ac3`) and after this repair, with a 2.1-second wait added to each of thirty other-engine observation iterations. Relative fixture imports were resolved to this source checkout, and the actual source-owned CLI was copied with only its fixed fixture list replaced by the selected full fixture. The before run fails with the native wall-time error. The after run completes the same forty native jobs on one helper in 4,340 ms. This controlled wait represents other-engine delay; it does not establish the cause of the earlier opaque CI stall. Fixture hashes and production source hash are retained in verification.json.

After committing the runtime source, both complete commands pass:

```
bun prototypes/library-preview/server-owner-test.ts --trust-native-fixture
bun prototypes/library-preview/server-owner-test.ts --trust-native-fixture --scene
```

These include actual native-stop error injection and a real leaked-listener negative case, all browser/server finally boundaries, source-owned editor attribution, unrelated port-4200 preservation and empty owned-server groups after completion. Full logs, ownership records, native-stop deadline proof and the measured scene comparison are retained here. A separate native acceptance run in another checkout overlapped part of this local run; this evidence supports functional comparison assertions, not isolated performance measurement.

Native timing definitions now explicitly describe an ordered captured-scene batch after the other engines. This does not prove simultaneous live editing, physical input latency or whole-product VoiceOver parity. CI and exact-head independent review remain required. This partially addresses #110; cancellation of the composite local CLI and detached native helpers remains open.
