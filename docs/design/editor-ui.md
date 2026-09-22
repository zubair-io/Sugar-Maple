# Sugar Maple desktop editor UI specification

Status: accepted interface requirements from the user-supplied desktop layout brief. This document specifies the product UI; it does not claim that the controls or their backing features are implemented.

Reference workstation: **1440 × 900 logical pixels**, macOS dark appearance. The same editor runs in a browser and in the macOS WKWebView shell. The implementation roadmap controls when features become available; the availability table below makes those boundaries explicit.

## 1. Visual language and ownership

Use `_Maple` for application chrome: high information density, a neutral dark theme, compact controls, crisp typography, and subtle 1px borders. Reuse its component contracts, icon set, spacing, typography, focus and theme tokens. Separate regions with surface changes and fine borders rather than large cards or heavy shadows.

Canvas content is authored document UI rendered with HTML/CSS and inline SVG. It remains independent of host Maple components and theme styles. Optional Maple design-system bindings are metadata and export mappings. A dark editor can display light or dark artboards without altering document tokens.

The native macOS window has rounded top corners and standard close, minimize and fullscreen traffic lights at top-left. Reserve the first 80px of the titlebar for these controls and safe spacing. The native host owns the actual window controls; the browser editor uses its browser window and does not impersonate native controls with nonfunctional buttons.

## 2. Shell geometry

| Region | Reference dimensions | Behavior |
| --- | --- | --- |
| Unified titlebar / top navigation | 48px high, full width | Fixed height; native drag regions exclude interactive controls |
| Left sidebar | 280px default; 220–400px | Resizable and collapsible |
| Canvas viewport | Remaining width and height | Infinite pan/zoom workspace |
| Right inspector | 320px default; 260–420px | Resizable and collapsible; contents follow mode and selection |
| Bottom status bar | 28px high, full width | Fixed height; document, viewport and agent telemetry |

At 1440 × 900, default body height is 824px and the nominal canvas region is 840px wide. Panel dividers are included within the adjacent panel widths. The top and bottom bars span all three columns.

Panel dividers support pointer dragging and keyboard-accessible resizing, with min/max limits enforced. Collapse controls remain reachable after collapse, restore the previous width and expose expanded state to assistive technology. Remember panel widths and collapsed state as workspace preferences, independently of document content and undo history.

For narrower windows, preserve legibility rather than shrinking typography. Compact document tabs and lower-priority toolbar labels first, then use an accessible overflow menu for secondary controls. Keep the mode switcher, active-document identity, Preview and an MCP status affordance accessible. Permit either sidebar to collapse; on widths that cannot accommodate the minimum panels and a usable canvas, show one requested panel at a time with an explicit toggle. The 48px titlebar and 28px footer do not grow into multiple rows. Inspector/sidebar content may scroll independently.

## 3. Titlebar and top navigation

### Left: documents

After the 80px traffic-light offset, show the active document name, for example `CheckoutFlow.syrup`, an unsaved dot when appropriate and a dropdown for save status and available history actions.

When multiple documents are open, show compact document tabs such as `Sign-In.syrup` and `CheckoutFlow.syrup`. Each tab has an accessible name, active state and close action. Overflow must retain access to all documents. Closing or switching a file follows its actual dirty/persistence state; do not imply changes were saved when they were not.

Document changes autosave. New Mac documents save locally without a picker; opened or explicitly saved documents update their chosen file. The save state distinguishes Saving, Saved locally, Saved to .syrup bundle, Saved in this browser and Save Failed. Only mark the current document/revision saved after persistence completes. Version-history entries appear only when backed by an implemented history feature.

### Native File menu

In the macOS app, New (⌘N), Open… (⌘O), Save (⌘S) and Save As… (⇧⌘S) belong in the native File menu and do not appear as titlebar buttons. The browser retains its visible file controls. All entry points use the editor's existing document lifecycle and native package dialogs. Native menu shortcuts must not also trigger a second web save. New/Open confirm replacement of any dirty document, including pages or comments without canvas nodes.

### Center: mode switcher

A compact segmented pill selects **Design (1)**, **Prototype (2)** or **Developer (3)**. Use a subtle active surface and clear text contrast. Expose the selected state semantically and keep the control keyboard operable.

Switching modes preserves the active document, selection and camera. It changes the inspector and canvas interaction affordances, not the authored scene itself. Single-key shortcuts are inactive while typing, composing text or editing an input; modal dialogs take precedence.

### Right: agent status, tools and preview

Display the following controls in compact groups with separators:

- **MCP badge:** `MCP: 127.0.0.1:48480`, a connection indicator and `Idle` or `Agent Writing…`. The endpoint text can move to the badge's accessible popover at constrained widths.
- **Selection** (`V`), **Frame** (`F`), **Shape** dropdown (`R` for rectangle), **Text** (`T`) and **Repeat Grid** (`G`). `Cmd/Ctrl+G` remains grouping, distinct from the bare `G` shortcut. Disabled/context-inapplicable actions explain why they are unavailable.
- **Zoom menu:** current percentage, `100%`, `Fit All` and `Zoom Selection`.
- **Viewport preset menu:** `Desktop 1440`, `Tablet 834`, `Mobile 393`.
- **Preview:** a prominent secondary button labeled `▶ Preview`, launching the isolated click-through runner.

Tooltips show names and shortcuts; icon-only controls have accessible labels. Creating/mutating drawing tools are available in Design mode. Prototype provides interaction-link editing, and Developer inspection does not accidentally move or activate controls. Selection/navigation remain usable in every mode.

MCP states must reflect the actual host/client/transaction lifecycle: starting, ready with no client, connected/idle, writing, disconnected and error. A green dot is not proof of a completed transaction. A subtle pulse may indicate activity; honor reduced-motion preferences and convey state in text as well as color. The badge opens connection details and recent transaction outcomes without exposing credentials.

## 4. Left sidebar

The header contains compact icon-and-label tabs: **Pages | Layers | Assets | Tokens**. Retain each tab's search/expansion state when switching modes.

### Pages

Open this section by default. Keep page creation, renaming, removal and folder organization here. Selecting a page updates the canvas while leaving Pages open for browsing. Section switching preserves the active page, selection, layer filter and folder expansion state.

### Layers

Show the current page name with a Change page action that opens Pages. Place a layer-name filter below it, followed by a hierarchical tree for the active page only. Show artboards, frames, groups, Repeat Grids, horizontal/vertical stacks, text, vector paths and component instances with distinct icons and indentation.

Example hierarchy:

```text
Page 1
  Mobile — Sign In
    SignInCard
      Avatar
      Heading
      InputStack
        EmailInput
        PasswordInput
      PrimaryActionButton
  Desktop — Home
    HeaderNav
    DashboardGrid
      SummaryCard
      ActivityList
  Mobile — Nav
```

Selection stays synchronized with the canvas. Reveal the selected node's ancestors. Rows expose Show/Hide and Lock/Unlock on hover, keyboard focus and the row action menu; touch users must not depend on hover. Hidden/locked state remains visibly identifiable. Support rename, reorder and reparent through validated commands, with cycle prevention.

### Assets

Use accordions for **Document Components** and an optional **Maple UI System** mapping library. Show reusable masters such as Button, Input, Card, Checkbox and HeaderNav as compact thumbnail cards. Support drag-and-drop insertion and a keyboard-accessible Insert action.

Document components are not constrained to the optional library. Maple-bound entries resolve to semantic scene definitions and optional export metadata; they must not import editor-chrome instances into the canvas runtime. Identify missing or incompatible bindings instead of silently substituting another component.

### Tokens

Show a DTCG token group tree: **Colors** (brand, surface, text), **Spacing**, **Radii** and **Typography**. Display names, resolved values and aliases, with swatches for colors.

A **Light Mode / Dark Mode** switch previews the document's token modes. This is independent of the editor's appearance. Clearly distinguish a temporary preview from a persisted change to the design, and apply persisted edits through normal commands.

### New-file empty state

Show a restrained outline illustration and quick-start actions:

- `Create Artboard (F)`
- `Import Figma/SVG`
- `Load Design Tokens`

The import entry opens explicit choices. SVG import is part of the planned asset workflow. Figma import requires a separately specified importer and must not be presented as working before that exists; label its option as unavailable/planned, with the reason. The available SVG path remains usable. See the availability table in section 11.

## 5. Canvas viewport

Use a dark dot-grid workspace with world-coordinate pan/zoom. Grid spacing adapts visually to zoom while document geometry remains stable. Support the existing navigation and selection requirements, including fit-to-content and zoom-to-selection.

The reference document contains:

- **Mobile — Sign In, 393 × 852:** avatar, heading, input stack and action buttons.
- **Desktop — Home, 1440 × 900:** header/navigation and a dashboard grid.

Artboard labels show authored names and dimensions. All artboards share the same camera scale; do not individually shrink artboards to compose an attractive screenshot. At default panel widths, both artboards can be shown fully with Fit All. At 100%, clipping and panning are expected.

Active selection has an electric-blue outline and eight resize handles. Selection outlines and handle hit areas remain usable at different zoom levels. Spacing guides show measured distances, with example labels `16px` and `24px`; these values must reflect actual geometry.

Repeat Grid selection adds emerald-green right/bottom resize handles and draggable gap sliders between rows/columns. Use labels and distinct handle treatment so color alone does not communicate meaning. Resize and gap gestures follow the grouped-undo contract.

In **Prototype** mode, show a blue interaction wire between the mobile action button and the desktop artboard. Its chip reads `On Tap → Dissolve (300ms)` for the reference interaction. Endpoints follow node geometry and camera transforms. The wire is inspectable and editable; it is hidden when it would obstruct Design or Developer work.

## 6. Details panel: Design mode

The right panel is titled **Details** in Design mode. Both side panels have persistent collapse/expand buttons at the left and right ends of the canvas toolbar, with directional panel icons, action tooltips and expanded state. Either or both panels can collapse independently, giving their space to the canvas. Restoring a panel retains its active section, filters and unposted comment draft.

Sections are compact, collapsible and contextual to selection. Show shared values for multi-selection and a clear mixed-value state. Do not display editable properties that do not apply to the selected node.

### Transform and alignment

- Six alignment actions: Left, Center, Right, Top, Middle, Bottom.
- Numeric fields: X, Y, W, H, Rotation (`0°`) and Corner Radius.
- Position values follow the documented parent-relative coordinate contract. Constraints and managed-layout values explain why direct editing is unavailable.

### Responsive and content-aware layout

- Flow: **Horizontal Stack | Vertical Stack | Grid | Free**.
- Horizontal and vertical sizing: **Fixed | Hug | Fill**.
- Gap, initially `16px` in the sample.
- Padding: Top `12`, Right `16`, Bottom `12`, Left `16` in the sample.
- Manual pinning matrix: Top, Bottom, Left, Right and Center. Center expresses centering on the relevant axis; prevent contradictory center/edge constraints and explain their precedence.

### Typography and appearance

For text-bearing selections, expose font family, weight, size, line-height and letter-spacing. Surface missing-font fallback explicitly. Show applicable appearance properties for the selected node.

### Fills and strokes

Show a color chip, token binding such as `{color.surface.primary}`, resolved value such as `#18181B`, and opacity. Provide applicable stroke controls. Binding, editing a token and setting a literal override must remain distinct operations.

## 7. Right inspector: Prototype mode

- **Trigger:** On Click / Tap, While Hovering, On Drag.
- **Action:** Navigate To (destination artboard), Open Overlay, Close Overlay, Back.
- **Transition:** Instant or Dissolve; duration such as `300ms`; easing selector and curve preview, including the requested Ease Out and Spring choices when supported.
- **Overlay settings**, shown only for overlay actions: Center, Bottom Sheet or Manual positioning, plus background dimming with the reference value `50%`.

For MVP, click/tap, supported actions and Instant/Dissolve are executable. Hover/drag and Spring remain explicitly unavailable until their tracked runtime work lands. Preserve these controls in the full UI contract without inventing executable behavior. The current runtime must publish the exact supported easing set; disabled alternatives have an explanation.

Selection of a wire opens that interaction's configuration. Invalid or deleted destinations produce a visible diagnostic. Editing prototype rules uses document commands; running a prototype uses ephemeral runtime state and does not dirty the authored document.

## 8. Right inspector: Developer mode

Developer mode is inspection-first. Picking a rendered control selects its semantic node without triggering its action or changing its geometry.

### Node identity

Show authored layer name, component/master identity, variant and size. For a mapped sample:

```text
PrimaryActionButton
mui-button (Angular) / MuiButton (SwiftUI)
v1.4.0 · Variant: primary · Size: md
```

These names and version are illustrative specimen data. Production values come from the explicit document binding and pinned source metadata. An unmapped node displays its semantic type and authored name; optional mapping absence must not block portable export.

### Bound design tokens

Display token names alongside resolved values, including aliases where applicable. Example rows:

| CSS custom property | Resolved value |
| --- | --- |
| `--spacing-md` | `16px` |
| `--color-brand-primary` | `#2563EB` |
| `--radius-sm` | `4px` |

### Separate copy targets

Provide distinct, labeled actions, wrapping within the inspector rather than clipping:

- **Copy Tailwind 4** — standalone classes or the complete semantic element, with the selected format clear.
- **Copy Plain CSS** — rules using document CSS custom properties and their required declarations.
- **Copy Angular** — a portable Angular template/component; a simple button can use `<button class="…">…</button>`.
- **Copy SwiftUI** — idiomatic native `Button(action: …) { … }` with required state/binding context.

Also retain **Copy Name**, **Copy Editable Element**, and optional **Copy Mapped Component** actions from the developer-handoff requirements. Library-specific mappings are a separate export choice; default Angular and SwiftUI output must not require Maple libraries.

The reference Tailwind class output is:

```text
inline-flex items-center px-4 py-2 bg-blue-600 rounded text-white
```

This is an illustrative literal-style example. Token-preserving export should retain the document's token relationship through theme mappings or CSS-variable utilities, rather than silently replacing every token with a built-in palette class.

A read-only, syntax-highlighted code box shows the selected target and has a one-click **Copy** button. It must display exactly the payload that will be copied, including prerequisites or clearly associated setup sections. Confirm successful clipboard writes; provide a selectable/manual-copy fallback on failure. Action callbacks represent integration points, not invented application behavior.

## 9. Bottom status bar

| Zone | Content |
| --- | --- |
| Left | Cursor world coordinates, e.g. `X: 420, Y: 180`; actual document persistence state |
| Center | Agent connection/transaction state and undo affordance |
| Right | Desktop / Tablet / Mobile viewport shortcuts; zoom slider and current percentage |

Examples include `✓ Saved to .syrup bundle`, `Agent Ready`, and `Agent Transaction Active: 4 mutations`. Counters come from actual transaction progress. While a batch is in flight, do not imply it is already undoable; display `Undo: Cmd+Z` after successful commit. Failure must not leave a false success indicator. The early MCP slice with session-local data displays `Unsaved — session only`.

Footer viewport controls and the titlebar preset menu share one state. In the editor, a preset applies to the explicitly selected artboard through a command; without an artboard selection it prompts the user to select/create one. In the isolated preview, presets resize the preview viewport without changing the design. Zoom controls affect only the camera and never resize authored nodes.

## 10. Modes, accessibility and state handling

- Preserve document, selection, camera and sidebar tab across mode changes. Inspector section state can be remembered per mode.
- Empty selection shows document/artboard guidance; missing bindings, unsupported exports, loading assets and stale/deleted selection have explicit states.
- Escape cancels an in-progress gesture or closes the active popover/dialog before affecting selection. Focus returns to its initiating control.
- Native menu and web shortcuts route to the same command once. Editing text, IME composition and assistive technology shortcuts must not trigger canvas tools.
- Use keyboard-operable tabs, trees, menus, numeric controls and panel dividers, with visible focus and accessible names. Announce mode changes, copy results and transaction outcomes without announcing every cursor coordinate or animation frame.
- Keep error, disabled, selected, hover and focus states distinguishable. Respect reduced motion and avoid relying on color alone for connection, selection or grid state.
- Preview opens an isolated runner with reset, viewport selection and a return-to-editor action. It cannot access privileged file/host capabilities through rendered content.

## 11. Delivery ownership and availability

| Requirement | Existing issue / delivery boundary |
| --- | --- |
| Chrome, titlebar groups, resizable/collapsible columns, sidebar tabs | [#4](https://github.com/zubair-io/Sugar-Maple/issues/4); native window integration in [#5](https://github.com/zubair-io/Sugar-Maple/issues/5) |
| Camera, selection, guides and handles | [#8](https://github.com/zubair-io/Sugar-Maple/issues/8) |
| Artboards, text, layers and appearance inspector | [#9](https://github.com/zubair-io/Sugar-Maple/issues/9) |
| Stacks, sizing and manual responsive constraints | [#10](https://github.com/zubair-io/Sugar-Maple/issues/10) |
| Tokens and Assets tabs | [#11](https://github.com/zubair-io/Sugar-Maple/issues/11), [#12](https://github.com/zubair-io/Sugar-Maple/issues/12) |
| Repeat Grid controls | [#13](https://github.com/zubair-io/Sugar-Maple/issues/13) |
| Prototype inspector, wires and isolated runner | [#14](https://github.com/zubair-io/Sugar-Maple/issues/14) |
| Developer inspector, copy targets and clipboard behavior | [#15](https://github.com/zubair-io/Sugar-Maple/issues/15)–[#18](https://github.com/zubair-io/Sugar-Maple/issues/18) |
| SVG import | [#19](https://github.com/zubair-io/Sugar-Maple/issues/19) |
| MCP badge and transaction feedback | Minimal truthful state in [#20](https://github.com/zubair-io/Sugar-Maple/issues/20); complete shell integration in [#27](https://github.com/zubair-io/Sugar-Maple/issues/27) |
| Save indicators and recovery | [#7](https://github.com/zubair-io/Sugar-Maple/issues/7) |
| Version history | Post-MVP [#22](https://github.com/zubair-io/Sugar-Maple/issues/22) |
| Hover/drag prototype triggers and Spring | Post-MVP [#24](https://github.com/zubair-io/Sugar-Maple/issues/24) |
| Figma import | Requested full-product UI entry; importer format, fidelity and implementation ticket still need specification before enabling |

This UI contract does not make the completed three-column shell a prerequisite for the early MCP loop. #20 uses a minimal truthful interface first; subsequent shell work adopts the geometry and controls here.

## 12. UI acceptance criteria

- At 1440 × 900, bars measure 48px/28px and default sidebars measure 280px/320px, with a flexible canvas between them. No titlebar controls overlap or clip.
- Both panel resize ranges and collapse/restore paths work by pointer and keyboard, including narrow-window overflow behavior.
- All three modes switch inspector contents and canvas affordances while retaining document, selection and camera.
- Pages, Layers, Assets and Tokens support their specified controls, with actual document data and no host-theme leakage into canvas content.
- The sign-in/dashboard fixture displays at a consistent camera scale, with correct selection bounds, measured spacing guides, Repeat Grid handles and prototype wire.
- Design properties, prototype links and presets invoke the intended command or ephemeral-preview action; text editing does not trigger global tool shortcuts.
- Developer identity, tokens, selected snippet and copied payload agree; custom/unmapped nodes retain portable outputs.
- Save and agent indicators represent actual persisted/committed state, including disconnected, failed and session-only cases.
- Unimplemented history/import/trigger/easing options are explicitly unavailable; enabled actions are functional and testable.
- Browser and WKWebView checks include all three modes, both collapsed panels, empty and multiple selection, clipboard failure, and agent-active/error states. Capture visual evidence alongside interaction assertions.

### Page organization amendment

Use explicit single-level folders in the Pages list. Do not infer structure from slashes or prefixed page names. Folder rows expand/collapse and allow inline renaming. The active page has a folder selector including “No folder”; newly added pages inherit that selection. Removing a folder returns its pages to the root without deleting content. Names such as “Overview” and “Evidence” sit under “Home”, while onboarding and notebook screens use their own folders. Prototype targets continue to use stable node IDs across organization changes.

### Page feedback amendment

The right panel has **Details | Comments** tabs, styled like the left sidebar sections. Comments always lists the current page; there is no page picker or all-pages UI. Open/resolved/all status filtering remains available.

Place the **Comment** tool beside the canvas element tools. Activate it, click a canvas position, write in the nearby composer, then Post comment. Enter/Space on the placement surface offers a keyboard alternative at the viewport center; Escape cancels. Placement intercepts node input so it cannot move or activate authored elements. Drafts belong to their page and remain in memory when switching pages; only posting commits/autosaves the thread.

A posted comment with an anchor has a bubble at that page's world-coordinate position. Bubbles follow pan/zoom but retain a readable screen size. Clicking a bubble expands the right panel, activates Comments, reveals the thread even if its status was filtered out, scrolls/focuses it, and briefly pulses its background color. Retain a selected border after the pulse and honor reduced-motion settings. Resolved bubbles are muted but remain inspectable. Legacy unpinned comments stay in the page list without invented positions. Pins are editor annotations and do not enter previews or exported designs.

Threads retain plain text, origin labels, timestamps, replies and Resolve/Reopen. Human and agent changes share document commands, undo and autosave. Posting feedback does not automatically wake an agent.
