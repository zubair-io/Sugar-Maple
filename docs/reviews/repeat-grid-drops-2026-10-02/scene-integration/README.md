# Repeat Grid drop integration with the scene candidate

Five original #91 commits are rebased without patch changes onto #90 head `86285c8e0695118ac57393a4977adce21cc1bf75`, incorporating authored-scene/reset/border, vector/camera and packaging fixes.

At source `a28f7b5cee45f57083052b77784a4c4c03cf975f`, 148 model tests / 2,246 assertions, typecheck, production Mac packaging/signing, all 32 browser/consumer suites and full native acceptance exited 0. Actual drop/mapping/cancellation/history/recovery flows pass 11 Chrome and 12 WK cases; real native MCP Repeat Grid resize/data/atomic rejection/undo/redo/durable capture also passes. Logs, screenshots, reports and source hashes are in [verification.json](verification.json).

WK directory entries are supplied fixtures. Actual NSOpenPanel and owned MCP folder evidence remains at `23ecd85`; native access/host and repeat staging/inspector boundary hashes match that source. No new physical chooser interaction is claimed. Fresh final-head review/CI, dependency delivery and successful resulting-main verification remain required. Virtual cells and responsive templates remain #13.
