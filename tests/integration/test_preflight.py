"""Live preflight — read-only. Signs nothing, spends nothing.

Runs against Bradbury but requires no wallet: an operator must be able to
confirm the world is ready *before* anybody unlocks a key.
"""

import hashlib
import urllib.request

import pytest

from pilot import config
from pilot.fixtures import CASES, verify_contract_source, verify_manifest_against_readme
from pilot.preflight import run_preflight
from pilot.record import PilotRecord

pytestmark = pytest.mark.integration


def test_rpc_is_reachable(adapter):
    assert adapter.chain_id() is not None


def test_chain_id_is_4221(adapter):
    assert adapter.chain_id() == config.CHAIN_ID


def test_canonical_contract_source_hash_matches():
    ok, detail = verify_contract_source()
    assert ok, detail


def test_fixture_manifest_agrees_with_evidence_readme():
    assert verify_manifest_against_readme() == []


@pytest.mark.parametrize(
    "case_key,doc",
    [(c.key, d) for c in CASES.values() for d in c.all_documents()],
    ids=[f"{c.key}/{d.filename}" for c in CASES.values() for d in c.all_documents()],
)
def test_every_canonical_evidence_url_returns_200_and_matches_its_hash(case_key, doc):
    url = doc.url(CASES[case_key].case_dir)
    with urllib.request.urlopen(url, timeout=30) as resp:
        assert resp.status == 200
        body = resp.read()
    assert hashlib.sha256(body).hexdigest() == doc.sha256
    assert b"\r\n" not in body, "served bytes must be LF"


def test_accounts_are_not_required_for_a_read_only_preflight(adapter):
    """The account checks must be skipped, not failed, without a write run."""
    report = run_preflight(adapter=adapter, check_accounts=False, fetch=False,
                           resuming=True)
    account_checks = [c for c in report.checks if c.id == "accounts"]
    assert account_checks and account_checks[0].ok is None


def test_challenger_account_exists_and_has_enough_gen(adapter, challenger):
    """Only meaningful for a write run — `challenger` skips without the gates."""
    balance = adapter.balance_wei(challenger.address)
    assert balance >= config.gen_to_wei(config.MIN_CHALLENGER_GEN), (
        f"challenger holds {config.wei_to_gen(balance):.4f} GEN, "
        f"need {config.MIN_CHALLENGER_GEN}"
    )


def test_respondent_account_exists_and_has_enough_gen(adapter, respondent):
    balance = adapter.balance_wei(respondent.address)
    assert balance >= config.gen_to_wei(config.MIN_RESPONDENT_GEN), (
        f"respondent holds {config.wei_to_gen(balance):.4f} GEN, "
        f"need {config.MIN_RESPONDENT_GEN}"
    )


def test_challenger_and_respondent_differ(challenger, respondent):
    # The constructor rejects a case against oneself.
    assert challenger.address.lower() != respondent.address.lower()


@pytest.mark.parametrize("case_key", sorted(CASES))
def test_no_unresolved_pilot_record_unless_resuming(case_key):
    record = PilotRecord.load_or_create(case_key)
    if not record.exists:
        return
    unresolved = record.any_unresolved()
    if unresolved and not config.resume_enabled():
        pytest.fail(
            f"{case_key} step {unresolved!r} holds a transaction hash with no settled "
            f"outcome. Inspect it, then set {config.ENV_RESUME}=1 to continue. "
            "Nothing will be resent automatically."
        )


def test_config_summary_leaks_no_credential():
    described = config.describe()
    assert set(described) >= {"chain_id", "live_enabled", "writes_enabled"}
    for value in described.values():
        assert not (isinstance(value, str) and len(value) >= 32), (
            "the loggable config summary must never contain key-length material"
        )
