# Repeat Grid integration with authored-scene fixes

PR #90's six original commits are rebased onto final scene candidate `010366bb2c18f4c1bd3f8df556880c09391b9a6a`. The only rebase conflict was native acceptance formatting/context: scene diagnostics/borders, drawing, reparent and all other existing gates remain; Repeat Grid MCP is added. Original feature patches are preserved.

At source `9de069e3e95d0cd7f9621b53d5a765a4803e8036`, 142 model tests / 2,225 assertions, typecheck, production Mac packaging/signing, all 31 browser/consumer suites and full native acceptance exited 0. Actual Canvas controls pass 20 Chrome and 19 WK cases, plus real native MCP resize/data/atomic rejection/undo/redo/durable capture. Logs, screenshots, reports and source hashes are in [verification.json](verification.json).

The original physical-input evidence remains at b2fa170. Current native DOM pointer cases use a capture shim and do not replace OS input evidence. Fresh exact-head review/CI, dependency delivery and successful resulting-main CI remain required. Virtual repeat cells and responsive templates remain open in #13.
