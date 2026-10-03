# Forward-compatible scene metadata

Version-1 documents, pages and folders retain unknown fields as opaque JSON data. Opening and saving a compatible file preserves those fields through ordinary command edits, grouped undo/redo and checkpoint journal recovery. The document store keeps document fields in its internal CRDT metadata map and returns detached metadata values in public scene snapshots. A caller cannot mutate this metadata through a scene read.

Metadata does not define rendering, code execution, command capabilities or native privileges. Known fields still use their existing schemas. Commands remain strict and cannot write arbitrary metadata fields. Unsupported document versions and unsupported fields on strict node/library schemas fail explicitly; this is not the complete migration contract or final durable storage decision from #6.

Opaque values must be JSON, acyclic, and at most 64 nested object/array levels. The keys `__proto__`, `prototype` and `constructor` are reserved and reject explicitly, including in nested metadata, rather than being silently stripped or passed to object projection helpers.

Verification includes scene-store regressions for serialization, journal recovery, undo/redo, detached reads and rejection; a real IndexedDB restore/edit/reload/recovered-undo fixture; and the native `.syrup` package round-trip fixture. Run `bun test ./src/web/tests`, `bun tools/browser-acceptance.ts`, and, after `bun run build:mac`, `bun tools/native-acceptance.ts`. Fixture success does not prove arbitrary future node/library features or choose a CRDT.
