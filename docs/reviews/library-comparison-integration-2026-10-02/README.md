# Library comparison dependency integration

PR #89's 15 original commits are rebased on updated native candidate cd5b156, inheriting the camera and Mac packaging fixes. The range diff preserves the original changes; workflow context now includes the existing build deadline. The additional cleanup repair is the tested #95 follow-up, scoped here to the legacy comparison.

At 489ab9ccb4fa38aa745e9edb995949dd62f93ca3, the complete actual Canvas/DOM/package/native comparison, report and ownership gate exited 0. Whole comparison success must precede injected shutdown; real normal cleanup finishes within 30 seconds and a real leaked listener is rejected at that deadline. Preparation uses the existing owned-editor 10-minute lifetime; native build/runtime budgets are unchanged.

225 app/native source hashes match the preceding native-integration proof, which retains full local Mac/model/typecheck/native acceptance and inherited browser evidence. The original baseline screenshots and physical observations keep their historical source. Source/log hashes are in [verification.json](verification.json).

The props-only baseline remains a documented fidelity NO-GO; authored-scene support is the separate #95 candidate. Fresh exact-head CI/review, validated dependency integration and verified resulting main remain required.
