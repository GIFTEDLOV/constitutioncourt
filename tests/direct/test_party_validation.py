"""Party and title validation at construction."""

import pytest

from conftest import CASE_TWO_THIRDS, address_cls, as_address


def test_respondent_may_not_be_the_zero_address(direct_vm, deploy_case):
    Address = address_cls()
    with direct_vm.expect_revert("zero address"):
        deploy_case(CASE_TWO_THIRDS, respondent=Address(bytes(20)))


def test_challenger_may_not_file_against_themselves(direct_vm, deploy_case, direct_alice):
    """Otherwise anyone could manufacture a favourable ruling about themselves."""
    with direct_vm.expect_revert("must differ"):
        deploy_case(CASE_TWO_THIRDS, challenger=direct_alice, respondent=direct_alice)


def test_a_third_party_respondent_is_accepted(deploy_case, direct_alice, direct_charlie):
    contract = deploy_case(
        CASE_TWO_THIRDS, challenger=direct_alice, respondent=direct_charlie
    )
    assert contract.get_state()["status"] == "OPEN"


def test_empty_case_title_is_rejected(direct_vm, deploy_case):
    with direct_vm.expect_revert("case_title is required"):
        deploy_case(CASE_TWO_THIRDS, case_title="")


def test_whitespace_only_case_title_is_rejected(direct_vm, deploy_case):
    with direct_vm.expect_revert("case_title is required"):
        deploy_case(CASE_TWO_THIRDS, case_title="   \t  ")


def test_overlong_case_title_is_rejected(direct_vm, deploy_case):
    with direct_vm.expect_revert("exceeds"):
        deploy_case(CASE_TWO_THIRDS, case_title="x" * 201)


def test_title_at_the_limit_is_accepted(deploy_case):
    title = "x" * 200
    contract = deploy_case(CASE_TWO_THIRDS, case_title=title)
    assert contract.get_state()["case_title"] == title


def test_case_title_is_trimmed(deploy_case):
    contract = deploy_case(CASE_TWO_THIRDS, case_title="  Meridian MC-2026-021  ")
    assert contract.get_state()["case_title"] == "Meridian MC-2026-021"


def test_respondent_survives_the_calldata_round_trip_as_an_address(
    deploy_case, direct_bob
):
    """A hex string would arrive as a `str` and be rejected.

    This is the whole reason `as_address` exists in conftest: production encodes
    the constructor argument as an Address, and a test that passed a string
    would be exercising a signature the chain never uses.
    """
    from conftest import addr_hex

    contract = deploy_case(CASE_TWO_THIRDS, respondent=as_address(direct_bob))
    assert contract.get_state()["respondent"].lower() == addr_hex(direct_bob)
