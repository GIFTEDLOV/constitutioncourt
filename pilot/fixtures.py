"""The canonical pilot fixtures, and verification of the artefacts they name.

Every URL is pinned to a full 40-character commit SHA. The manifest here is the
single in-code source; `verify_manifest_against_readme` proves it agrees with
`evidence/README.md`, so the two cannot drift.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]

#: Commit the published fixtures are pinned to. Never a branch — see
#: evidence/README.md for why that distinction decides whether validators can
#: disagree with each other.
EVIDENCE_COMMIT = "1d1174e9f30e8674c28ab41272125ea11d691d84"
REPO_SLUG = "GIFTEDLOV/constitutioncourt"

CANONICAL_CONTRACT = REPO_ROOT / "contracts" / "constitution_court.py"
CONTRACT_SHA256 = "bf845bc43768cb0829157ae9e7dad01a4d15b333c4139255d5018ac6ecf99341"
CONTRACT_BYTES = 32043


def raw_url(case_dir: str, filename: str) -> str:
    return (f"https://raw.githubusercontent.com/{REPO_SLUG}/{EVIDENCE_COMMIT}"
            f"/evidence/{case_dir}/{filename}")


@dataclass(frozen=True)
class Document:
    role: str
    filename: str
    sha256: str
    size: int

    def url(self, case_dir: str) -> str:
        return raw_url(case_dir, self.filename)


@dataclass(frozen=True)
class PilotCase:
    key: str
    case_dir: str
    title: str
    proposal_id: str
    documents: Tuple[Document, ...]
    response: Optional[Document]
    expected_outcome: str
    expected_final_status: str
    expected_rule_ids: Tuple[str, ...]
    lifecycle: str

    @property
    def constitution_url(self) -> str:
        return self.documents[0].url(self.case_dir)

    @property
    def proposal_url(self) -> str:
        return self.documents[1].url(self.case_dir)

    @property
    def vote_record_url(self) -> str:
        return self.documents[2].url(self.case_dir)

    @property
    def notice_record_url(self) -> str:
        return self.documents[3].url(self.case_dir)

    @property
    def response_url(self) -> Optional[str]:
        return self.response.url(self.case_dir) if self.response else None

    def all_documents(self) -> List[Document]:
        docs = list(self.documents)
        if self.response:
            docs.append(self.response)
        return docs

    def constructor_args(self, respondent: str) -> list:
        """The six constructor arguments, in the contract's locked order.

        `respondent` is returned as a plain string here; the caller wraps it in
        the SDK's Address type. Order is asserted by the offline suite.
        """
        return [
            respondent,
            self.title,
            self.constitution_url,
            self.proposal_url,
            self.vote_record_url,
            self.notice_record_url,
        ]


#: CASE A — silent respondent. OPEN → RULED.
CASE_002 = PilotCase(
    key="case-002",
    case_dir="case-002-non-compliant-two-thirds",
    title="Meridian Collective — MC-2026-021 two-thirds threshold challenge",
    proposal_id="MC-2026-021",
    documents=(
        Document("constitution", "constitution.json",
                 "08ea34a2b415aa94608a6f009ec5353b4e3decdd8eb094416929e31fb3023b99", 2611),
        Document("proposal", "proposal.json",
                 "638b7882dd48000681e14ade81e500185a1efacf752195cecedd002eaf5c2be9", 662),
        Document("vote-record", "vote-record.json",
                 "52e330445a9177278bcc4a26d61582007b67a2d5ec59510068f41c50cac533b1", 372),
        Document("notice-record", "notice-record.json",
                 "f7b5d2d04316bccc3519d72e63858efa229af1b2a1b1aecee3f487d879c32e30", 476),
    ),
    # Deliberately none: this respondent stayed silent, which is a first-class
    # path and the reason `rule` is reachable from OPEN.
    response=None,
    expected_outcome="NON_COMPLIANT",
    expected_final_status="REJECTED",
    expected_rule_ids=("ART-4.3",),
    lifecycle="OPEN -> RULED",
)

#: CASE B — respondent answers. OPEN → RESPONDED → RULED.
CASE_003 = PilotCase(
    key="case-003",
    case_dir="case-003-non-compliant-notice-period",
    title="Meridian Collective — MC-2026-027 notice period challenge",
    proposal_id="MC-2026-027",
    documents=(
        Document("constitution", "constitution.json",
                 "08ea34a2b415aa94608a6f009ec5353b4e3decdd8eb094416929e31fb3023b99", 2611),
        Document("proposal", "proposal.json",
                 "c272e34dda0dc9a053196e70d262254f69373ba73f5da5df0c19705b480210e9", 663),
        Document("vote-record", "vote-record.json",
                 "6bad9c983ec282bb9ea568751d8eebc75127959d9ce44043078939fadf41c55f", 372),
        Document("notice-record", "notice-record.json",
                 "6665af3892d7e9fd1df0b9954aa31afbc49a5a06ad82d7b8535fe0c69d269194", 714),
    ),
    response=Document("response", "response.json",
                      "cc0a4f088658a395e0e25d4cc2d53ba7703187a1221c463d36d3bcec7dd4048e", 1179),
    expected_outcome="NON_COMPLIANT",
    expected_final_status="REJECTED",
    expected_rule_ids=("ART-5.4",),
    lifecycle="OPEN -> RESPONDED -> RULED",
)

CASES: Dict[str, PilotCase] = {CASE_002.key: CASE_002, CASE_003.key: CASE_003}


# --------------------------------------------------------------- verification


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_contract_source() -> str:
    """The contract source, read as text with newlines preserved verbatim.

    `newline=""` matters: Python's universal newlines would silently translate
    CRLF to LF and hide exactly the defect the hash check exists to catch.
    """
    return CANONICAL_CONTRACT.read_text(encoding="utf-8", newline="")


def verify_contract_source() -> Tuple[bool, str]:
    raw = CANONICAL_CONTRACT.read_bytes()
    actual = sha256_bytes(raw)
    if b"\r\n" in raw:
        return False, "The canonical contract contains CRLF. Its bytes, and therefore the "
        "deployed contract's address, depend on the checkout platform."
    if actual != CONTRACT_SHA256:
        return False, f"Contract source hashes to {actual}, expected {CONTRACT_SHA256}."
    if len(raw) != CONTRACT_BYTES:
        return False, f"Contract source is {len(raw)} bytes, expected {CONTRACT_BYTES}."
    return True, f"sha256 {actual}, {len(raw)} bytes, LF"


def readme_manifest() -> Dict[str, str]:
    """URL -> sha256, as recorded in evidence/README.md."""
    text = (REPO_ROOT / "evidence" / "README.md").read_text(encoding="utf-8")
    pattern = re.compile(
        r"\[raw\]\((https://raw\.githubusercontent\.com/[^)]+)\)\s*\|\s*`([0-9a-f]{64})`"
    )
    return {m.group(1): m.group(2) for m in pattern.finditer(text)}


def verify_manifest_against_readme() -> List[str]:
    """Return a list of disagreements between this manifest and the README."""
    recorded = readme_manifest()
    problems: List[str] = []
    for case in CASES.values():
        for doc in case.all_documents():
            url = doc.url(case.case_dir)
            if url not in recorded:
                problems.append(f"{case.key}/{doc.filename}: URL absent from evidence/README.md")
            elif recorded[url] != doc.sha256:
                problems.append(
                    f"{case.key}/{doc.filename}: manifest {doc.sha256[:12]}… but README "
                    f"{recorded[url][:12]}…"
                )
    return problems


def verify_local_fixture_bytes() -> List[str]:
    """Check the on-disk fixtures hash to the manifest values.

    Reads bytes, and normalises CRLF before hashing so a Windows working copy
    does not produce a false mismatch: `.gitattributes` pins these to LF, and
    the published URL serves the LF blob, which is what the manifest records.
    """
    problems: List[str] = []
    for case in CASES.values():
        for doc in case.all_documents():
            path = REPO_ROOT / "evidence" / case.case_dir / doc.filename
            if not path.exists():
                problems.append(f"{case.key}/{doc.filename}: missing on disk")
                continue
            data = path.read_bytes().replace(b"\r\n", b"\n")
            actual = sha256_bytes(data)
            if actual != doc.sha256:
                problems.append(
                    f"{case.key}/{doc.filename}: on-disk {actual[:12]}… != manifest "
                    f"{doc.sha256[:12]}…"
                )
    return problems


def all_urls_are_commit_pinned() -> List[str]:
    """Every fixture URL must carry a 40-hex commit, never a branch."""
    problems: List[str] = []
    for case in CASES.values():
        for doc in case.all_documents():
            url = doc.url(case.case_dir)
            ref = url.split("/")[5]
            if not re.fullmatch(r"[0-9a-f]{40}", ref):
                problems.append(f"{case.key}/{doc.filename}: ref {ref!r} is not a commit SHA")
    return problems
