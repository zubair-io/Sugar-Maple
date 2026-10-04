# Sugar Maple release delivery

The macOS bundle ID is `app.justmaple.SugarMaple`, Apple team `QREP66JW5U`,
and shared scheme `Sugar Maple`. The app version starts at `1.0.0`.
Neither sibling Maple checkout is needed to build or release.

## Xcode Cloud and TestFlight

The Sugar Maple Cloud product is already connected to this repository. Its
current Default workflow builds main; distribution setup requires an associated
App Store Connect macOS app record. Creating the Cloud product alone does not
create that record. The account holder is handling the record creation.

After the record is associated, configure the main workflow with an Archive
action for macOS / Sugar Maple / Any Mac and TestFlight distribution, followed
by the intended internal tester group. Configure a separate production workflow
for stable `vMAJOR.MINOR.PATCH` tags with an Archive action eligible for
TestFlight and App Store release, plus a macOS Notarize post-action where the
Cloud UI permits it. Verify the actual processed build and distribution status.
Saving workflow definitions or a successful Build action does not establish
TestFlight delivery. App Store publication still requires app metadata/review.

The post-clone hook installs checksum-verified Bun 1.4.2 and Node 26.9.0, runs a
frozen install, and builds the editor. Node/npm is supplied temporarily because
Apple's runner lacks npm and the pinned Node package's installer needs it.
The pre-Xcode hook stamps stable tag versions. Cloud owns its build numbers.
Use the latest release Xcode/macOS environment, not beta toolchains.

## Signed production download

`.github/workflows/release.yml` adapts Maple's tag-release pattern to Sugar
Maple's small, Swift-only host. It uses a GitHub-hosted macOS runner. There is no
Rust cross-build, Windows target, extension profile set, or self-hosted runner
dependency to copy from Maple.

- A stable `vMAJOR.MINOR.PATCH` tag builds, signs and notarizes a universal
  `arm64` + `x86_64` app and DMG, then publishes the validated DMG and checksum
  in a GitHub Release.
- Manual dispatch on main runs the same signing/notarization path, retaining
  artifacts without creating a release. Supply a stable version.
- Pull requests do not run the release job or receive signing secrets.

The release job requires encrypted repository Actions secrets:
`MACOS_CERT_P12_BASE64` (only the Developer ID Application identity and private
key), `MACOS_CERT_PASSWORD`, `APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID`, and
`APPSTORE_PRIVATE_KEY`. Reuse the existing Developer-role notarization key if
authorized; an Admin key is unnecessary. Certificates/private keys remain
outside Git. The job uses an isolated temporary keychain, restores its original
search list, and removes credentials even after failure. Do not install release
credentials into ordinary PR CI or expose them through logs/artifacts.

`tools/release-mac.sh` is also the local verification path. It requires installed
Developer ID signing material, `RELEASE_VERSION`, and notarization key path/ID/
issuer supplied privately through the environment. It validates the app's
bundle ID, team, hardened runtime, version/build, bundled editor, signature and
both architectures. It requires Accepted notarization for the app, staples it
before making the DMG, then signs/notarizes/staples the DMG and checks Gatekeeper.
Only a successfully validated DMG can reach the publish job. The GitHub build
number is its workflow run number and is independent of Cloud's TestFlight
numbering.

For an archive-only local check, pass `--archive-only`; its output is explicitly
not notarized and is never used by the publishing workflow. Existing output
archives/DMGs are rejected rather than merged or overwritten. Use an owned,
fresh output directory for each validation attempt.

Delivery evidence is recorded in issue #134. Keep it open until actual
TestFlight and production automation have succeeded; generated YAML, an archive
alone, or a manually notarized artifact does not complete both delivery paths.
