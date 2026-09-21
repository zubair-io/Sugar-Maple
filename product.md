# Product Requirements Document (PRD)

**Product Name:** Sugar Maple

**Document Version:** 1.0

**Target Release:** Q1 2027

**Status:** Ready for Review

---

## 1. Executive Summary & Vision

**Sugar Maple** is a modern, local-first UI/UX design, interactive prototyping, and developer handoff platform. By unifying the vector precision of Sketch, the rapid layout features of Adobe XD (Repeat Grid, Auto-Animate), the layout fidelity of Penpot (native W3C CSS Flexbox & Grid), and the collaboration strengths of Figma, Sugar Maple eliminates cloud vendor lock-in, recurring per-seat fees, and network latency.

The platform stores all projects locally as transparent package directories (`.syrup` / `.design`), uses Conflict-Free Replicated Data Types (CRDTs) over peer-to-peer/local networks for real-time collaboration, integrates directly with Git for version control, and exposes an embedded local daemon with Model Context Protocol (MCP) server support for native IDE handoff and AI tooling integration.

---

## 2. Problem Statement & Target Audience

### The Problem

* **Vendor Lock-in & Data Privacy:** Modern UI design tools force design assets into proprietary cloud databases, creating significant compliance, intellectual property, and offline availability issues.
* **Layout Mismatch:** Designers manipulate abstract geometry (Figma Auto Layout) that does not fully mirror modern frontend engineering primitives (CSS Grid, Flexbox wrapping, fraction units).
* **Bloated Handoff Pipelines:** Developers must maintain separate subscriptions (Zeplin, Figma Dev Mode) to inspect static specs, manually translating designs to code with minimal bi-directional linkage to actual codebases.
* **Disjointed Prototyping Tools:** Moving beyond simple click-through flows requires exporting assets into specialized tools (ProtoPie, Rive, Origami), fragmenting the source of truth.

### Target Audience

* **Product Designers & Design Technologists:** Need vector design, advanced responsive layout systems, and high-fidelity interactive state prototyping.
* **Frontend & Systems Engineers:** Need local inspection, exact CSS/SwiftUI/Compose property extraction, DTCG design token synchronization, and direct Git repository integration.
* **Autonomous AI Agents & Tool Integrators:** Require programmatic local access to scene graphs, component states, and token registries via MCP.

---

## 3. Core Architecture & System Specifications

```
Sugar Maple Canvas Client (HTML/CSS + Inline SVG)
   │
   ├── Core Layout Engine (W3C CSS Grid & Flexbox via Taffy/Yoga)
   ├── State Machine & Expression Runtime (Auto-Animate / Spring Physics)
   └── Document Package Manager
          │
          ├── File System Storage Engine (.syrup directory package)
          ├── CRDT Multiplayer Sync Engine (Local P2P / mDNS / WebRTC)
          ├── Git Versioning & Visual Diff Engine
          └── Embedded Local Daemon (REST/IPC & Model Context Protocol)

```

---

## 4. Feature Requirements

### 4.1. Storage, File System & Synchronization Engine

| Requirement ID | Feature | Specification | Priority |
| --- | --- | --- | --- |
| **STO-001** | **Local Directory Bundle (`.syrup`)** | Projects reside directly on the local disk as directory packages containing human-readable JSON/text files (`manifest.json`, `scenes/canvas_root.json`, `tokens/design-tokens.json`, `state_machines.json`) and content-addressed binary assets (`assets/images/`, `assets/fonts/`). | **P0** |
| **STO-002** | **CRDT Real-Time Sync** | Real-time edits write to a local append-only transaction log (`crdt/changes.log`). P2P multiplayer sync resolves deterministically using Yjs/LWW-element CRDTs over local network (mDNS/WebRTC) or self-hosted relay servers. | **P0** |
| **STO-003** | **Git-Native Versioning & Diffing** | Git repository changes trigger native pixel-diff and structural JSON-diff views showing shifted coordinates, token deviations, and structural node additions/deletions. | **P1** |
| **STO-004** | **100% Offline Autonomy** | All vector operations, compilation, layout calculations, and prototyping run locally with zero network connection. | **P0** |

---

### 4.2. Code-Aligned Layout & Canvas Engine

| Requirement ID | Feature | Specification | Priority |
| --- | --- | --- | --- |
| **LAY-001** | **W3C CSS Flexbox & CSS Grid** | Native canvas containers implement CSS Flexbox (gap, flex-wrap, align/justify) and 2D CSS Grid (fractional units `fr`, auto-fill, auto-fit, minmax) matching production browser layout engines. | **P0** |
| **LAY-002** | **Dynamic Repeat Grid** | Direct visual drag-handles replicate layers along X and Y axes with adjustable gutters. Supports instant data population via local drag-and-drop of `.json`, `.csv`, or image asset folders. | **P0** |
| **LAY-003** | **Dynamic Content-Aware Layout** | Containers expand, collapse, and re-anchor adjacent or parent frames dynamically when internal dynamic text or nested component sizes mutate. | **P1** |
| **LAY-004** | **Vector Boolean & Path Topology** | Non-destructive Boolean operators (Union, Subtract, Intersect, Exclude), path-flattening, and arbitrary vector networks with native SVG import/export compliance. | **P0** |

---

### 4.3. Component Architecture & Design Token System

| Requirement ID | Feature | Specification | Priority |
| --- | --- | --- | --- |
| **TOK-001** | **W3C DTCG Token Compliance** | Tokens for colors, typography, sizing, spacing, borders, shadows, and animations strictly follow the W3C Design Tokens Community Group format and export to clean, consumable JSON/CSS variables. | **P0** |
| **TOK-002** | **Unified Variant & State Matrix** | Components encapsulate visual dimensions (size, variant, theme) and interaction states (`hover`, `active`, `focused`, `disabled`) within a single entity without multiplying canvas artboards. | **P0** |
| **TOK-003** | **Exposed Component Properties** | Slots, boolean visibility toggles, text replacement fields, and instance swappers map directly to code props (React, Angular, SwiftUI, Jetpack Compose). | **P1** |

---

### 4.4. Interactive Prototyping & State Execution

| Requirement ID | Feature | Specification | Priority |
| --- | --- | --- | --- |
| **PRT-001** | **State Machines & Variables** | In-memory evaluation of local logic variables (boolean, int, float, string) with conditional logic rules (`if`/`else`, arithmetic mutations) for prototyping forms, counters, and navigation state. | **P1** |
| **PRT-002** | **Auto-Animate Path & Frame Morphing** | Identical layer IDs between screens or variant states automatically calculate spring physics or cubic-bezier interpolations for fluid micro-interactions. | **P1** |
| **PRT-003** | **Multi-Modal Triggers** | Supports user input triggers including pointer clicks, hover, keyboard shortcuts, gamepad actions, and local microphone/voice commands. | **P2** |
| **PRT-004** | **Sandboxed Local Preview** | Dedicated local HTML/SVG preview window supporting live device frames, viewport-constrained scrolling, and responsive breakpoint testing. | **P0** |

---

### 4.5. Embedded Developer Handoff & Tooling Interop

| Requirement ID | Feature | Specification | Priority |
| --- | --- | --- | --- |
| **DEV-001** | **Local Spec & Inspect Mode** | Integrated zero-cloud developer inspection mode displaying box-model margins, paddings, computed styles, token names, and platform-specific code generation (CSS, SwiftUI, Compose). | **P0** |
| **DEV-002** | **Bidirectional Code Linkage** | Bidirectional mapping between canvas components and local disk repositories or Storybook files via `overrides/dev-links.json`. | **P1** |
| **DEV-003** | **Canvas Architecture Connectors** | Infinite canvas flow lines with conditional routing badges to document application logic, routing hierarchies, and user journeys. | **P1** |
| **DEV-004** | **Local MCP Server & IPC Daemon** | Runs a local daemon (`localhost:48480` / Unix socket) exposing Model Context Protocol (MCP) endpoints (`get_component_spec`, `link_code_component`, `export_assets`) to AI coding agents and IDE extensions. | **P0** |

---

## 5. Non-Functional Requirements

### Performance & Scalability

* **Canvas Rendering:** Stable 60–120 FPS panning, zooming, and editing on complex files (10,000+ nodes) using HTML/CSS and inline SVG rendering.
* **Bundle Cold Load:** `.syrup` bundles under 100 MB must deserialize, parse, and reach full interactivity in `< 1.2s`.
* **Zero Input Latency:** Local modifications commit to the in-memory scene graph within `< 8ms`, triggering asynchronous background persistence to disk.

### Security & Privacy

* **Air-Gapped Operation:** The platform runs with zero required outbound HTTP/HTTPS requests.
* **Local Data Sovereignty:** No analytics telemetry, user documents, or design tokens leave the host machine without explicit peer synchronization configurations.

---

## 6. Implementation Milestones

```
Phase 1: Foundations (Months 1–3)
├── Implement .syrup package reader/writer & local disk file watcher
├── Integrate Taffy/Yoga layout engine with CSS Flexbox & CSS Grid
└── Build HTML/SVG canvas rendering (shapes, paths, Boolean geometry)

Phase 2: Components, Tokens & Repeat Grid (Months 4–6)
├── Implement W3C DTCG design token parser & serialization engine
├── Build component variant matrix & state manager
└── Build Repeat Grid interaction with local JSON/CSV/image drag-and-drop

Phase 3: Prototyping & Developer Daemon (Months 7–9)
├── Implement state machine, variable evaluation & Auto-Animate spring transitions
├── Launch local handoff inspection HUD & code exporter (CSS, SwiftUI, Compose)
└── Expose local IPC & Model Context Protocol (MCP) server daemon

Phase 4: Collaboration & Hardening (Months 10–12)
├── Implement local network (mDNS/WebRTC) CRDT synchronization
├── Add Git repository status integration & visual canvas diffing
└── Performance profiling, battery optimization, and v1.0 desktop packaging

```

---

## 7. Concrete Next Steps & Verification Checklist

1. **Storage Subsystem Verification**
* [ ] Validate `.syrup` bundle parsing and serialization roundtrip with zero data degradation on 5,000-node scene graphs.
* [ ] Verify disk writes to `crdt/changes.log` execute asynchronously without blocking the main canvas UI thread.


2. **Layout Engine Conformance**
* [ ] Test 2D CSS Grid templates (`repeat(auto-fit, minmax(200px, 1fr))`) against browser reference outputs to ensure 100% pixel parity.
* [ ] Verify that dragging Repeat Grid handles dynamically inflates mock JSON records without frame drops.


3. **Handoff Daemon & Tooling Verification**
* [ ] Start the local MCP server over `localhost:48480` and execute `get_component_spec` from an IDE plugin or command-line client.
* [ ] Ensure all design token bindings in the inspected component return valid W3C DTCG values defined in `tokens/design-tokens.json`.