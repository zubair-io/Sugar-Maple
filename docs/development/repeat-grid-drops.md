# Repeat Grid file and folder imports

Partial implementation toward [#13](https://github.com/zubair-io/Sugar-Maple/issues/13), stacked on the Canvas controls in #90. Delivery requires final-head review/CI, dependent integration and resulting-main verification.

Select a Repeat Grid and drop CSV, JSON, a text list, local images or an image folder into **Drop Repeat Grid files**. The file and folder choosers provide the same mapping, Preview and Apply workflow. A folder-only import starts an `image` field; text lists start a `text` field. CSV/JSON field names remain explicit. Choose a field for each template target, inspect the preview, then apply one undoable batch. Staging and preview leave the authoritative document unchanged. Unmapped targets and cells after the final data row remain unchanged.

Images use case-sensitive filename order (code-unit order), then cells left to right and down. Nested folders are flattened; duplicate basenames are rejected instead of silently selecting one file. The importer ignores `.DS_Store` metadata. Other unsupported files reject the complete batch. Filenames are exact local aliases, never paths or remote URLs. Identical embedded bytes are deduplicated by the shared asset model.

CSV/JSON retain the existing strict parser and explicit missing-value/truncation rules. JSON values must be strings. Text lists normalize line endings, preserve each line's whitespace, remove one trailing line terminator and use the same missing-value rules. At most one data file (1 MB) and 100 PNG/JPEG/WebP images (5 MB each, 8 MB chosen total) are accepted. Shared document asset limits still apply at Preview/Apply. Directory traversal is bounded to 1,000 entries, eight nested folders and five seconds. Cancellation, a replacement request, selection/component destruction or document changes invalidate pending work and prepared imports.

The macOS host now honors the trusted editor's explicit folder chooser using NSOpenPanel. Preview content, subframes and untrusted origins remain excluded. This grants only the files the user chooses through WebKit; no privileged filesystem command or arbitrary path traversal is added. Drag stores are copied synchronously before asynchronous reads. WKWebView file drops use `getAsFile()` when available, avoiding unreadable synthetic entry callbacks; directory entries are exhausted across all reader batches.

## Verification

Run the pinned Bun model/typecheck, full browser acceptance, macOS build and full native acceptance commands. The browser suite covers actual File/DataTransfer input, an actual directory file input, staged/checkpoint invariants, field mappings, errors, cancellation, IndexedDB reload and one-batch undo. The production WK suite covers File/DataTransfer behavior, decoding, bounded directory-entry fixtures, stale preparation and cancellation. Directory fixtures alone do not prove the OS chooser; separate native UI/MCP evidence is required for that path.

For the real native chooser acceptance, run `bun tools/native-repeat-folder-evidence.ts prepare`, then hold an owned app using `bun tools/native-canvas-transform-mcp.ts --repeat --hold`. Record `before`; use the native UI to choose `build/repeat-drops/native-images` and map Photo to `image`; record `staged`; click Preview and record `preview`; click Apply and record `apply`; press Cmd+Z and record `undo`. Each recording runs `bun tools/native-repeat-folder-evidence.ts <stage>` against only the held QA identity/document. Run `bun tools/native-repeat-folder-evidence.ts verify` to compare the durable checkpoints, embedded bytes, stable IDs, unmapped data and exact undo. A newline to the holding process stops only its owned app. This is a manual OS-input acceptance procedure; the script never simulates human edits.

## Remaining scope

Canonical virtual-cell storage and responsive template sizing remain open in #13. Visible cells are still materialized within the validated 100-cell limit. The import feature uses the existing shared `repeat.import`/`asset.set` command batch and does not add a new MCP tool or schema.
