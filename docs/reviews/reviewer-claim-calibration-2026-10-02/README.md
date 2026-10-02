# Review claim calibration

Source `5c30305a5c07d5c77a0d49c635a3f880daaefbd5` keeps PR data untrusted and actual reviewer-directed bypass/exfiltration instructions blocking. It distinguishes ordinary historical claims, product documentation and quoted prompts for other components from instructions for the current reviewer. Historical approval never chooses the current verdict; changed code still requires its own honest review.

The preceding #90 review blocked a statement about an earlier approval of a different commit, without a code finding. Trusted review/CI records verify that historical fact. This clarification addresses that false classification; it does not grant current approval.

Typecheck, all 38 existing reviewer tests and the production bundle pass. [Proof and source hashes](verification.json). These checks do not prove the model will interpret the prompt correctly. Actual fresh review of #90 and this candidate, exact-head CI and resulting-main verification remain required. No source-change or verdict override is used to clear #90's blocked status.
