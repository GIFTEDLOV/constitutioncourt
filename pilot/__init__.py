"""ConstitutionCourt Bradbury pilot harness.

Split so that everything decidable without a network is a pure function:

  config      environment-only configuration; never embeds or persists a secret
  fixtures    the canonical pilot manifest and artefact verification
  classify    transaction outcome and retry-safety classification
  receipt     deploy-receipt parsing and contract-address recovery
  verify      every deployment and lifecycle invariant from docs/DEPLOY.md
  record      resumable pilot records, written before a hash can be lost
  chain       the only module that talks to genlayer-py
  runner      orchestration: single-flight writes, finalization-aware polling
  preflight   read-only checks, runnable without a wallet
  cli         the operator command

The live suite is opt-in twice over and is excluded from default CI.
"""

__all__ = [
    "config", "fixtures", "classify", "receipt", "verify",
    "record", "chain", "runner", "preflight", "cli",
]
