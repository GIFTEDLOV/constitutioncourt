"""Browser-driven pilot reconstruction — offline.

The harness must be read-only for a browser pilot. These assert that both as a
gate (it refuses to sign) and as a property of the code path (reconstruction
never calls a write method).
"""

import pytest

from pilot import config
from pilot.browser_pilot import BrowserPilotInputs, reconstruct
from pilot.fixtures import CASE_002, CASE_003
from pilot.record import PilotRecord

ADDRESS = "0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc"
CHALLENGER = "0x456Ccff0d33463E1834F724C5C5971D6cff6f1dc"
RESPONDENT = "0x79DD8260773C7D5DEA701dfC2D3dD804FF041bf2"
DEPLOY_TX = "0x" + "a" * 64
RULE_TX = "0x" + "b" * 64
RESPONSE_TX = "0x" + "c" * 64


class ReadOnlyChain:
    """A chain that records every method called, and explodes on any write."""

    def __init__(self, state, sources, receipts, code="# source"):
        self.state = state
        self.sources = sources
        self.receipts = receipts
        self.code = code
        self.calls = []

    def transaction(self, tx_hash):
        self.calls.append(("transaction", tx_hash))
        return self.receipts.get(tx_hash)

    def read(self, address, method):
        self.calls.append(("read", method))
        return self.state if method == "get_state" else self.sources

    def contract_code(self, address):
        self.calls.append(("contract_code", address))
        return self.code

    # Any of these being called is a bug this suite must catch.
    def deploy(self, *a, **k):
        raise AssertionError("reconstruction must never deploy")

    def write(self, *a, **k):
        raise AssertionError("reconstruction must never write")

    def account(self, *a, **k):
        raise AssertionError("reconstruction must never unlock an account")


FINALIZED = {"statusName": "FINALIZED", "txExecutionResultName": "FINISHED_WITH_RETURN"}


def ruled_state(case, **over):
    base = {
        "case_title": case.title,
        "challenger": CHALLENGER,
        "respondent": RESPONDENT,
        "status": "RULED",
        "final_status": "REJECTED",
        "outcome": "NON_COMPLIANT",
        "violated_rule_ids": list(case.expected_rule_ids),
        "evidence_citations": [{
            "source": "vote-record", "url": case.vote_record_url,
            "locator": "$.tally", "quote": "340000",
        }],
        "reasoning": "Short of the required threshold.",
        "created_at": "2026-08-01T10:00:00Z",
        "responded_at": "2026-08-01T10:30:00Z" if case.response else "",
        "ruled_at": "2026-08-01T11:00:00Z",
        "has_response": bool(case.response),
    }
    base.update(over)
    return base


def sources_for(case, with_response=True):
    return {
        "constitution_url": case.constitution_url,
        "proposal_url": case.proposal_url,
        "vote_record_url": case.vote_record_url,
        "notice_record_url": case.notice_record_url,
        "response_url": case.response_url if (case.response and with_response) else "",
        "schema_version": "constitutioncourt/evidence@1",
    }


@pytest.fixture
def record(tmp_path):
    return PilotRecord.load_or_create("case-002", root=tmp_path)


# ------------------------------------------------------------ the gate ------


def test_browser_mode_is_detected(monkeypatch):
    monkeypatch.setenv(config.ENV_SIGNING_MODE, "browser")
    assert config.browser_signing() is True


def test_browser_mode_is_off_by_default(monkeypatch):
    monkeypatch.delenv(config.ENV_SIGNING_MODE, raising=False)
    assert config.browser_signing() is False


def test_browser_mode_is_case_insensitive(monkeypatch):
    monkeypatch.setenv(config.ENV_SIGNING_MODE, "Browser")
    assert config.browser_signing() is True


# --------------------------------------------------- read-only property -----


def test_reconstruction_never_calls_a_write_method(record):
    chain = ReadOnlyChain(
        state=ruled_state(CASE_002),
        sources=sources_for(CASE_002),
        receipts={DEPLOY_TX: FINALIZED, RULE_TX: FINALIZED},
    )
    reconstruct(chain, BrowserPilotInputs(
        case=CASE_002, contract_address=ADDRESS,
        challenger_address=CHALLENGER, respondent_address=RESPONDENT,
        deploy_tx=DEPLOY_TX, rule_tx=RULE_TX,
    ), record)
    # The fake raises on deploy/write/account, so reaching here proves it.
    assert {c[0] for c in chain.calls} <= {"transaction", "read", "contract_code"}


def test_case_002_reconstruction_records_the_expected_ruling(record):
    chain = ReadOnlyChain(
        state=ruled_state(CASE_002),
        sources=sources_for(CASE_002),
        receipts={DEPLOY_TX: FINALIZED, RULE_TX: FINALIZED},
    )
    results = reconstruct(chain, BrowserPilotInputs(
        case=CASE_002, contract_address=ADDRESS,
        challenger_address=CHALLENGER, respondent_address=RESPONDENT,
        deploy_tx=DEPLOY_TX, rule_tx=RULE_TX,
    ), record)

    assert results["rule"].ok
    assert results["citations"].ok
    data = record.data
    assert data["steps"]["deploy"]["tx_hash"] == DEPLOY_TX
    assert data["steps"]["rule"]["tx_hash"] == RULE_TX
    assert data["inputs"]["signed_via"].startswith("browser wallet")
    assert data["state_snapshots"]["final"]["get_state"]["outcome"] == "NON_COMPLIANT"


def test_case_003_reconstruction_covers_the_response_step(tmp_path):
    rec = PilotRecord.load_or_create("case-003", root=tmp_path)
    chain = ReadOnlyChain(
        state=ruled_state(CASE_003),
        sources=sources_for(CASE_003),
        receipts={DEPLOY_TX: FINALIZED, RESPONSE_TX: FINALIZED, RULE_TX: FINALIZED},
    )
    results = reconstruct(chain, BrowserPilotInputs(
        case=CASE_003, contract_address=ADDRESS,
        challenger_address=CHALLENGER, respondent_address=RESPONDENT,
        deploy_tx=DEPLOY_TX, response_tx=RESPONSE_TX, rule_tx=RULE_TX,
    ), rec)

    assert results["submit_response"].ok
    assert results["rule"].ok
    assert rec.data["steps"]["submit_response"]["tx_hash"] == RESPONSE_TX


def test_a_wrong_rule_id_is_recorded_as_a_finding_not_hidden(record):
    chain = ReadOnlyChain(
        state=ruled_state(CASE_002, violated_rule_ids=["ART-5.4"]),
        sources=sources_for(CASE_002),
        receipts={DEPLOY_TX: FINALIZED, RULE_TX: FINALIZED},
    )
    results = reconstruct(chain, BrowserPilotInputs(
        case=CASE_002, contract_address=ADDRESS,
        challenger_address=CHALLENGER, respondent_address=RESPONDENT,
        deploy_tx=DEPLOY_TX, rule_tx=RULE_TX,
    ), record)
    assert not results["rule"].ok
    # And it is written down rather than raising.
    recorded = record.data["steps"]["rule"]["verification"]
    assert any(c["ok"] is False for c in recorded)


def test_an_address_disagreement_between_receipt_and_operator_is_caught(record):
    other = "0xDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDd"
    chain = ReadOnlyChain(
        state=ruled_state(CASE_002),
        sources=sources_for(CASE_002),
        receipts={DEPLOY_TX: {**FINALIZED, "txDataDecoded": {"contractAddress": other}},
                  RULE_TX: FINALIZED},
    )
    results = reconstruct(chain, BrowserPilotInputs(
        case=CASE_002, contract_address=ADDRESS,
        challenger_address=CHALLENGER, respondent_address=RESPONDENT,
        deploy_tx=DEPLOY_TX, rule_tx=RULE_TX,
    ), record)
    failed = results["deploy"].failed
    assert failed is not None and failed.id == "address"
    assert "must agree" in failed.detail


def test_a_failed_deploy_transaction_is_classified_and_recorded(record):
    chain = ReadOnlyChain(
        state=ruled_state(CASE_002),
        sources=sources_for(CASE_002),
        receipts={DEPLOY_TX: {"statusName": "ACCEPTED",
                              "txExecutionResultName": "FINISHED_WITH_ERROR"}},
    )
    reconstruct(chain, BrowserPilotInputs(
        case=CASE_002, contract_address=ADDRESS,
        challenger_address=CHALLENGER, respondent_address=RESPONDENT,
        deploy_tx=DEPLOY_TX,
    ), record)
    step = record.data["steps"]["deploy"]
    assert step["phase"] == "execution-error"
    assert step["retry_classification"] == "pointless"


def test_the_record_holds_no_credential_after_reconstruction(record):
    chain = ReadOnlyChain(
        state=ruled_state(CASE_002),
        sources=sources_for(CASE_002),
        receipts={DEPLOY_TX: FINALIZED, RULE_TX: FINALIZED},
    )
    reconstruct(chain, BrowserPilotInputs(
        case=CASE_002, contract_address=ADDRESS,
        challenger_address=CHALLENGER, respondent_address=RESPONDENT,
        deploy_tx=DEPLOY_TX, rule_tx=RULE_TX,
    ), record)
    # save() would have raised on anything credential-shaped; assert the file exists.
    assert record.path.exists()
    blob = record.path.read_text(encoding="utf-8")
    assert "private" not in blob.lower()
    assert "password" not in blob.lower()
