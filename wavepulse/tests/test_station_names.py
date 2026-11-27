# NOTE: This file was added by Social Explorer contributors and is not part of upstream
# NYU-DICE-Lab/WavePulse (Apache-2.0). It is distributed with that derived work; see NOTICE and README.md.
"""Tests for radio station name validation (issue #374).

Station names arrive from the radio service's /start endpoint and end up in
recorded file names that transcription backends use. A name containing shell
metacharacters must be rejected.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import pytest

from audio_processor.station_names import STATION_NAME_RE, validate_station_name


@pytest.mark.parametrize(
    "name",
    [
        "NY_ABCD",
        "MA_WCBM",
        "AK_KENI",
        "ab",
        "ab-9",
        "A" * 32,
    ],
)
def test_accepts_safe_station_names(name):
    assert validate_station_name(name) == name


@pytest.mark.parametrize(
    "name",
    [
        "$(id>x)",  # command substitution — the reported injection
        "$(touch /tmp/pwned)",
        "`id`",  # backtick substitution
        "a`reboot`b",
        "a;reboot",  # shell separator
        "a&reboot",
        "a|reboot",
        "a b",  # whitespace
        "a'b",  # quote
        'a"b',
        "../../etc/passwd",  # path traversal characters
        "x" * 33,  # too long
        "",  # empty
        None,  # not a string
        12345,  # not a string
    ],
)
def test_rejects_unsafe_station_names(name):
    with pytest.raises(ValueError):
        validate_station_name(name)


def test_pattern_matches_documented_alphabet():
    assert STATION_NAME_RE.fullmatch("NY_ABCD")
    assert not STATION_NAME_RE.fullmatch("NY ABCD")
