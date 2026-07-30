"""Evidence URLs must be publicly and identically fetchable by every validator.

Every rejection here is a consensus-safety rule, not a style preference. A URL
that one validator can fetch and another cannot — or that resolves differently
per request — is a consensus split waiting to happen, and the contract's only
chance to reject it is at pin time.
"""

import pytest

from conftest import CASE_TWO_THIRDS

URL_FIELDS = (
    "constitution_url",
    "proposal_url",
    "vote_record_url",
    "notice_record_url",
)


@pytest.mark.parametrize("field", URL_FIELDS)
def test_plain_http_is_rejected(direct_vm, deploy_case, field):
    """Over HTTP an on-path attacker can serve different bytes per validator."""
    with direct_vm.expect_revert("https://"):
        deploy_case(CASE_TWO_THIRDS, **{field: "http://evidence.example/doc.json"})


@pytest.mark.parametrize("field", URL_FIELDS)
def test_empty_url_is_rejected(direct_vm, deploy_case, field):
    with direct_vm.expect_revert("required"):
        deploy_case(CASE_TWO_THIRDS, **{field: ""})


@pytest.mark.parametrize("field", URL_FIELDS)
def test_whitespace_only_url_is_rejected(direct_vm, deploy_case, field):
    with direct_vm.expect_revert("required"):
        deploy_case(CASE_TWO_THIRDS, **{field: "   "})


@pytest.mark.parametrize(
    "url",
    [
        "https://user:pass@evidence.example/doc.json",
        "https://token@evidence.example/doc.json",
    ],
)
def test_embedded_credentials_are_rejected(direct_vm, deploy_case, url):
    """Evidence requiring a secret is not independently verifiable — and the
    secret would be published on-chain forever."""
    with direct_vm.expect_revert("credentials"):
        deploy_case(CASE_TWO_THIRDS, constitution_url=url)


@pytest.mark.parametrize(
    "url",
    [
        "https://evidence.example/doc.json?access_token=abc123",
        "https://evidence.example/doc.json?api_key=abc123",
        "https://evidence.example/doc.json?token=abc123",
        "https://evidence.example/doc.json?signature=deadbeef",
    ],
)
def test_credential_shaped_query_parameters_are_rejected(direct_vm, deploy_case, url):
    with direct_vm.expect_revert("credential"):
        deploy_case(CASE_TWO_THIRDS, proposal_url=url)


def test_an_at_sign_in_the_path_is_allowed(deploy_case):
    """Only the authority component may not contain '@'. Paths often do."""
    url = "https://evidence.example/users/@meridian/constitution.json"
    contract = deploy_case(CASE_TWO_THIRDS, constitution_url=url)
    assert contract.get_evidence_sources()["constitution_url"] == url


def test_overlong_url_is_rejected(direct_vm, deploy_case):
    long_url = "https://evidence.example/" + ("a" * 2100) + ".json"
    with direct_vm.expect_revert("exceeds"):
        deploy_case(CASE_TWO_THIRDS, vote_record_url=long_url)


@pytest.mark.parametrize("bad", ["https://evidence.example/a\nb.json", "https://ev idence.example/a.json"])
def test_whitespace_and_control_characters_are_rejected(direct_vm, deploy_case, bad):
    """Two URLs that render alike but resolve differently is an attack, not a typo."""
    with direct_vm.expect_revert("control characters"):
        deploy_case(CASE_TWO_THIRDS, notice_record_url=bad)


def test_scheme_relative_url_is_rejected(direct_vm, deploy_case):
    with direct_vm.expect_revert("https://"):
        deploy_case(CASE_TWO_THIRDS, constitution_url="//evidence.example/doc.json")


def test_url_with_no_host_is_rejected(direct_vm, deploy_case):
    with direct_vm.expect_revert("host"):
        deploy_case(CASE_TWO_THIRDS, constitution_url="https://")


def test_url_with_empty_authority_is_rejected(direct_vm, deploy_case):
    with direct_vm.expect_revert("host"):
        deploy_case(CASE_TWO_THIRDS, constitution_url="https:///doc.json")


def test_surrounding_whitespace_is_trimmed_not_rejected(deploy_case):
    contract = deploy_case(
        CASE_TWO_THIRDS, constitution_url="  https://evidence.example/c.json  "
    )
    assert contract.get_evidence_sources()["constitution_url"] == (
        "https://evidence.example/c.json"
    )


# ---------------------------------------------------- the response URL too ---


def test_response_url_must_be_https(direct_vm, open_case, direct_bob):
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("https://"):
        open_case.submit_response("http://evidence.example/response.json")


def test_response_url_rejects_embedded_credentials(direct_vm, open_case, direct_bob):
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("credentials"):
        open_case.submit_response("https://u:p@evidence.example/response.json")


def test_response_url_cannot_be_empty(direct_vm, open_case, direct_bob):
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("required"):
        open_case.submit_response("")
