Live branch reference verification

A real PR #99 response retained base 722081c after its base branch advanced to 77f3897. Current branch Git references are now read before source preparation and revalidated before agent creation. Cached PR base metadata no longer pins a stale rules/source revision.

At source b7a9266749f87661ad15b91380edf77bcf3c3e5e, typecheck, 42 reviewer tests and production bundle passed. Real PR #99 cached metadata and real PR #95 large-diff retrieval were checked through authenticated APIs and isolated Git trees, without agent creation. The latter retained all 46 shipping-source hunks across 46,393 full diff lines within the existing 350,000-character budget. No credential values are recorded.

This integration includes the already delivered #97 Git portability fix; historic proofs retain their source commits. Fresh exact-head approval/CI and actual #90/#95 workflow recovery remain required.
