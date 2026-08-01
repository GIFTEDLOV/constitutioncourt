"""Keystore account selection and secret redaction — offline.

Every keystore in these tests is generated on the fly with a throwaway key, so
nothing here depends on, reads, or could leak a real account.
"""

import json

import pytest

from pilot import config
from pilot.keystore import (
    KeystoreAccount, KeystoreError, describe_accounts, find_account, list_accounts,
    redact, unlock,
)
from pilot.signing import assert_distinct, resolve_challenger, resolve_respondent

PASSWORD = "correct horse battery staple"


@pytest.fixture
def keystore_dir(tmp_path):
    """Two throwaway keystore accounts, encrypted with a known password."""
    from eth_account import Account

    d = tmp_path / "keystores"
    d.mkdir()
    made = {}
    for name, seed in (("alpha", 1), ("beta", 2)):
        acct = Account.from_key(bytes([seed]) * 32)
        (d / f"{name}.json").write_text(
            json.dumps(Account.encrypt(acct.key, PASSWORD, kdf="scrypt", iterations=1024)),
            encoding="utf-8",
        )
        made[name] = acct.address
    return d, made


# ------------------------------------------------------------- discovery ----


def test_accounts_are_discovered_with_public_metadata_only(keystore_dir):
    d, made = keystore_dir
    accounts = list_accounts(d)
    assert {a.name for a in accounts} == {"alpha", "beta"}
    for a in accounts:
        assert a.address.startswith("0x")
        assert a.address.lower() in {v.lower() for v in made.values()}
        # The metadata object must carry nothing else.
        assert set(vars(a)) == {"name", "address", "path"}


def test_an_empty_directory_reports_clearly(tmp_path):
    with pytest.raises(KeystoreError, match="No keystore accounts found"):
        find_account("alpha", tmp_path)


def test_a_malformed_keystore_is_skipped_not_fatal(keystore_dir):
    d, _ = keystore_dir
    (d / "broken.json").write_text("{not json", encoding="utf-8")
    # The good accounts remain usable.
    assert {a.name for a in list_accounts(d)} == {"alpha", "beta"}


def test_a_keystore_without_an_address_is_skipped(keystore_dir):
    d, _ = keystore_dir
    (d / "noaddr.json").write_text(json.dumps({"version": 3}), encoding="utf-8")
    assert {a.name for a in list_accounts(d)} == {"alpha", "beta"}


# -------------------------------------------------------------- selection ---


def test_selection_by_name(keystore_dir):
    d, made = keystore_dir
    assert find_account("alpha", d).address.lower() == made["alpha"].lower()


def test_selection_by_address(keystore_dir):
    d, made = keystore_dir
    assert find_account(made["beta"], d).name == "beta"


def test_selection_by_address_is_case_insensitive(keystore_dir):
    d, made = keystore_dir
    assert find_account(made["beta"].lower(), d).name == "beta"
    assert find_account(made["beta"].upper().replace("0X", "0x"), d).name == "beta"


def test_an_unknown_selector_lists_what_is_available(keystore_dir):
    d, _ = keystore_dir
    with pytest.raises(KeystoreError) as exc:
        find_account("nonexistent", d)
    assert "alpha" in str(exc.value) and "beta" in str(exc.value)


def test_an_empty_selector_is_rejected(keystore_dir):
    d, _ = keystore_dir
    with pytest.raises(KeystoreError, match="No account selector"):
        find_account("   ", d)


def test_duplicate_names_are_ambiguous_rather_than_guessed(tmp_path):
    # Two files whose stems match the same selector must stop the run: picking
    # one would mean signing with an account nobody chose.
    from eth_account import Account

    d = tmp_path / "ks"
    d.mkdir()
    acct = Account.from_key(bytes([7]) * 32)
    blob = json.dumps(Account.encrypt(acct.key, PASSWORD, kdf="scrypt", iterations=1024))
    (d / "dup.json").write_text(blob, encoding="utf-8")
    (d / "other.json").write_text(blob, encoding="utf-8")
    # Same address in two files: selecting by address is ambiguous.
    with pytest.raises(KeystoreError, match="accounts match"):
        find_account(acct.address, d)


# ---------------------------------------------------------------- unlock ----


def test_unlock_returns_a_signing_account(keystore_dir):
    d, made = keystore_dir
    local = unlock(find_account("alpha", d), password=PASSWORD)
    assert local.address.lower() == made["alpha"].lower()


def test_a_wrong_password_fails_without_echoing_it(keystore_dir):
    d, _ = keystore_dir
    with pytest.raises(KeystoreError) as exc:
        unlock(find_account("alpha", d), password="wrong password")
    message = str(exc.value)
    assert "did not decrypt" in message
    assert "wrong password" not in message


def test_an_empty_password_is_refused(keystore_dir):
    d, _ = keystore_dir
    with pytest.raises(KeystoreError, match="No password entered"):
        unlock(find_account("alpha", d), password="")


def test_the_password_is_prompted_for_not_read_from_the_environment(keystore_dir, monkeypatch):
    d, made = keystore_dir
    asked = []

    def fake_prompt(message):
        asked.append(message)
        return PASSWORD

    # Even with a password-shaped variable set, the prompt is what is used.
    monkeypatch.setenv("PASSWORD", "not-this-one")
    local = unlock(find_account("alpha", d), prompt=fake_prompt)
    assert local.address.lower() == made["alpha"].lower()
    assert asked and "alpha" in asked[0]


def test_unlocking_the_wrong_account_is_refused(keystore_dir):
    d, made = keystore_dir
    with pytest.raises(KeystoreError, match="Refusing to sign with an unexpected account"):
        unlock(find_account("alpha", d), password=PASSWORD,
               expect_address=made["beta"])


def test_the_expected_address_check_accepts_the_right_account(keystore_dir):
    d, made = keystore_dir
    local = unlock(find_account("alpha", d), password=PASSWORD,
                   expect_address=made["alpha"].lower())
    assert local.address.lower() == made["alpha"].lower()


# ------------------------------------------------------------- redaction ----


def test_redact_keeps_nothing_of_a_secret_by_default():
    secret = "0x" + "a" * 64
    out = redact(secret)
    assert "a" * 8 not in out
    assert secret not in out
    assert "redacted" in out
    # The length is disclosed; the content is not.
    assert str(len(secret)) in out


def test_redact_handles_absent_and_empty():
    assert redact(None) == "(absent)"
    assert redact("") == "(empty)"


def test_describe_accounts_exposes_only_names_addresses_and_filenames(keystore_dir):
    d, _ = keystore_dir
    for entry in describe_accounts(d):
        assert set(entry) == {"name", "address", "file"}
        blob = json.dumps(entry)
        assert "ciphertext" not in blob
        assert "Crypto" not in blob


def test_the_config_summary_never_contains_key_material(monkeypatch):
    monkeypatch.setenv(config.ENV_CHALLENGER_ACCOUNT, "alpha")
    monkeypatch.setenv(config.ENV_CHALLENGER_KEY, "0x" + "d" * 64)
    described = json.dumps(config.describe())
    assert "alpha" in described                      # the selector is public
    assert "d" * 16 not in described                 # the key is not
    assert '"challenger_signing": "keystore"' in described


# --------------------------------------------------------------- signing ----


def test_a_keystore_selector_is_preferred_over_a_raw_key(keystore_dir, monkeypatch):
    d, made = keystore_dir
    monkeypatch.setenv("CONSTITUTIONCOURT_KEYSTORE_DIR", str(d))
    monkeypatch.setenv(config.ENV_CHALLENGER_ACCOUNT, "alpha")
    monkeypatch.setenv(config.ENV_CHALLENGER_KEY, "0x" + "d" * 64)

    signer = resolve_challenger(lambda k: None, password=PASSWORD)
    assert signer.mode == config.SigningMode.KEYSTORE
    assert signer.account_name == "alpha"
    assert signer.address.lower() == made["alpha"].lower()


def test_a_raw_key_is_used_only_when_no_selector_is_set(monkeypatch):
    monkeypatch.delenv(config.ENV_RESPONDENT_ACCOUNT, raising=False)
    monkeypatch.setenv(config.ENV_RESPONDENT_KEY, "0x" + "d" * 64)

    class FakeLocal:
        address = "0x" + "9" * 40

    signer = resolve_respondent(lambda k: FakeLocal())
    assert signer.mode == config.SigningMode.RAW_KEY
    assert signer.account_name is None


def test_no_configuration_at_all_is_a_clear_error(monkeypatch):
    for var in (config.ENV_CHALLENGER_ACCOUNT, config.ENV_CHALLENGER_KEY):
        monkeypatch.delenv(var, raising=False)
    with pytest.raises(KeystoreError, match="No challenger signing account configured"):
        resolve_challenger(lambda k: None)


def test_the_signer_summary_holds_no_secret(keystore_dir, monkeypatch):
    d, _ = keystore_dir
    monkeypatch.setenv("CONSTITUTIONCOURT_KEYSTORE_DIR", str(d))
    monkeypatch.setenv(config.ENV_CHALLENGER_ACCOUNT, "alpha")
    signer = resolve_challenger(lambda k: None, password=PASSWORD)
    summary = json.dumps(signer.describe())
    assert set(json.loads(summary)) == {"role", "address", "signing", "account"}
    assert PASSWORD not in summary


def test_challenger_and_respondent_must_differ(keystore_dir, monkeypatch):
    d, _ = keystore_dir
    monkeypatch.setenv("CONSTITUTIONCOURT_KEYSTORE_DIR", str(d))
    monkeypatch.setenv(config.ENV_CHALLENGER_ACCOUNT, "alpha")
    monkeypatch.setenv(config.ENV_RESPONDENT_ACCOUNT, "alpha")

    challenger = resolve_challenger(lambda k: None, password=PASSWORD)
    respondent = resolve_respondent(lambda k: None, password=PASSWORD)
    with pytest.raises(KeystoreError, match="same address"):
        assert_distinct(challenger, respondent)


def test_distinct_accounts_pass_the_check(keystore_dir, monkeypatch):
    d, _ = keystore_dir
    monkeypatch.setenv("CONSTITUTIONCOURT_KEYSTORE_DIR", str(d))
    monkeypatch.setenv(config.ENV_CHALLENGER_ACCOUNT, "alpha")
    monkeypatch.setenv(config.ENV_RESPONDENT_ACCOUNT, "beta")
    challenger = resolve_challenger(lambda k: None, password=PASSWORD)
    respondent = resolve_respondent(lambda k: None, password=PASSWORD)
    assert_distinct(challenger, respondent)  # no raise


def test_an_expected_address_mismatch_stops_a_raw_key_signer(monkeypatch):
    monkeypatch.delenv(config.ENV_CHALLENGER_ACCOUNT, raising=False)
    monkeypatch.setenv(config.ENV_CHALLENGER_KEY, "0x" + "d" * 64)
    monkeypatch.setenv(config.ENV_CHALLENGER_ADDRESS, "0x" + "1" * 40)

    class FakeLocal:
        address = "0x" + "9" * 40

    with pytest.raises(KeystoreError, match="Refusing to sign with an unexpected account"):
        resolve_challenger(lambda k: FakeLocal())


def test_no_password_is_ever_persisted_in_a_pilot_record(tmp_path):
    from pilot.record import PilotRecord, SecretLeakError

    record = PilotRecord.load_or_create("case-002", root=tmp_path)
    record.data["accounts"] = {"challenger": "0x" + "1" * 40, "password": PASSWORD}
    with pytest.raises(SecretLeakError):
        record.save()
