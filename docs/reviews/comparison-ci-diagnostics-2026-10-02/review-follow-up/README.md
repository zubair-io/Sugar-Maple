# Failed-stage review follow-up

Source `58ea93d` logs each exited comparison stage with exit code and monotonic elapsed time before propagating failure. A real child that waits 2.5 seconds and exits 9 proves that the actual extracted `run()` function emits the failed-stage summary and still rejects the stage. This isolated function check is not a full application run. Both complete legacy and scene owner comparisons additionally pass at this source, including source/canary/cleanup/native fault assertions.

The prior head `e76f37b` Editor run 37085239507 failed the scene native-stop regression: its complete scene reached restored state, but the subsequent thirty-observation loop encountered the native helper's unchanged sixty-second wall budget. The initial opaque main stall remains undiagnosed. This new failure identifies a substage on that run, not the old stall's cause; no budget is relaxed and current-head CI remains required. #110 stays open.
