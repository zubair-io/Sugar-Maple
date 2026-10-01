# Just-Maple Whiteboard canvas adapter

The CanvasComponent, canvas template/styles, tool contract, camera constraints and user-color utility originate from `Just-Maple/packages/whiteboard` at revision `38c2e6793b4602418b669909865d2292d43a842d`. `provenance.json` records the upstream source file hashes before adaptation. The repository contains everything needed to build; the sibling checkout is not a runtime dependency.

The original CanvasComponent provides its camera, pointer capture, resize observer, touch gestures, awareness contract and animation-frame scheduling. Adaptations use relative, narrow type contracts; emit deletion intent; ignore editable keyboard targets; cancel interrupted/stale gestures; support ordinary wheel pan and anchored modifier zoom; dispose observers; and expose synchronous flush for an occluded WKWebView capture.

`renderer.service.ts` is a Sugar Maple Canvas2D painter at the existing Whiteboard renderer seam. It replaces the stock freehand painter. `CanvasProjection` projects the existing authoritative Sugar Maple document; the local Yjs document only notifies the Whiteboard render scheduler. It does not maintain a second authored document or create a network collaboration connection.

`CanvasSelectionTool` commits a gesture through Sugar Maple transactions once on pointer up. Pointer cancellation, document/page/mode changes and agent revisions discard the transient draft. DOM scene rendering is retained for prototype controls and accessibility through the Layers panel.
