import { runComparison } from "../../tools/library-preview-comparison";
const scenario = process.argv[2];
await runComparison(
  [["prototypes/library-preview/comparison-cancellation-stage.ts", scenario]],
  scenario === "timeout" ? 1000 : 600000,
);
