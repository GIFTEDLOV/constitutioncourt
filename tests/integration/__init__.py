"""Live Bradbury integration suite.

This file is not ceremonial. Without it, pytest imports
``tests/integration/conftest.py`` under the bare module name ``conftest``,
which collides with ``tests/direct/conftest.py`` — and the direct-mode tests
import their fixtures with ``from conftest import ...``. In a full-suite run
whichever loaded last won, and ten direct-mode tests failed with confusing
ImportErrors about names that exist in the other conftest.

Making this directory a package gives its conftest a qualified module name, so
the bare ``conftest`` stays unambiguous for the direct suite.
"""
