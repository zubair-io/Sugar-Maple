# Native vector handoff

`code.export` with `target: "swiftui"` now emits standalone SwiftUI `Path` geometry for fixed-size vector nodes, including editor-created lines, arrows, polylines and pressure outlines. It uses SwiftUI/CoreGraphics APIs with no Maple dependency, imported executable source, image conversion or native whiteboard renderer.

The bounded SVG path parser supports absolute and relative `M/L/H/V/C/S/Q/T/A/Z`, implicit repetitions, reflected curve controls, compact arc flags, exponent numbers, multiple subpaths and closepath semantics. Elliptical arcs use the [SVG endpoint-to-center conversion](https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes) and native transformed arcs, rather than a polyline approximation. Invalid/incomplete geometry, nonfinite arithmetic and nonpositive viewBox dimensions reject the complete export before returning source. Path input retains the document's existing 100,000-character limit.

Nonzero fills, document-owned color tokens, centered strokes, viewBox origin, anisotropic resizing, clipping, rotation, parent-relative free-layout placement and group opacity are preserved. Stroke outlines are computed before the viewBox transform; applying a view transform to rasterized strokes caused a measured rendering regression. SVG/DOM exports explicitly use a miter limit of 10 to match the Canvas painter's default. Native vector fills and strokes are composited before opacity, matching SVG group opacity.

## Verification

`bun tools/vector-export-test.ts` compiles 23 complete generated fixtures against the actual macOS 14 SwiftUI API baseline and renders them with `ImageRenderer`. It independently renders each authored SVG in WKWebView at the same declared 2x backing resolution, including fractional drawing bounds. It records both PNGs and numerical comparisons under `build/native-acceptance/vector-export`.

The fixtures cover command families and shorthand resets, all four arc flag combinations, rotated/relative arcs, corrected radii, zero-radius and coincident-endpoint arcs, compound nonzero fill, nonzero viewBox origin, anisotropic strokes, acute joins, clipping/opacity, each drawing tool, empty geometry and nested placement with rotation/token/opacity. Each nonempty fixture must contain painted pixels, have ink intersection-over-union at least 0.94, and have RGB differences over 48/255 on at most 10% of the ink union. These thresholds allow renderer antialiasing differences while detecting placement, stroke and opacity regressions. The empty fixture must paint no pixels in either renderer. Both source and images remain available for inspection; this is a fixture-level comparison, not a promise of exact pixels for every document.

The native acceptance gate runs that consumer. Browser human-drawing checks export SwiftUI without changing the document/checkpoint, and the actual native MCP SDK exports all four canonical drawing paths and type-checks each returned source against SwiftUI. Model checks cover grammar and complete-export errors.

## Remaining scope

SwiftUI gradients, responsive sizing, custom font registration and nondefault exact line height remain explicitly unsupported. Path gradients remain unsupported across the scene model. This increment verifies macOS consumers; it does not establish iOS/other native target acceptance, interactive Bézier authoring, routed/attached connectors or arbitrary JavaScript/Swift library preview execution. Issues #17, #19, #23 and #51 retain their remaining acceptance requirements.
