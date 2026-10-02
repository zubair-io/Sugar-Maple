Forward-compatible metadata verification

Main a4d40a5 was reproduced from its committed model sources in an isolated ignored directory: document/page/folder metadata was silently removed. At candidate 6797aa285d9d4c2b815b5dc62b24fdc62ffdba31, four meaningful scene-store regressions pass, including detached reads, full JSON checkpoint recovery and recovered undo. A real IndexedDB fixture retains all three metadata locations after reload, edits and recovered undo; the native .syrup package fixture retains all three locations. Full model/type/Mac/browser/native checks passed.

The bounded metadata contract and explicitly unsupported migration scope are documented in docs/development/forward-metadata.md. This is a fix for #100 and partial delivery toward #6/#7. Delivery gates remain pending.
