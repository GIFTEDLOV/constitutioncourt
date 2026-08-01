"""Resumable pilot records.

The record is written **before** a hash can be lost, not after a run succeeds.
That ordering is the whole point: a transaction hash persisted a moment before
the await survives a crashed process, a closed laptop, or a 30-minute settlement
the operator did not wait out. A hash recalled later is a recollection; a hash
written at the moment it appeared is evidence.

Records live under `deploy/bradbury/<case>/` and are plain JSON so they can be
read, diffed and committed without this tool.

**Nothing secret is ever written here.** Addresses are public; private keys,
mnemonics and keystore contents are never accepted by this module, let alone
persisted.
"""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

REPO_ROOT = Path(__file__).resolve().parents[1]
RECORD_ROOT = REPO_ROOT / "deploy" / "bradbury"

RECORD_VERSION = 1

#: Keys that must never appear in a record. Checked on every write, because the
#: cost of a leaked key is unbounded and the cost of this check is nothing.
FORBIDDEN_KEYS = frozenset({
    "private_key", "privatekey", "priv_key", "secret", "mnemonic", "seed",
    "seed_phrase", "passphrase", "password", "keystore", "account_private_key",
})


class SecretLeakError(Exception):
    """A record was about to persist something that looks like a credential."""


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


#: Key fragments that make a bare 64-hex value obviously a digest rather than a
#: credential. A SHA-256 and a raw private key are both 64 hex characters, so
#: the *name* is the only thing that distinguishes them — and the record is full
#: of legitimate digests.
HASH_KEY_FRAGMENTS = ("sha", "hash", "digest", "checksum")


def _looks_like_hash_field(key: str) -> bool:
    k = key.lower()
    return any(fragment in k for fragment in HASH_KEY_FRAGMENTS)


def _assert_no_secrets(payload: Any, path: str = "", key_name: str = "") -> None:
    if isinstance(payload, Mapping):
        for key, value in payload.items():
            k = str(key).lower().replace("-", "_")
            if k in FORBIDDEN_KEYS:
                raise SecretLeakError(
                    f"Refusing to persist {path}{key!r}: pilot records never contain "
                    "credentials of any kind."
                )
            _assert_no_secrets(value, f"{path}{key}.", key_name=str(key))
    elif isinstance(payload, (list, tuple)):
        for i, item in enumerate(payload):
            _assert_no_secrets(item, f"{path}[{i}].", key_name=key_name)
    elif isinstance(payload, str):
        # A raw private key is 64 hex characters. So is a SHA-256, and the
        # record legitimately holds many of those, so the field name decides.
        # A transaction hash carries an 0x prefix and is 66 characters.
        stripped = payload.strip()
        if (len(stripped) == 64
                and all(c in "0123456789abcdefABCDEF" for c in stripped)
                and not _looks_like_hash_field(key_name)):
            raise SecretLeakError(
                f"Refusing to persist {path}: a bare 64-character hex string under a field "
                f"named {key_name!r} looks like a private key. Digests belong in a field whose "
                "name says so; transaction hashes carry an 0x prefix."
            )


@dataclass
class PilotRecord:
    """One case's run, accumulated across steps and resumable at any point."""

    case_key: str
    path: Path
    data: Dict[str, Any]

    # -------------------------------------------------------------- loading

    @classmethod
    def load_or_create(cls, case_key: str, root: Optional[Path] = None) -> "PilotRecord":
        base = (root or RECORD_ROOT) / case_key
        path = base / "record.json"
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
        else:
            data = {
                "version": RECORD_VERSION,
                "case": case_key,
                "network": {"name": "Genlayer Bradbury Testnet", "chain_id": 4221},
                "created_at": utc_now(),
                "steps": {},
                "events": [],
            }
        return cls(case_key=case_key, path=path, data=data)

    @property
    def exists(self) -> bool:
        return self.path.exists()

    # --------------------------------------------------------------- saving

    def save(self) -> None:
        """Atomic write. A half-written record during a crash would be worse
        than none — it could show a hash that was never submitted."""
        _assert_no_secrets(self.data)
        self.data["updated_at"] = utc_now()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=str(self.path.parent), suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as fh:
                json.dump(self.data, fh, indent=2, sort_keys=True)
                fh.write("\n")
            os.replace(tmp, self.path)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise

    def event(self, kind: str, detail: str, **extra: Any) -> None:
        self.data.setdefault("events", []).append(
            {"at": utc_now(), "kind": kind, "detail": detail, **extra}
        )

    # ---------------------------------------------------------------- steps

    def step(self, name: str) -> Dict[str, Any]:
        return self.data.setdefault("steps", {}).setdefault(name, {})

    def record_inputs(self, **inputs: Any) -> None:
        self.data["inputs"] = inputs
        self.save()

    def record_accounts(self, challenger: str, respondent: str) -> None:
        # Addresses only. Never keys.
        self.data["accounts"] = {"challenger": challenger, "respondent": respondent}
        self.save()

    def record_evidence(self, documents: List[Dict[str, Any]]) -> None:
        self.data["evidence"] = documents
        self.save()

    def record_submission(self, step: str, tx_hash: str, method: str) -> None:
        """Persist a hash the instant it exists, before anything is awaited.

        Called between `write_contract` returning and the first poll. If the
        process dies immediately after, the hash is on disk and the run is
        resumable rather than orphaned.
        """
        s = self.step(step)
        s["method"] = method
        s["tx_hash"] = tx_hash
        s["submitted_at"] = utc_now()
        s.setdefault("status", "submitted")
        self.event("submitted", f"{method}() submitted", step=step, tx_hash=tx_hash)
        self.save()

    def record_receipt(self, step: str, classification, votes: Mapping[str, Any]) -> None:
        s = self.step(step)
        s["consensus_status"] = classification.status
        s["execution_result"] = classification.execution
        s["consensus_result"] = classification.consensus
        s["phase"] = classification.phase
        s["retry_classification"] = classification.retry
        s["succeeded"] = classification.succeeded
        s["detail"] = classification.detail
        s["settled_at"] = utc_now()
        s["status"] = "settled" if classification.terminal else "in-flight"
        if votes:
            s["validator_votes"] = dict(votes)
        self.event("settled", classification.detail, step=step, phase=classification.phase)
        self.save()

    def record_contract(self, address: str, source_sha256: str) -> None:
        self.data["contract"] = {"address": address, "source_sha256": source_sha256}
        self.save()

    def record_state(self, label: str, state: Mapping[str, Any],
                     sources: Optional[Mapping[str, Any]] = None) -> None:
        snap = self.data.setdefault("state_snapshots", {})
        snap[label] = {"at": utc_now(), "get_state": dict(state)}
        if sources is not None:
            snap[label]["get_evidence_sources"] = dict(sources)
        self.save()

    def record_verification(self, step: str, verification) -> None:
        self.step(step)["verification"] = [
            {"id": c.id, "label": c.label, "ok": c.ok, "detail": c.detail}
            for c in verification.checks
        ]
        self.save()

    # ------------------------------------------------------------- querying

    def pending_hash(self, step: str) -> Optional[str]:
        """A submitted hash whose outcome is not yet settled.

        Non-None means: **do not submit this step again**. Resume instead.
        """
        s = self.data.get("steps", {}).get(step) or {}
        if s.get("tx_hash") and s.get("status") != "settled":
            return str(s["tx_hash"])
        return None

    def settled_hash(self, step: str) -> Optional[str]:
        s = self.data.get("steps", {}).get(step) or {}
        if s.get("tx_hash") and s.get("status") == "settled":
            return str(s["tx_hash"])
        return None

    def step_succeeded(self, step: str) -> bool:
        s = self.data.get("steps", {}).get(step) or {}
        return bool(s.get("succeeded")) and s.get("status") == "settled"

    def contract_address(self) -> Optional[str]:
        return (self.data.get("contract") or {}).get("address")

    def any_unresolved(self) -> Optional[str]:
        """The name of any step with a hash but no settled outcome."""
        for name, s in (self.data.get("steps") or {}).items():
            if s.get("tx_hash") and s.get("status") != "settled":
                return name
        return None
