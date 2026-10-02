# Real library preview experiment — issue #51

This standalone experiment executes the pinned Web Awesome 3.14.0 Button, Input
and Card beside Sugar Maple's generated semantic HTML for the same manifest
fixture. It does not add an imported-code execution path to the editor.

## Run and reproduce

Use the repository's Bun 1.4.2 runtime. First run
`bun tools/library-consumer.ts` to explicitly populate the existing consumer
cache using the committed npm lock and `npm ci --ignore-scripts`. Then:

```sh
bun prototypes/library-preview/build.ts --trust-fixture
bun prototypes/library-preview/serve.ts --trust-fixture
```

Open the printed localhost URL and choose **Run pinned library preview**.
Building or serving without the trust flag fails. Build reads only the fixed
fixture and pinned cache; it does not install dependencies, invoke package
scripts or evaluate imported source. Missing/mismatched dependencies fail rather
than falling back to a remote CDN. The browser acceptance suite already
prepares this cache; `bun run test:library-preview` then runs the contract tests,
strict frontend typecheck, offline build and real Chrome checks. Editor web CI
runs this gate after that suite.

## Architecture and trust

The trusted host owns opt-in, cancellation, prop controls and a semantic HTML
comparison. The imported fixed package runs inside a new script-only sandboxed
`srcdoc` iframe with an opaque origin. Its CSP permits the embedded bundle and
styles, data images/fonts, and denies fetch connections. It receives no editor
document, filesystem, native handler, authoring API or command dispatcher.
The small standalone server exposes an explicit GET asset allowlist only.

A transferred MessageChannel is the sole application event route. The protocol
has a random session and increasing revision; strict schemas accept only
render snapshots, ready/rendered/error replies, Button action and bounded Input
change events. Known component props are checked against the real manifest,
including variant defaults, before updating any control. Extra command/path
keys, unknown props, oversized packets and obsolete revisions are rejected.
Events never dispatch editor commands. Strings become text/property values,
not executable HTML. Stop closes the channel and removes the child. Restart
cancels the old fetch/session before loading a new one; superseded replies
cannot complete a current request. Requests have a five-second deadline.

The fixture is explicitly trusted. An iframe is **not** CPU/process isolation:
a malicious loop can prevent the host's JavaScript deadline from firing.
Browser navigation is also outside the tested fetch restriction. This is not
approval to execute arbitrary imported JavaScript. AppSandbox/native bridge
isolation, whole-process resource limits and hostile navigation require their
own native-host evidence before any editor integration.

## Product findings and decision

The real package provides editable native browser controls, actual package
variants and shadow-DOM behavior. Button label, value, disabled state and
manifest variants update without rebuilding the bundle. Typed Input changes
and Button actions return to the host. This supports a bounded library
preview contract, rather than treating source code as a bitmap.

Both paths preserve the fixture's paragraph header and expose the same named
input/button, but package styling and variants differ. The prototype must not
invent a heading role that the source text node did not declare. Web Awesome's
header slot accepts host-supplied content; it does not confer a heading role.
ARIA snapshots and screenshots provide evidence for this fixture, not a full
VoiceOver or accessibility audit. The semantic comparison is DOM export; the
interactive Canvas editor has not yet been measured against this runtime.

`build/library-preview/build.json` records exact asset sizes and SHA-256 hashes.
The real package runtime currently adds roughly 262 KB JavaScript and 155 KB
CSS before compression; the semantic fixture is roughly 3 KB. The host bundle
is separate. These are asset costs, not whole-app memory measurements.
`browser-report.json` records one cold opt-in observation and 30 sequential warm
updates. Warm completion includes Lit updates and two animation-frame waits;
it is not input latency, physical presentation time or FPS. The gate also
writes a visually inspectable `comparison.png` and both ARIA snapshots.

**Decision: continue the bounded experiment; no production rollout yet.**
Issue #51 remains open. Still required: an explicitly trusted SwiftUI helper
with build/runtime resource bounds, cancellation and stale-result rejection;
the complete Canvas/DOM/native comparison of editability, fidelity,
accessibility, latency and package cost; and a final go/no-go. Do not infer
Swift/native fidelity, safe arbitrary-source execution, or the full issue's
completion from these web-only results.

## Verification scope

The browser gate uses real package controls to exercise input/action events,
literal markup labels, variants, disabled state, restart and stop. It probes
denied parent-document/storage/fetch access and absent editor/native bridges;
rejects forged global messages and privileged keys on the authenticated child
port; verifies atomic invalid-prop rejection, revision supersession and
stop-before-ready; and records zero nonlocal requests or page errors for this
fixture. Unsupported behavior is reported, not silently approximated.
