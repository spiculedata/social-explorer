# NOTE: Social Explorer's own module (not derived from WavePulse).
"""Name and path checks shared by the API server and the recording code.

A schedule entry that reaches the recorders names the files it produces. These
checks keep that name a single safe file-name component and keep the resolved
output path inside the recordings directory.
"""
import re
from pathlib import Path

# Matches single file-name components only: 1-32 letters, digits, "_" or "-".
# "/", "\\", "..", absolute paths and everything else are refused.
SAFE_NAME = re.compile(r'^[A-Za-z0-9_-]{1,32}$')


class UnsafeNameError(ValueError):
    """The value would escape the directory it is meant to stay inside."""


def assert_safe_name(value: object, field: str = 'name') -> str:
    """Returns `value` if it is a safe single file-name component, raises otherwise."""
    if not isinstance(value, str) or not SAFE_NAME.match(value):
        raise UnsafeNameError(
            f'{field} must be 1-32 letters, digits, "_" or "-" (got an unsafe value).'
        )
    return value


def assert_path_within(root: str, file_name: str) -> Path:
    """Returns the resolved path of `file_name` inside `root`, refusing escapes.

    Refuses absolute paths, "../" and any name whose resolved location is not
    inside `root` itself.
    """
    if not isinstance(file_name, str) or not file_name or Path(file_name).is_absolute():
        raise UnsafeNameError('File names must be relative and non-empty.')
    base = Path(root).resolve()
    candidate = base.joinpath(file_name).resolve()
    if base != candidate and base not in candidate.parents:
        raise UnsafeNameError('The file would be written outside the recordings directory.')
    return candidate
