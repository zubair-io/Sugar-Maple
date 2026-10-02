Monotonic folder-drop deadline follow-up

Directory traversal now uses one performance.now deadline for its entire five-second budget. Before the fix, the forward wall-clock jump and expired monotonic-budget regressions failed. Both pass after the fix. Existing fragmented directory, cancellation, depth, file/mapping and exact history behavior remains covered.

At source 3836cb74112b14a1ba0458d54df3e6cd08ae5884, all 150 model tests / 2,248 assertions, typecheck, Mac packaging/signing, 11 actual Chrome drop cases and 12 production WK drop cases passed. The owned browser server was stopped. Directory entries and clock jumps are fixtures; no actual OS clock change or new physical chooser run is claimed. Full integrated 32-browser-suite/native evidence retains original source a28f7b5.
