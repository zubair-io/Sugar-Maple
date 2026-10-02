# Trusted native library fixture — partial issue #51

This separately signed App Sandbox application renders a fixed SwiftUI
Button/TextField (or SecureField)/VStack fixture. It is not embedded in the
editor and receives no authoring/native bridge. The parent compiles only this
repository-owned static source, never an imported arbitrary Swift project.

```sh
bun prototypes/library-preview/native/test.ts --trust-native-fixture
bun prototypes/library-preview/native/limits-test.ts --trust-native-fixture
bun prototypes/library-preview/native/scene-test.ts --trust-native-fixture
# Interactive: click Save & Continue, then select the Email value and type qa.
bun prototypes/library-preview/native/human-test.ts --trust-native-fixture
# Interactive authored-scene check: action, qa, append x/y through update/undo, reset.
bun prototypes/library-preview/native/scene-human-test.ts --trust-native-fixture
```

The explicit native trust flag is independent of the web experiment. Builds
use the macOS 14 API baseline and system SwiftUI SDK; there are no remote
native dependencies. A fresh generation owns its staging/output directory.
Cancelled builds remove staging and never return a published generation.
There is no shared executable that an obsolete build can overwrite.
`NativeBuildSession` additionally aborts a previous preparation and rejects its
result when a newer generation is requested; a stale result is not returned
to its caller. The acceptance check overlaps two preparations and verifies
that only the newest generation is returned and staging is cleaned up.

Each compiler/signing command has a 90-second wall deadline, a sampled group
RSS ceiling of 1.5 GiB and 2 MB output ceiling. The Swift compiler additionally
inherits a 60-second per-process CPU limit. Runtime has a 15-second CPU limit,
60-second wall deadline, sampled 512 MiB group RSS ceiling and 64 MB total
output ceiling. Reply deadlines are five seconds. Cancellation kills only
the owned detached process group. RSS is sampled every 100 ms: it is a
supervisory termination budget, not a hard instantaneous memory ceiling.
Per-process CPU does not establish an aggregate compiler CPU ceiling.

The application has only `com.apple.security.app-sandbox`; it requests no
network, user-selected-file, scripting, application-group or hardware
entitlements. Actual tests create a private host canary and a reachable owned
localhost server, then verify the helper cannot read/connect to them. These
are startup test probes controlled by the parent environment, not protocol
capabilities. They are limited probes rather than a universal filesystem or
OS security audit. See [Apple's entitlement reference](https://developer.apple.com/library/archive/documentation/Miscellaneous/Reference/EntitlementKeyReference/Chapters/EnablingAppSandbox.html).

The bounded stdin/stdout protocol accepts only strict render snapshots with
session UUID, increasing revision and typed fixture props. Swift validates
all fields before mutating observable state. There are no path, eval,
transaction or command messages. Replies are ready/error, bounded PNG render,
Button action and Input change. Parent reply validation rejects extra keys,
unknown session/revision or malformed data. Superseded replies cannot finish
a newer request. Strings are control values, not source interpolation.
Unsupported Primary/appearance variants fail explicitly; Default and
Disabled are the pinned native mapping's supported variants. Protocol 2 also
accepts an immutable authored scene with resolved outer geometry, validated
named slots and explicit supported Button/frame paint overrides. Native input
paint and typography gaps return diagnostics. See [the scene contract](../scene-projection.md)
for the supported presentation subset and its limits; native chrome is not
claimed to match web-package or Canvas pixels.

`test.ts` checks actual compilation/rendering, the file/network canaries,
PNG validity, supersession, privileged packet rejection and unsupported
variants. `limits-test.ts` exercises real CPU, wall, sampled-memory, output
termination and runtime/build cancellation. `human-test.ts` verifies actual
native Button clicks and TextField keyboard input via returned typed events;
it is a separate interactive check, not a simulated CI click.

Local native input testing found that a minimal NSApplication fixture needs
a Select All menu action for Command-A. The fixture now supplies that action;
the successful native input run selected the old value and entered `qa` using
keyboard events, without changing the OS clipboard.

Still required before issue #51 completion: full Canvas/DOM/web/native
editability, fidelity, accessibility, latency and package-cost comparison,
and the final product go/no-go. These bounded fixed-source tests do not
establish safe arbitrary native source import, iOS support, notarized
distribution, full VoiceOver coverage or whole-product native fidelity.
