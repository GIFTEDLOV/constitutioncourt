"""Live Bradbury integration suite — opt-in, excluded from default runs.

Three independent gates stand between running `pytest` and spending GEN:

1. the ``integration`` marker, deselected by ``pytest.ini``'s
   ``-m "not integration"``;
2. ``CONSTITUTIONCOURT_LIVE=1``, without which every test here skips;
3. ``CONSTITUTIONCOURT_ALLOW_WRITES=1``, without which only read-only tests run.

Reading an environment variable is not consent to spend testnet GEN, so the
read gate and the write gate are deliberately separate. CI sets none of them.

No credential is ever read except at the moment a signature is needed, and none
is ever logged or persisted — see `pilot/config.py` and `pilot/record.py`.
"""

from __future__ import annotations

import pytest

from pilot import config as pilot_config
from pilot.fixtures import CASE_002, CASE_003
from pilot.record import PilotRecord


def pytest_collection_modifyitems(config, items):  # noqa: ARG001 — pytest hook name
    """Skip the whole suite unless the live gate is set.

    The marker alone already deselects these by default; this makes an explicit
    `-m integration` run skip loudly rather than silently attempt a network.

    The parameter must be named `config` because pytest matches hook arguments
    by name, which is why the pilot config module is imported under an alias.
    """
    del config  # the pytest Config object is not needed; the gate is env-based
    if pilot_config.live_enabled():
        return
    skip = pytest.mark.skip(
        reason=f"live suite is opt-in: set {pilot_config.ENV_LIVE}=1 (and "
               f"{pilot_config.ENV_WRITES}=1 for transactions)"
    )
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip)


@pytest.fixture(scope="session")
def live_config():
    if not pilot_config.live_enabled():
        pytest.skip(f"set {pilot_config.ENV_LIVE}=1 to run live tests")
    return pilot_config


@pytest.fixture(scope="session")
def adapter(live_config):
    from pilot.chain import GenLayerAdapter

    return GenLayerAdapter(rpc_url=pilot_config.rpc_url())


@pytest.fixture(scope="session")
def writes_allowed():
    if not pilot_config.writes_enabled():
        pytest.skip(
            f"set {pilot_config.ENV_WRITES}=1 to permit transactions that spend testnet GEN "
            "and require a wallet signature"
        )
    return True


@pytest.fixture(scope="session")
def challenger(adapter, writes_allowed):
    key = pilot_config.challenger_key()
    if not key:
        pytest.skip(f"{pilot_config.ENV_CHALLENGER_KEY} is not set")
    return adapter.account(key)


@pytest.fixture(scope="session")
def respondent(adapter, writes_allowed):
    key = pilot_config.respondent_key()
    if not key:
        pytest.skip(f"{pilot_config.ENV_RESPONDENT_KEY} is not set")
    return adapter.account(key)


@pytest.fixture(scope="session")
def case_a():
    """CASE A — silent respondent. OPEN → RULED."""
    return CASE_002


@pytest.fixture(scope="session")
def case_b():
    """CASE B — respondent answers. OPEN → RESPONDED → RULED."""
    return CASE_003


@pytest.fixture(scope="session")
def record_a():
    return PilotRecord.load_or_create(CASE_002.key)


@pytest.fixture(scope="session")
def record_b():
    return PilotRecord.load_or_create(CASE_003.key)
