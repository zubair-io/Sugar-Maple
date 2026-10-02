# Drop highlight follow-up

Source `478b41014e4a36b1e3951a88032251d1dc488f88` addresses review comment 5959569582. Informational paragraphs no longer become drag hit targets; the container remains active while crossing either label. Interactive controls are outside this selector.

Actual production browser hit testing verifies both label centers resolve to the drop container. All 11 browser and 12 production WK drop cases, typecheck and Mac packaging/signing pass. The owned dev server was stopped and its listener is gone. [Source-bound proof](verification.json).

The complete 148-model / 32-browser-suite and full native integration proof remains at a28f7b5; it is not relabelled as a new full-suite run. Fresh final-head review/CI and verified main delivery remain required.
