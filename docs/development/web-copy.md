# Web handoff formats

`code.export` and the Developer inspector share the semantic exporter. Existing `html`, `angular` and `tailwind` targets return complete elements. New targets are:

- `tailwind-classes`: literal Tailwind 4 classes for the selected element only. Include the literal string in a scanned source file and compile utilities.
- `css-declarations`: a declaration block without a selector or braces, suitable inside your own CSS rule.
- `html-css`: visible subtree markup plus its complete stylesheet, self-contained bundled font and embedded image sources.

`css` now returns rules for the selected visible subtree, retaining bound fill-token custom properties and exact fractional frame insets. Hidden descendant subtrees are omitted. Class/declaration fragments do not include semantic markup, descendants or assets; use complete-element targets for those. Parent-relative styles require an equivalent parent layout. Invalid token names reject before source generation.

The new targets retain `code` and add optional `setup` CSS and `notes`; existing target responses retain their previously published code-only shape. Pure fragments using Maple Sans return the licensed embedded font-face in `setup`; complete web outputs include it themselves. The inspector shows this setup in a separately selectable Required font CSS disclosure. Local custom fonts require assets from the consuming application. Prototype action metadata is an intentionally unwired integration point; no application navigation handler is invented.

The code box is the exact copy payload. Clipboard success is reported only after the write resolves. On permission failure, the error is visible and the keyboard-focusable code box remains available for manual selection/copy.

Validation is source-bound: model regressions, real Tailwind 4 compilation and 1440/834/393 consumer geometry, actual Chrome clipboard success/denial instrumentation, production WK UI/dispatcher fixtures and real isolated native MCP SDK schema validation. Native UI fixtures use synthetic DOM events and do not establish OS clipboard/input or full VoiceOver acceptance. Full token modes/aliases, advanced responsive behavior and broader export/library/native requirements remain in #11/#10/#16/#17.
