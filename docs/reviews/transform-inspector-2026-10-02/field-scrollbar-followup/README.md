# Inspector field and scrollbar follow-up

Runtime source: `55a52de142741397b109a7045b83ef93b851963c`, rebased onto verified main `fc847d498e1e70149c02aedf5e3b9c50a71b6b9c`. Clean source passes typecheck, Mac production build, all 34 browser suites and full native acceptance. `6da814ed945016dcafe247be2c7e5a0703dc90d8` adds only browser screenshot capture and passes the focused production field fixture at a clean checkout; runtime files are identical.

CI run 37090520485 on the earlier candidate failed `260: alignment target remains usable`: permanent native scrollbars consumed inspector width. The repair removes duplicate horizontal body gutters, preserving the original >=30px target and >=64px input gates. Actual WK geometry with process-local permanent scrollbars measures 31px targets at 260px. The harness preference is volatile and never changes the user's system settings.

Descriptive Typography and Border labels stack above inputs; X/Y/W/H/rotation retain compact glyph slots. Shared production Chrome/WK fixtures measure full text fit, contained inputs, both appearances and exact checkpoint/history preservation. Reports cover 3 Transform widths and 12 descriptive-field state combinations. The native diagnostic also now names its actual inspector test.

These checks are rendered geometry and synthetic DOM state checks. They do not establish physical input, VoiceOver or shipped resizing. The drawing toolbar's separate light-theme defect remains tracked in #116. Older evidence directories describe older source; this follow-up records the current runtime independently.
