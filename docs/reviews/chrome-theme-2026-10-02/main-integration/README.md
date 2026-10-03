# Verified inspector-main integration

Runtime `4334426a5afd770605284744a4f11ae34d1a6b5d` is based on actual main `9f97531088b81d9e53173a1af328f8ccc3811290`, whose complete tree matches reviewed inspector head `29da22b`. The clean focused production theme fixture and pinned-source inventory check pass; the owner report proves cleanup. Five suites also passed with cleanup at previous published head `94d8de9`. Production UI/Swift bytes are identical to the locally native-tested `f8c79f1` except the inspector provenance inventory refresh. Test/report commits add no runtime behavior.

An earlier focused rerun at `9945213` passed its fixture but failed process-group cleanup with EPERM; that run is not passing ownership evidence. The clean final-head and current-main reruns retained here pass both fixtures and cleanup. #110 retains cleanup investigation. Fresh exact-head review and CI are required for this main-based PR; its earlier approval alone does not authorize this rewritten head.
