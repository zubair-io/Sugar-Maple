# Sugar Maple release delivery

Sugar Maple uses Maple's current single-archive release and version handoff
(adapted from `_Maple` revision `cf6d05cec1c49c9e418cf5f5c6439925362fd3ec`).
The bundle is `app.justmaple.SugarMaple`, team `QREP66JW5U`, shared scheme
`Sugar Maple`. Neither sibling checkout is required by CI.

## Apple workflows

The App Store Connect app record is `6819044241`; the Cloud product is
`258d5b64-01cf-435b-8973-850d14868c10`.

- **Default/main**: Archive macOS / Sugar Maple / Any Mac, TestFlight Internal
  Testing distribution preparation; the TestFlight post-action uses that
  archive and the internal `Test` group. There is no separate Build action.
- **prod** (`9a1b6cbd-2159-4f6e-8a67-e191343b7049`): tags beginning with `v`,
  Archive macOS / Sugar Maple / Any Mac, **App Store Connect** distribution
  preparation, and **Notarize – macOS** on the same archive. No main-branch
  trigger. Editing is restricted to Admins/App Managers.
- Both use the latest release Xcode/macOS, clean builds, and changes to any file.
  The scripts reject tags other than stable `vMAJOR.MINOR.PATCH`.

`ci_post_clone.sh` installs checksum-verified Bun 1.4.2 and Node 26.9.0, performs
a frozen install and bundles the editor. `ci_pre_xcodebuild.sh` stamps the tag's
marketing version; Cloud assigns the build number. `ci_post_xcodebuild.sh`
packages **Cloud's Developer ID export**, without compiling or re-signing the
app. It checks bundle/team/runtime, version, both architectures and editor
assets, requires Accepted notarization, staples app and DMG, and assesses the
app from the final mounted DMG. Cloud's private signing key is not exposed to
scripts: the app is Developer ID signed; the DMG container is notarized and
stapled, not separately code signed.

The prod workflow requires these **secret** environment variables:

| Name | Purpose |
| --- | --- |
| `AC_KEY_ID` | Existing Developer-role Apple API key identifier |
| `AC_ISSUER_ID` | Apple team issuer identifier |
| `AC_PRIVATE_KEY` | That key's P8 contents, used by notarytool |
| `GITHUB_TOKEN` | Sugar-Maple-only token with Contents write, to upload draft assets |

Keep these workflow-specific, not shared with PR or main builds. Never copy
masked values from Maple or put private material in Git/logs/artifacts.
Saving the workflow alone does not configure its secrets or prove delivery.
App Store eligibility is a build property; public App Store publication also
requires metadata, review and account-holder agreements.

## GitHub tag publication

A stable tag starts Cloud prod and `.github/workflows/release.yml`. Cloud checks
that the GitHub tag resolves to `CI_COMMIT`, uploads its validated DMG,
`SHA256SUMS.txt` and `release-metadata.json` to a **draft** release. GitHub waits
up to three hours, downloads all three, verifies checksum, tag/commit, version,
identity, architecture and notarization provenance, then publishes. Timeout,
missing assets or mismatch leaves the draft unpublished. A completed rerun
validates existing assets and does not overwrite a public release. Do not move
or recreate a released tag. Retry failed Cloud production builds before a
release becomes public; do not overwrite public assets.

These metadata checks bind trusted Cloud output to a release; they do not
independently notarize or run Gatekeeper on Linux. The Cloud hook performs those
macOS checks before upload. Production tags never trigger a second GitHub Mac
compile. The workflow's **manual dispatch on main** retains the earlier signed
app/DMG validation path as artifact-only QA; it does not publish or substitute
for a Cloud production build. That path uses the existing encrypted repository
secrets `MACOS_CERT_P12_BASE64`, `MACOS_CERT_PASSWORD`, `APPSTORE_KEY_ID`,
`APPSTORE_ISSUER_ID`, `APPSTORE_PRIVATE_KEY`. `tools/release-mac.sh` also supports
local QA and `--archive-only`; neither is the tag publication source.

## Release the tested version, then advance development

Set repository auto-merge and a strict, up-to-date main ruleset with required
`release-handoff-complete`, `Release readiness`, Editor `web` and `macos`, and
`jules/review` checks. Preserve existing stronger checks. Do not bypass them.

Store `VERSION_SYNC_TOKEN` as an encrypted repository Actions secret. Use a
fine-grained token restricted to Sugar-Maple with Contents, Pull requests and
Issues write, and Actions read. It must trigger downstream workflows; the
ordinary workflow `GITHUB_TOKEN` suppresses tag/PR-triggered Actions. The workflow
uses its own status token for trusted gate updates. The release controller
fails before creating tags if required protection or pinned validation is absent.

1. Dispatch **version-sync** on main. Leave `next_version` blank for a patch
   increment or specify a greater stable development version.
2. The full reusable Editor CI validates that exact revision. Its SHA and green
   main CI are required; a moved main fails closed rather than choosing new code.
3. The controller creates/reuses a tracking issue and durable
   `release/next-vCURRENT` branch containing only the next marketing-version
   change. It holds other PRs at the handoff gate and creates the annotated
   `vCURRENT` tag on the tested main commit. Cloud and GitHub consume that tag.
4. A version-only PR references the tracking issue. Release readiness waits for
   Editor and Jules. Only its exact head, directly based on current main, can
   pass the handoff gate; rebase auto-merge remains subject to required checks.
5. After merge, main has the next development version and starts TestFlight.
   Merging this PR never creates another release tag.

Rerunning the same dispatch reuses its tag/branch/issue/PR. After completed
handoff it is a no-op; a new release requires a new dispatch. If main advanced
while retaining an already-tagged version, `advance_only` performs the migration
bump without moving the original tag. `release-handoff.yml` executes trusted
main code and reads PR changes only as Git objects; it never runs PR source.

## Validation and delivery evidence

Run `python3 -m unittest discover -s tools -p 'test_release_*.py'` and
`python3 -m unittest discover -s src/apple/ci_scripts -p 'test_*.py'`, plus
`shellcheck` on the hooks and `actionlint` on changed workflows. Policy tests use
disposable Git repositories and fake GitHub transport; publication tests reject
tampered bytes, foreign provenance, rejected notarization, timeouts and moved
tags. These tests do not establish real Apple delivery.

Record actual processed TestFlight/group delivery and production Cloud/GitHub
artifact checks in issue #134. Keep it open until both paths succeed. A saved
workflow, successful plain Build, fixture test or artifact-only manual QA run
is not end-to-end production delivery evidence.
