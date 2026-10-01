# Just Maple — Mac onboarding and Home

> Current engineering handoff (September 22, 2026): [State / Activities / Tasks PRD](handoff/PRD-state-activities-tasks.md) and [screen guide](handoff/DESIGN-HANDOFF.md). The updated editable document snapshot is `handoff/Just Maple.syrup`; the active document is saved in the user's Documents folder. The descriptions below record earlier iterations and do not describe the current Activities/Tasks model.

Eighteen editable 1280 × 900 artboards, authored through the running Sugar Maple app's Swift MCP endpoint. The scene contains 1154 editable text, path, frame, input and button elements. Existing Sugar Maple pages were preserved. `Just Maple.syrup` is a separate, validated document containing only these designs.

## Screens

1. Welcome — quiet introduction, private-by-design message.
2. About you — only the name to start.
3. Bring your context — résumé drop zone, choose file, optional sample/skip.
4. Review imported facts — source attribution and correctable suggestions.
5. Connect your world — six initial connectors, connected/disconnected examples.
6. Choose intelligence — Claude, ChatGPT/Codex and local reasoning; sharing disclosure.
7. Your first understanding — profile, people, upcoming plans and inferred job status.
8. Home — current context, attention, upcoming event, world domains, active jobs, recent understanding and a subordinate Ask bar.
9. Evidence — the observed events and inferred state behind an attention item.
10. Correction — explicitly override an inferred job-search state.
11. First-day Home — an alternate low-context state with a useful next step.

## Review

Open `Just Maple.syrup` with Sugar Maple's Open action. Choose the Welcome page/artboard and Preview to follow the onboarding journey. Home → Review → My status is wrong reaches the evidence and correction screens. The remaining controls illustrate intended product actions; this is a navigation prototype, not live accounts, file ingestion, provider authorization or saved user corrections.

`index.html` is an overview with direct links to full-resolution canvas captures. PNGs ending in `-canvas.png` are captured from the integrated Just-Maple Whiteboard canvas viewport. The editable document retains its individual scene nodes; native DOM preview checks verify text clipping and prototype navigation. `verification.json` records the clipping and navigation checks.

## Visual system and content

Colors come from `../Just-Maple/ds-bundle/tokens/maple-tokens.css` and the matching `apps/web/src/styles.scss` light theme: primary #993629, cream #fdfbf7, white #ffffff, alternate/sidebar #f5f2eb, main text #292524, muted #78716c, border #e7e5e4 and primary tint #f5e6e4. These are saved as named `jm-*` document tokens. Typography uses Sugar Maple's current system font, appropriate for a native Mac interpretation; its scene model does not yet expose Just Maple's Lato/Merriweather font selection. Icons are editable vector drawings, not imported brand assets.

The two user-supplied PRD/handoff documents guide the hierarchy and sample stories. Personal details, connections, discovered people and activity are illustrative; no real accounts were connected or private messages read. Provider sign-in availability and cloud-sharing policy require implementation validation.

## Reproduce

With Sugar Maple running, `bun designs/just-maple/draw.ts` creates a NEW set of pages and writes the standalone document. It intentionally does not replace existing pages. `bun designs/just-maple/verify.ts` requires the browser editor on port 4200 and Chrome; it loads the saved document in an isolated browser context, checks every artboard for text clipping, captures each screen and walks the primary linked journey. No Just Maple sibling checkout is needed to reopen the resulting document.

## Notes and notebooks

Notes is linked from every Home-family sidebar. The shelf has three notebook covers: Everyday, Working Thoughts and Out & About. Each opens its matching ruled-paper notebook and new-note screen; All notebooks and Home return to the shelf and home screen. Seven additional artboards bring the total to 18. The preview test walks all three notebook routes as well as onboarding. Writing is a visual prototype state; this does not implement a note-storage application.

Visual reference: [Field Notes Original Kraft](https://fieldnotesbrand.com/products/original-kraft), interpreted through original Maple-branded covers, large stamped titles, muted kraft/olive/brown stock, paper edges, a red margin and ruled interiors. These are editable scene elements.

## Page organization

The saved document now uses real Onboarding, Home and Notes folders. Page names are short labels such as Overview, Evidence and Everyday. Existing node IDs and prototype links are preserved. The standalone file was refreshed from the live document so intervening canvas edits were retained. Folder create/rename/move/remove are available in the updated Sugar Maple build; removal keeps contained pages.
