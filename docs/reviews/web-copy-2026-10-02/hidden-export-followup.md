# Hidden export review reproduction

The completed review of head `d97fe6594e4adcb1fa739ad80b78b8c2ad3b49ba` raised a conditional concern that hidden descendants might appear in `html-css` markup without styles. The source at that head already filters both `visibleSubtree` and `exportNode` children with `!hidden`. A direct public `exportNode` reproduction excludes a hidden parent and its otherwise visible child from both markup and styles.

Test-only follow-up source `e3969d6bb17169c44508043ea2f81fa6f7f40940` adds nonempty hidden text, a visible descendant inside the hidden parent, and assertions for their omitted markup/text/styles. The targeted suite passes (3 tests, 26 assertions); all model tests pass (139 tests, 2,203 assertions). Removing only the markup child visibility filter makes the new assertion fail because the hidden parent and descendant are emitted. Restoring the original source makes it pass. This negative control demonstrates that the test catches the reported behavior.

Application, native, dependency and QA harness files are unchanged from `d97fe6`. Full application evidence remains bound to its original implementation source `33968d8`; this test follow-up does not relabel that evidence or constitute a new native test run. The prior blocking review is retained as history. Current-head independent review and CI remain separate delivery gates.
