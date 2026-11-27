# NOTE: This file was added by Social Explorer contributors and is not part of upstream
# NYU-DICE-Lab/WavePulse (Apache-2.0). It is distributed with that derived work; see NOTICE and README.md.
"""
Validation of radio station names.

A station name arrives through the radio service's /start endpoint
(`api_server.py`) and ends up in recorded file names (`audio_streamer.py`),
which transcription backends later use — including backends that run
commands on remote hosts. Only a fixed safe alphabet is accepted, so a
crafted name can never reach a file name or a shell.

Kept to the standard library only so it can be tested and used without the
wavepulse service dependencies installed.
"""

import re

# Letters, digits, underscore and dash, 1-32 characters. "MA_WCBM" style
# names (state abbreviation + callsign) fit; shell metacharacters, path
# separators and whitespace do not.
STATION_NAME_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")


def validate_station_name(radio_name: str) -> str:
    """Return `radio_name` unchanged when safe, raise ValueError otherwise."""
    if not isinstance(radio_name, str) or not STATION_NAME_RE.fullmatch(radio_name):
        raise ValueError(f"unsafe radio station name: {radio_name!r}")
    return radio_name
