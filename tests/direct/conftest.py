"""Shared fixtures and mock helpers for the ConstitutionCourt direct-mode suite.

Direct mode runs offline with no GenLayer node: every evidence fetch and every
model call is mocked. That makes the suite fast and deterministic, and it means
the tests exercise the contract's logic rather than the network's mood.

Two things here are less obvious than they look:

* **The SDK-loader dance.** Direct mode only wires up the GenVM SDK during
  ``deploy_contract`` and tears it down afterwards — but an ``Address``-typed
  constructor argument has to exist *before* the deploy call. ``address_cls``
  puts the SDK on ``sys.path`` first so tests can build the same ``Address``
  the contract will see. This matters: ``respondent`` arrives calldata-decoded
  as an ``Address``, and a hex *string* survives that round trip as a ``str``,
  so a test passing a string would be testing a signature production never uses.

* **Mocks are registered per URL, not per case.** Each fixture case gets its own
  synthetic host, so a test can serve a 503 for the vote record while the other
  three documents still resolve — which is what the error-policy tests need.
"""

import json
from pathlib import Path

import pytest

CONTRACT = "contracts/constitution_court.py"
REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = REPO_ROOT / "contracts" / "constitution_court.py"
EVIDENCE_ROOT = REPO_ROOT / "evidence"

# The four fixture cases, and the outcome each is built to produce.
CASE_COMPLIANT = "case-001-compliant-simple-majority"
CASE_TWO_THIRDS = "case-002-non-compliant-two-thirds"
CASE_NOTICE = "case-003-non-compliant-notice-period"
CASE_INSUFFICIENT = "case-004-insufficient-evidence"

ALL_CASES = (CASE_COMPLIANT, CASE_TWO_THIRDS, CASE_NOTICE, CASE_INSUFFICIENT)

EXPECTED = {
    CASE_COMPLIANT: ("COMPLIANT", "CERTIFIED", []),
    CASE_TWO_THIRDS: ("NON_COMPLIANT", "REJECTED", ["ART-4.3"]),
    CASE_NOTICE: ("NON_COMPLIANT", "REJECTED", ["ART-5.4"]),
    CASE_INSUFFICIENT: ("INSUFFICIENT_EVIDENCE", "UNRESOLVED", []),
}

# Document type -> (filename, storage field suffix)
DOC_FILES = {
    "constitution": "constitution.json",
    "proposal": "proposal.json",
    "vote-record": "vote-record.json",
    "notice-record": "notice-record.json",
    "response": "response.json",
}

BASE_HOST = "https://evidence.constitutioncourt.test"


def doc_url(case: str, source: str) -> str:
    """The pinned URL a test serves a given document at."""
    return f"{BASE_HOST}/{case}/{DOC_FILES[source]}"


def case_urls(case: str) -> dict:
    """The four constructor URLs for a case."""
    return {
        "constitution_url": doc_url(case, "constitution"),
        "proposal_url": doc_url(case, "proposal"),
        "vote_record_url": doc_url(case, "vote-record"),
        "notice_record_url": doc_url(case, "notice-record"),
    }


def load_doc(case: str, source: str) -> dict:
    """Read a fixture document from disk. Never touches the network."""
    return json.loads((EVIDENCE_ROOT / case / DOC_FILES[source]).read_text(encoding="utf-8"))


def has_response(case: str) -> bool:
    return (EVIDENCE_ROOT / case / DOC_FILES["response"]).exists()


# ----------------------------------------------------------------- SDK glue ---


def address_cls():
    """The SDK's ``Address``, with the SDK put on ``sys.path`` first.

    ``setup_sdk_paths`` is idempotent, so calling it here before any deploy is
    safe and yields the same class the contract will see.
    """
    from gltest.direct.sdk_loader import setup_sdk_paths

    setup_sdk_paths(CONTRACT_PATH)
    from genlayer.py.types import Address

    return Address


def addr_hex(raw) -> str:
    """Lowercase 0x-hex for a test address.

    The ``direct_alice`` / ``direct_bob`` fixtures are raw 20-byte values, while
    the contract returns ``Address.as_hex``. Comparing the two without this
    helper compares a bytes repr against a hex string and always fails.
    """
    if isinstance(raw, (bytes, bytearray)):
        return "0x" + bytes(raw).hex()
    text = str(raw)
    return text if text.startswith("0x") else "0x" + text


def as_address(raw):
    """Build the ``Address`` a deployment argument arrives as in production.

    Constructor arguments are calldata-encoded by the caller and decoded before
    ``__init__`` runs. An ``Address`` survives that round trip as an ``Address``;
    a hex string survives it as a ``str``. Passing a string here would therefore
    exercise a code path production never takes.
    """
    Address = address_cls()
    if isinstance(raw, Address):
        return raw
    if isinstance(raw, str):
        return Address(raw)
    return Address(raw)


# -------------------------------------------------------------- web mocking ---


def _escape(url: str) -> str:
    """Escape a URL for use as a regex, since mock_web matches on a pattern."""
    import re

    return re.escape(url)


def mock_document(direct_vm, case: str, source: str, doc=None, status: int = 200):
    """Serve one evidence document at its pinned URL.

    ``doc`` defaults to the on-disk fixture; pass a dict to serve a mutated
    version, or a string to serve raw (possibly invalid) bytes.
    """
    if doc is None:
        doc = load_doc(case, source)
    body = doc if isinstance(doc, str) else json.dumps(doc)
    direct_vm.mock_web(_escape(doc_url(case, source)), {"status": status, "body": body})


def mock_case(direct_vm, case: str, *, include_response: bool = None):
    """Serve every pinned document for a case at its URL.

    ``include_response`` defaults to whether the fixture has a response file.
    """
    for source in ("constitution", "proposal", "vote-record", "notice-record"):
        mock_document(direct_vm, case, source)
    if include_response is None:
        include_response = has_response(case)
    if include_response and has_response(case):
        mock_document(direct_vm, case, "response")


def mock_http_status(direct_vm, case: str, source: str, status: int, body: str = "{}"):
    """Serve an HTTP status for one document, leaving the others intact."""
    direct_vm.mock_web(_escape(doc_url(case, source)), {"status": status, "body": body})


# -------------------------------------------------------------- LLM mocking ---


def ruling_json(
    outcome: str,
    *,
    rule_ids=None,
    citations=None,
    reasoning: str = "Derived from the pinned record.",
    source: str = "vote-record",
) -> str:
    """Build a well-formed ruling payload.

    Citations default to one entry pointing at a real pinned source, because the
    contract requires at least one citation for NON_COMPLIANT.
    """
    if rule_ids is None:
        rule_ids = []
    if citations is None:
        citations = [
            {
                "source": source,
                "locator": "$.tally",
                "quote": "for: 340000, against: 180000",
                "supports": rule_ids[0] if rule_ids else "",
            }
        ]
    return json.dumps(
        {
            "outcome": outcome,
            "violated_rule_ids": list(rule_ids),
            "evidence_citations": citations,
            "reasoning": reasoning,
        }
    )


# Matches the adjudication prompt. Kept in one place so a reworded prompt breaks
# every LLM mock at once rather than silently matching nothing in a few of them.
PROMPT_PATTERN = r"(?s).*adjudicating whether a DAO treasury proposal.*"


def mock_ruling(direct_vm, outcome: str, **kwargs):
    """Mock the adjudication prompt with a well-formed ruling."""
    direct_vm.mock_llm(PROMPT_PATTERN, ruling_json(outcome, **kwargs))


def mock_raw_ruling(direct_vm, payload: str):
    """Mock the adjudication prompt with arbitrary (possibly malformed) output."""
    direct_vm.mock_llm(PROMPT_PATTERN, payload)


def mock_case_ruling(direct_vm, case: str):
    """Serve a case's documents together with its documented expected ruling."""
    mock_case(direct_vm, case)
    outcome, _final, rule_ids = EXPECTED[case]
    source = "vote-record" if case != CASE_NOTICE else "notice-record"
    mock_ruling(direct_vm, outcome, rule_ids=rule_ids, source=source)


def reset_mocks(direct_vm):
    """Drop every registered mock.

    Both mock matchers return the **first** pattern that matches, so
    re-registering a pattern does not override the earlier one — the original
    still wins. A test that needs a *different* answer for the same prompt or
    the same URL must therefore clear first rather than simply re-mock.
    """
    direct_vm.clear_mocks()


def serve_payload(direct_vm, case: str, payload: str, *, include_response: bool = None):
    """Serve a case's documents with an arbitrary (possibly malformed) ruling.

    Replaces any existing mocks, so this is the way to change what the model
    "returns" after a first ruling has already been mocked.
    """
    reset_mocks(direct_vm)
    mock_case(direct_vm, case, include_response=include_response)
    mock_raw_ruling(direct_vm, payload)


def serve_ruling(direct_vm, case: str, outcome: str, **kwargs):
    """Serve a case's documents with a well-formed ruling, replacing mocks."""
    serve_payload(direct_vm, case, ruling_json(outcome, **kwargs))


# ----------------------------------------------------------------- fixtures ---


@pytest.fixture
def parties(direct_alice, direct_bob):
    """(challenger, respondent) — alice files against bob throughout."""
    return direct_alice, direct_bob


@pytest.fixture
def from_scratch(direct_vm):
    """Re-run several independent executions against one deployed contract.

    **A test may deploy exactly once.** Two harness constraints make a second
    deploy meaningless rather than merely wasteful:

    * The SDK registers the contract class in a module-level global and raises
      ``TypeError: only one contract is allowed`` when the contract module is
      re-executed inside the same activated VM.
    * ``deploy_contract`` derives the contract address from the file path, so
      every deploy of the same file shares one storage root — a second instance
      would silently overwrite the first rather than stand beside it.

    So a test that needs to compare two executions takes a snapshot after
    deploying and rolls back between runs. Storage, mocks and sender all return
    to the marked moment, which is what makes the two runs comparable::

        contract = deploy_case(CASE_TWO_THIRDS)
        reset = from_scratch()
        ...first run...
        reset()
        ...second run, from identical state...
    """

    def _mark():
        base = direct_vm.snapshot()

        def _reset():
            direct_vm.revert(base)

        return _reset

    return _mark


@pytest.fixture
def deploy_case(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Deploy one case as the challenger. Returns a callable.

    Defaults to case 002 because it is the richest fixture: a real violation, a
    single cited rule, and no response document.
    """

    def _deploy(case: str = CASE_TWO_THIRDS, *, challenger=None, respondent=None, **overrides):
        direct_vm.sender = challenger or direct_alice
        title = overrides.pop("case_title", f"Challenge to {case}")
        urls = case_urls(case)
        urls.update(overrides)
        # Constructor arguments are positional, in the locked signature order.
        return direct_deploy(
            CONTRACT,
            as_address(respondent if respondent is not None else direct_bob),
            title,
            urls["constitution_url"],
            urls["proposal_url"],
            urls["vote_record_url"],
            urls["notice_record_url"],
        )

    return _deploy


@pytest.fixture
def open_case(deploy_case):
    """A deployed case in OPEN with no response submitted."""
    return deploy_case(CASE_TWO_THIRDS)


@pytest.fixture
def responded_case(direct_vm, deploy_case, direct_bob):
    """A deployed case in RESPONDED, using a fixture that has a response."""
    contract = deploy_case(CASE_COMPLIANT)
    direct_vm.sender = direct_bob
    contract.submit_response(doc_url(CASE_COMPLIANT, "response"))
    return contract
