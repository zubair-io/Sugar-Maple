# CRDT evaluation checkpoint

Yjs remains the implementation used by the editor. The document boundary exposes semantic JSON and commands, not library-specific values. Per-record field maps preserve independent property edits; `Y.UndoManager` groups each validated human gesture or agent batch.

A reproducible comparison is available with `bun src/web/tests/crdt-comparison.ts`. On this development machine, using 1,000 nodes, independent concurrent x/y edits and binary save/load:

| Implementation | Fixture elapsed | Encoded bytes | Merge and recovery |
| --- | --- | --- | --- |
| Automerge | 80.5 ms | 22,746 | Passed |
| Yjs | 17.4 ms | 84,543 | Passed |

These are single-run development diagnostics, not production performance guarantees or a complete resolution of issue #6. Automerge was smaller; Yjs was faster in this bounded fixture and already provides the undo grouping used by the current command layer. The editor tests separately cover atomic validation, grouping, retries, document targeting and property preservation. Crash-injection, text concurrency and larger repeated benchmarks remain needed before declaring the durable format final.
