# RFC: Syrup — Local-First UI Design & Prototyping Platform

* **Document ID:** RFC-2026-SYRUP-001
* **Status:** Proposed; rendering updated to HTML/CSS + inline SVG
* **Target Platforms:** macOS, WebAssembly/Browser, iOS Companion (Preview)
* **Author:** Core Engineering & Product Architecture

---

## 1. Executive Summary

Syrup is a vector-based user interface design, layout, and prototyping application targeting modern web, desktop, and mobile application development. Built on a local-first, low-overhead architecture, Syrup combines automated layout engines (Content-Aware Layout, Responsive Resize, Repeat Grid) with cross-platform prototyping.

Unlike traditional design software, Syrup incorporates an embedded Model Context Protocol (MCP) server directly into the host process, exposing bidirectional document manipulation and inspection to local or remote LLM agents (Claude, ChatGPT, internal developer agents) via standardized JSON-RPC protocols.

---

## 2. Core Architecture & Document Engine

```
+-----------------------------------------------------------------------+
|                             Syrup Host                                |
|                                                                       |
|   +-------------------+  +-------------------+  +-----------------+   |
|   |   Design Canvas   |  |   Layout Engine   |  | Animation Engine|   |
|   | (Vector Renderer) |  | (Flex/Constraint) |  |  (Spring/State) |   |
|   +---------+---------+  +---------+---------+  +--------+--------+   |
|             |                      |                     |            |
|   +---------v----------------------v---------------------v--------+   |
|   |                    Document State (CRDT)                      |   |
|   |      - Nodes, Components, Layout Rules, Prototype Links       |   |
|   +-------------------------------+-------------------------------+   |
|                                   ^                                   |
|                                   | IPC / Local Loopback              |
|   +-------------------------------+-------------------------------+   |
|   |                   Embedded MCP Server                         |   |
|   |  - Transport: stdio / SSE (localhost:49152 - 49200)           |   |
|   |  - Tool Endpoints, Document Context Provider, Action Dispatch |   |
|   +---------------------------------------------------------------+   |
+-----------------------------------|-----------------------------------+
                                    |
                    LLM Clients (Claude, Codex, etc.)

```

### Document Model & Memory Topology

* **State Management:** Conflict-free Replicated Data Type (CRDT) document graph storing vector paths, component overrides, constraint trees, and interaction triggers.
* **Storage Footprint:** Flat, unpackaged binary/JSON-LD hybrid format with local-first file persistence (`.syrup`), backed by an append-only transaction log.
* **Canvas Rendering:** HTML/CSS for platform-agnostic UI controls, text and layout, with inline SVG for vector geometry and overlays, projected from the authoritative local Yjs scene graph.

---

## 3. Feature Specifications

### 3.1 Repeat Grid

Enables instant multiplication of identical or templated interface elements across orthogonal axes.

* **Mechanics:**
* Selecting any group or artboard and toggling Repeat Grid generates non-destructive green control handles on the `X` and `Y` axes.
* Dragging handles instantiates virtual clones that preserve layer hierarchies, constraint bindings, and layout spacing.


* **Data Decoupling:**
* Structural properties (size, radius, padding, stroke) remain globally synced across all instances.
* Overrides (text strings, image fills, vector masks) are decoupled. Dragging a collection of image files or text lists directly onto a primary cell populates successive cells in topological order.


* **Gap Controls:** Direct on-canvas hover targets expose interactive margin sliders between rows and columns.

### 3.2 Content-Aware Layout

Automates structural positioning and containment padding when interior node dimensions mutate.

* **Stack Engine:** Implements one-dimensional and two-dimensional directional flows (`Horizontal`, `Vertical`, `Wrap`).
* **Padding Intelligence:**
* Containers maintain dynamic offsets (`Top`, `Right`, `Bottom`, `Left`) relative to their child bounds.
* Deleting, reordering, or expanding an inner child immediately recalculates sibling transforms and shifts outer parent bounds without manual bounding-box manipulation.


* **Smart Distribution:** Reordering items within a content-aware group is handled via drag-and-drop layer re-indexing, with real-time positional collision and animation previews.

### 3.3 Responsive Resize

Provides deterministic multi-screen adaptation across arbitrary viewport dimensions without requiring duplicated artboards.

* **Constraint System:**
* **Auto Mode:** Evaluates object hierarchy and relative positions. Anchors small corner elements (e.g., status bar icons, FABs) to nearest edges, locks dimensions for fixed-size icons, and stretches central card arrays.
* **Manual Mode:** Explicit pinning overrides:
* Pinning: `Left`, `Right`, `Top`, `Bottom`.
* Dimension Locking: `Fixed Width`, `Fixed Height`.
* Percentage Width: Anchors bounds to parent frame percentages.




* **Platform Presets:** Immediate artboard switching across configured screen profiles (Desktop 1440px, Tablet 834px, Mobile 393px) with live interpolation previewing.

### 3.4 Components & Contextual Variant States

Reusable design primitives supporting local property overrides and nested variant states.

* **Instance Architecture:** Master components act as prototype definitions. Instances store a differential delta (overrides only), referencing the master via UUID.
* **State Modifiers:**
* Components support discrete visual states: `Default`, `Hover`, `Pressed`, `Focused`, `Disabled`, and user-defined contexts (e.g., `Logged-In`, `Dark Mode`).
* Nested instances pass contextual overrides upward without breaking underlying auto-layout dependencies.


* **Component Swapping:** Retains existing contextual overrides (custom labels, fills) when switching instances, provided slot signatures match.

### 3.5 Prototype & Animation Engine

Connects design states via physical, timeline-driven, or transition-based interactions.

* **Interaction Graph:** Directed graph mapping triggers (`On Tap`, `On Drag`, `While Hovering`, `Key/Gamepad`, `Voice Trigger`) to destination artboards or overlays.
* **Auto-Animate:** Matches identical layer names across source and target artboards to compute automated property transitions (position, rotation, scale, opacity, corner radius, path morphing).
* **Easing Profiles:** Physics-based spring models (stiffness, damping, mass) alongside standard cubic-bezier curves.
* **Mobile Companion Handoff:**
* Local Wi-Fi or USB tethering pairing via zero-configuration mDNS.
* Live websocket frame stream allowing real-time interaction testing and multi-touch gesture validation directly on physical target devices.



### 3.6 Voice Design & Smart Assistant Prototyping

Enables design of conversational voice interfaces and voice-driven application control.

* **Voice Triggers:** State transitions configured to fire on keyword or natural phrase detection using local system speech-to-text (STT).
* **Speech Playback (TTS):** Prototype response action that converts defined string templates to synthesized audio playback upon artboard entry or interaction.
* **Voice Command Navigation:** Hands-free execution of Syrup design operations (e.g., *"Insert button component"*, *"Distribute horizontal 16px"*).

---

## 3.7 Desktop Editor Interface

The [desktop editor UI specification](../design/editor-ui.md) defines the 1440 × 900 shell and its Design, Prototype and Developer modes. It covers the 48px titlebar, resizable Layers/Assets/Tokens sidebar, infinite HTML/SVG workspace, contextual inspector, 28px status bar, developer copy controls and actual save/MCP transaction feedback. Follow its feature-availability rules when implementing the full interface.

---

## 4. Model Context Protocol (MCP) Server Architecture

Syrup embeds an internal, lightweight Model Context Protocol (MCP) server to allow local and remote AI agents to inspect, manipulate, generate, and review designs programmatically.

```
                    +--------------------------------+
                    |       External AI Client       |
                    |    (Claude Code, Codex, CLI)   |
                    +---------------+----------------+
                                    |
                    JSON-RPC 2.0 (stdio / SSE)
                                    |
+-----------------------------------v-----------------------------------+
|  Syrup Embedded MCP Server (Port: 49152, localhost-only)              |
|                                                                       |
|  [Security Validation: Token Auth + Loopback Interface Only]          |
|                                                                       |
|  +-------------------------+   +------------------------------------+ |
|  |     Tools / Actions     |   |             Resources              | |
|  | - create_node           |   | - syrup://documents/active/tree    | |
|  | - update_layout         |   | - syrup://documents/active/tokens  | |
|  | - set_component_state   |   | - syrup://selection/svg            | |
|  | - trigger_prototype_run |   | - syrup://canvas/render            | |
|  +------------+------------+   +-----------------+------------------+ |
|               |                                  |                    |
|  +------------v----------------------------------v------------------+ |
|  |                Syrup Native IPC Transaction Bridge               | |
|  +------------------------------------------------------------------+ |
+-----------------------------------------------------------------------+

```

### 4.1 Transport & Networking

* **Transports:** `stdio` (for local subprocess execution / CLI workflows) and `SSE` (Server-Sent Events over HTTP on `127.0.0.1`, restricted to dynamic loopback ports between `49152` and `49200`).
* **Authentication:** Ephemeral handshake token generated on Syrup launch, stored in the user runtime directory (`~/.syrup/mcp.sock` or `~/.syrup/auth.token`). Non-local IP bindings are rejected at the socket layer.

### 4.2 Resource Endpoints (Read-Only)

| URI | Description | MIME Type |
| --- | --- | --- |
| `syrup://documents/active/tree` | Returns serialized scene graph of selected or active artboard (IDs, layers, names, bounds). | `application/json` |
| `syrup://documents/active/tokens` | Exports design tokens (colors, typography styles, spacing constants). | `application/json` |
| `syrup://selection/svg` | Streams normalized SVG vector string of current canvas selection. | `image/svg+xml` |
| `syrup://canvas/render?artboardId={id}` | Exports rendered viewport bitmap for visual validation by multi-modal models. | `image/png` |

### 4.3 MCP Tool Declarations (Mutations & Actions)

The server exposes tools adhering strictly to MCP tool schemas:

#### `create_component`

Creates a master component with predefined layout parameters.

```json
{
  "name": "create_component",
  "description": "Instantiates a new master component on the canvas.",
  "parameters": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "layoutType": { "type": "string", "enum": ["none", "horizontal_stack", "vertical_stack"] },
      "padding": {
        "type": "object",
        "properties": {
          "top": { "type": "number" },
          "right": { "type": "number" },
          "bottom": { "type": "number" },
          "left": { "type": "number" }
        }
      },
      "children": { "type": "array", "items": { "type": "object" } }
    },
    "required": ["name", "layoutType"]
  }
}

```

#### `apply_repeat_grid`

Transforms an existing node or group into an automated Repeat Grid.

```json
{
  "name": "apply_repeat_grid",
  "description": "Converts a specified target node into a repeatable matrix grid.",
  "parameters": {
    "type": "object",
    "properties": {
      "targetNodeId": { "type": "string" },
      "columns": { "type": "integer", "minimum": 1 },
      "rows": { "type": "integer", "minimum": 1 },
      "gapX": { "type": "number" },
      "gapY": { "type": "number" },
      "dataOverrides": {
        "type": "object",
        "description": "Keyed arrays of strings or image URIs for populating child instance overrides."
      }
    },
    "required": ["targetNodeId", "columns", "rows", "gapX", "gapY"]
  }
}

```

#### `update_layout_rules`

Mutates Content-Aware and Responsive Resize parameters on a node.

```json
{
  "name": "update_layout_rules",
  "description": "Adjusts responsive constraints and content-aware layout behavior for a target node.",
  "parameters": {
    "type": "object",
    "properties": {
      "nodeId": { "type": "string" },
      "responsiveMode": { "type": "string", "enum": ["auto", "manual"] },
      "constraints": {
        "type": "object",
        "properties": {
          "pin": { "type": "array", "items": { "type": "string", "enum": ["top", "bottom", "left", "right"] } },
          "fixedWidth": { "type": "boolean" },
          "fixedHeight": { "type": "boolean" }
        }
      },
      "stackSpacing": { "type": "number" }
    },
    "required": ["nodeId"]
  }
}

```

#### `link_prototype_interaction`

Defines an interactive or animated transition between nodes.

```json
{
  "name": "link_prototype_interaction",
  "description": "Creates an interactive navigation or animation edge between two artboards/nodes.",
  "parameters": {
    "type": "object",
    "properties": {
      "sourceNodeId": { "type": "string" },
      "targetArtboardId": { "type": "string" },
      "trigger": { "type": "string", "enum": ["tap", "drag", "hover", "voice"] },
      "voicePhrase": { "type": "string" },
      "animationType": { "type": "string", "enum": ["instant", "dissolve", "auto_animate"] },
      "durationMs": { "type": "integer", "default": 300 },
      "easing": { "type": "string", "enum": ["linear", "ease_in_out", "spring"] }
    },
    "required": ["sourceNodeId", "targetArtboardId", "trigger", "animationType"]
  }
}

```

---

## 5. Security & Isolation Model

1. **Local Socket Boundaries:** The MCP server strictly rejects non-loopback bindings (`0.0.0.0` or external network cards are prohibited).
2. **Transaction Integrity:** Any action received via MCP executes within an isolated undo/redo transaction group tagged as `AgentTransaction`. Users can revert AI manipulations via standard `Cmd+Z`/`Ctrl+Z` without breaking human editing state.
3. **Resource Throttling:** Viewport bitmap exports (`syrup://canvas/render`) are throttled to a maximum of 10 requests per second to avoid starving the interactive editor.

---

## 6. Verification & Implementation Roadmap

```
Milestone 1: Core Geometry, CRDT Document Model, HTML/SVG Renderer
      │
Milestone 2: Content-Aware Stacks, Responsive Constraints, Repeat Grid
      │
Milestone 3: Components, Master/Variant Systems, Vector Drawing Pipeline
      │
Milestone 4: Auto-Animate Engine, Voice Triggers/TTS, Mobile Live Preview
      │
Milestone 5: MCP Server Subsystem (stdio/SSE, Tools, Schema Validation)

```

1. **Phase 1: Layout & Core Rendering Engine**
* Implement scene graph, HTML/SVG composition, and content-aware CSS layout.
* Unit test bounding box recalculations across deep-nested stacks.


2. **Phase 2: Prototyping & Dynamic Assets**
* Ship Repeat Grid data binding engine.
* Build auto-animate interpolation parser matching node identifiers across adjacent artboards.
* Wire native platform STT/TTS modules for Voice Design execution.


3. **Phase 3: MCP Server Integration & Hardening**
* Embed lightweight JSON-RPC server within the core application runtime.
* Verify read/write integrity across multi-turn agent interactions using Claude Code and standard MCP inspection tools.
* Benchmark editor memory use and responsiveness when external agents dispatch high-frequency layout update batches.