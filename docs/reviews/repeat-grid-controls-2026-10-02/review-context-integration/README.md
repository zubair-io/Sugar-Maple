Repeat Grid review context integration

Candidate 7701ca080d386965e8faa607097dd2d3960ad681 rebases controls onto scene candidate f50d0fe and delivered review tooling #97/#99. All src/tools/prototypes/package.json/bun.lock files are unchanged from previous head 86285c8. Fresh 142 model tests / 2,225 assertions, app/reviewer typecheck and 42 reviewer tests passed.

Full browser/Mac/native/MCP proof remains source-bound to 9de069e; no fresh physical/browser/native execution is claimed for this tooling-only rebase. The earlier metadata-based blocked verdict is not overwritten. Fresh current-head review must independently assess the unchanged application with correct context.
