"""Pilot records, secret hygiene, configuration gating and fixtures — offline."""

import json
import os

import pytest

from pilot import config
from pilot.fixtures import (
    CASE_002, CASE_003, CASES, all_urls_are_commit_pinned, verify_contract_source,
    verify_local_fixture_bytes, verify_manifest_against_readme,
)
from pilot.record import PilotRecord, SecretLeakError


@pytest.fixture
def record(tmp_path):
    return PilotRecord.load_or_create("case-002", root=tmp_path)


# ------------------------------------------------------------- persistence --


def test_a_new_record_starts_empty_and_is_not_on_disk(record):
    assert not record.exists
    assert record.pending_hash("deploy") is None
    assert record.contract_address() is None


def test_a_submitted_hash_is_pending_until_settled(record):
    record.record_submission("deploy", "0xabc", "deploy")
    assert record.pending_hash("deploy") == "0xabc"
    assert record.settled_hash("deploy") is None
    assert record.any_unresolved() == "deploy"


def test_a_settled_hash_is_no_longer_pending(record):
    from pilot.classify import classify

    record.record_submission("deploy", "0xabc", "deploy")
    record.record_receipt("deploy", classify(
        {"statusName": "FINALIZED", "txExecutionResultName": "FINISHED_WITH_RETURN"}), {})
    assert record.pending_hash("deploy") is None
    assert record.settled_hash("deploy") == "0xabc"
    assert record.step_succeeded("deploy") is True
    assert record.any_unresolved() is None


def test_a_record_round_trips_through_disk(tmp_path):
    r = PilotRecord.load_or_create("case-002", root=tmp_path)
    r.record_submission("deploy", "0xabc", "deploy")
    r.record_contract("0x" + "c" * 40, "f" * 64)

    again = PilotRecord.load_or_create("case-002", root=tmp_path)
    assert again.pending_hash("deploy") == "0xabc"
    assert again.contract_address() == "0x" + "c" * 40


def test_records_are_written_atomically_and_are_valid_json(record):
    record.record_submission("deploy", "0xabc", "deploy")
    payload = json.loads(record.path.read_text(encoding="utf-8"))
    assert payload["case"] == "case-002"
    assert payload["steps"]["deploy"]["tx_hash"] == "0xabc"
    assert not list(record.path.parent.glob("*.tmp")), "no temp file left behind"


# ---------------------------------------------------------- secret hygiene --


@pytest.mark.parametrize("key", [
    "private_key", "privateKey", "mnemonic", "seed_phrase", "password",
    "keystore", "account_private_key", "secret",
])
def test_a_record_refuses_to_persist_anything_credential_shaped(record, key):
    record.data["inputs"] = {key: "whatever"}
    with pytest.raises(SecretLeakError):
        record.save()


def test_a_bare_64_hex_value_is_refused_because_that_is_what_a_key_looks_like(record):
    record.data["inputs"] = {"something": "a" * 64}
    with pytest.raises(SecretLeakError):
        record.save()


def test_a_prefixed_transaction_hash_is_still_allowed(record):
    # 0x-prefixed hashes are 66 characters and are the whole point of the record.
    record.record_submission("deploy", "0x" + "a" * 64, "deploy")
    assert record.pending_hash("deploy") == "0x" + "a" * 64


def test_nested_credentials_are_caught(record):
    record.data["steps"] = {"deploy": {"account": {"mnemonic": "x y z"}}}
    with pytest.raises(SecretLeakError):
        record.save()


def test_addresses_are_fine_to_record(record):
    record.record_accounts("0x" + "1" * 40, "0x" + "2" * 40)
    assert record.data["accounts"]["challenger"] == "0x" + "1" * 40


# --------------------------------------------------------------- config -----


def test_live_and_write_gates_are_independent(monkeypatch):
    monkeypatch.delenv(config.ENV_LIVE, raising=False)
    monkeypatch.delenv(config.ENV_WRITES, raising=False)
    assert not config.live_enabled()
    assert not config.writes_enabled()

    monkeypatch.setenv(config.ENV_LIVE, "1")
    assert config.live_enabled()
    # Enabling live reads must not enable spending.
    assert not config.writes_enabled()

    monkeypatch.setenv(config.ENV_WRITES, "1")
    assert config.writes_enabled()


def test_writes_require_live_too(monkeypatch):
    monkeypatch.delenv(config.ENV_LIVE, raising=False)
    monkeypatch.setenv(config.ENV_WRITES, "1")
    assert not config.writes_enabled()


def test_describe_never_leaks_a_key(monkeypatch):
    secret = "0x" + "d" * 64
    monkeypatch.setenv(config.ENV_CHALLENGER_KEY, secret)
    described = json.dumps(config.describe())
    # The summary reports *how* the party signs, never the material itself.
    assert '"challenger_signing": "raw-key"' in described
    assert '"uses_raw_keys": true' in described
    assert secret not in described
    assert "d" * 20 not in described


def test_credentials_reports_presence_only(monkeypatch):
    for var in (config.ENV_CHALLENGER_ACCOUNT, config.ENV_RESPONDENT_ACCOUNT):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv(config.ENV_CHALLENGER_KEY, "0xdead")
    monkeypatch.delenv(config.ENV_RESPONDENT_KEY, raising=False)
    creds = config.credentials()
    assert creds.challenger_present is True
    assert creds.respondent_present is False
    assert not creds.both_present
    # The dataclass carries selectors and modes, never key material.
    assert set(vars(creds)) == {
        "challenger_mode", "respondent_mode",
        "challenger_selector", "respondent_selector",
    }


def test_no_key_is_hard_coded_anywhere_in_the_package():
    import pathlib

    for path in pathlib.Path("pilot").glob("*.py"):
        text = path.read_text(encoding="utf-8")
        # A 64-hex literal in source would be an embedded key.
        import re
        for m in re.finditer(r"['\"]([0-9a-fA-F]{64})['\"]", text):
            # The contract source hash is a legitimate 64-hex literal.
            assert m.group(1) in (
                "bf845bc43768cb0829157ae9e7dad01a4d15b333c4139255d5018ac6ecf99341",
                "08ea34a2b415aa94608a6f009ec5353b4e3decdd8eb094416929e31fb3023b99",
                "638b7882dd48000681e14ade81e500185a1efacf752195cecedd002eaf5c2be9",
                "52e330445a9177278bcc4a26d61582007b67a2d5ec59510068f41c50cac533b1",
                "f7b5d2d04316bccc3519d72e63858efa229af1b2a1b1aecee3f487d879c32e30",
                "c272e34dda0dc9a053196e70d262254f69373ba73f5da5df0c19705b480210e9",
                "6bad9c983ec282bb9ea568751d8eebc75127959d9ce44043078939fadf41c55f",
                "6665af3892d7e9fd1df0b9954aa31afbc49a5a06ad82d7b8535fe0c69d269194",
                "cc0a4f088658a395e0e25d4cc2d53ba7703187a1221c463d36d3bcec7dd4048e",
            ), f"unexpected 64-hex literal in {path.name}"


def test_gen_conversion_round_trips():
    assert config.gen_to_wei(1) == 10 ** 18
    assert config.wei_to_gen(5 * 10 ** 18) == 5.0


# ------------------------------------------------------------- fixtures -----


def test_the_two_pilot_cases_are_the_expected_ones():
    assert set(CASES) == {"case-002", "case-003"}
    assert CASE_002.expected_outcome == "NON_COMPLIANT"
    assert CASE_002.expected_final_status == "REJECTED"
    assert CASE_002.expected_rule_ids == ("ART-4.3",)
    assert CASE_002.lifecycle == "OPEN -> RULED"
    assert CASE_003.expected_rule_ids == ("ART-5.4",)
    assert CASE_003.lifecycle == "OPEN -> RESPONDED -> RULED"


def test_case_002_has_no_response_and_case_003_does():
    # Case A's respondent stayed silent; that is why `rule` is reachable from
    # OPEN and why two cases are needed to cover both paths.
    assert CASE_002.response is None
    assert CASE_002.response_url is None
    assert CASE_003.response is not None


def test_constructor_args_are_in_the_locked_order():
    args = CASE_002.constructor_args("0x" + "2" * 40)
    assert args[0] == "0x" + "2" * 40
    assert args[1] == CASE_002.title
    assert args[2] == CASE_002.constitution_url
    assert args[3] == CASE_002.proposal_url
    assert args[4] == CASE_002.vote_record_url
    assert args[5] == CASE_002.notice_record_url
    assert len(args) == 6


def test_every_fixture_url_is_commit_pinned():
    assert all_urls_are_commit_pinned() == []


def test_the_manifest_agrees_with_evidence_readme():
    assert verify_manifest_against_readme() == []


def test_on_disk_fixtures_hash_to_the_manifest_values():
    assert verify_local_fixture_bytes() == []


def test_the_canonical_contract_source_hash_matches():
    ok, detail = verify_contract_source()
    assert ok, detail
