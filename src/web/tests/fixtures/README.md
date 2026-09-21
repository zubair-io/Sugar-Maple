# Maple drawing reference

`maple-phone.ts` reconstructs the user-supplied phone preview from `_MapleDesigns/Maple-vNext-Platforms-Previews/phone-browse.png`. Color stops and normalized skyline points in `maple-phone-scenes.json` were read from the matching `11 · Preview / iPhone filmstrip` page in `Maple-vNext-Platforms.sketch`. The fixture builds explicit Sugar Maple commands; it is not a general Sketch importer.

All 37 nodes remain editable. No screenshot or external asset is embedded. The reference folder is only a development input and is not required by builds or CI. Current differences include platform font rasterization, slightly simplified toolbar icons, and small border placement differences.

`maple-design-e2e.ts` draws the fixture in the editor, inspects gradient rendering, exports SVG, compares photo-region SVG/CSS pixels (mean channel difference under 3/255), edits text, reloads real IndexedDB recovery, and undoes the edit. Evidence is saved under ignored `build/evidence/`.
