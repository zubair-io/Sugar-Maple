Current-base metadata integration

Candidate 226a9a3498b8084fbfd455ce242864b17d6e6746 rebases the metadata repair onto delivered main 4f9b247. The entire .github tree exactly matches the base, retaining token masking, safe error reporting, complete isolated Git diff retrieval and shipping prototype priority. The earlier two-tree reviewer falsely interpreted newer base code as deletions from the old feature head. This does not override that earlier blocked verdict.

The iterator follow-up snapshots metadata keys before deleting obsolete fields. Fresh 134 model tests / 2,152 assertions, typecheck, production Mac packaging/signing, all 30 browser/consumer suites and full native acceptance passed. Actual IndexedDB and .syrup metadata fixtures passed. Fresh exact-head review/CI and resulting-main delivery are required.
