# NOTE: This file was added by Social Explorer contributors and is not part of upstream
# NYU-DICE-Lab/WavePulse (Apache-2.0). It is distributed with that derived work; see NOTICE and README.md.
"""Tests for the Scaleway GPU remote transcription command (issue #374).

The audio file name reaches a remote shell on the GPU instance, so a name
containing `$(`, a backtick or a quote must never be able to change the
command that runs there. The command builder is stdlib-only, so these tests
run without the wavepulse service dependencies installed.
"""

import os
import re
import shlex
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import pytest

from audio_processor.gpu_command import (
    AUDIO_FILE_NAME_RE,
    FASTER_WHISPER_IMAGE,
    TRANSCRIBE_PROGRAM,
    build_remote_transcribe_command,
    validate_audio_file_name,
)

BACKENDS_SOURCE = os.path.join(
    os.path.dirname(__file__), "..", "src", "audio_processor", "transcription_backends.py"
)


# --- C1: a hostile file name cannot change the remote command ---------------


@pytest.mark.parametrize(
    "hostile",
    [
        "$(id>x).mp3",  # command substitution — the reported injection
        "$(reboot).mp3",
        "`id`.mp3",  # backtick substitution
        "a'; touch /tmp/pwned #.mp3",  # quote + shell separator
        'a"; rm -rf / #.mp3',
        "MA_WCBM_2026_01_01;reboot.mp3",
    ],
)
def test_hostile_file_name_is_rejected_never_runs(hostile):
    with pytest.raises(ValueError):
        build_remote_transcribe_command(hostile)
    with pytest.raises(ValueError):
        validate_audio_file_name(hostile)


def test_safe_file_name_produces_quoted_stable_command():
    cmd = build_remote_transcribe_command("NY_ABCD_2024_01_01_08_00.mp3")
    tokens = shlex.split(cmd)
    # The audio path is one argv element passed to the static python program.
    assert tokens[-1] == "/data/NY_ABCD_2024_01_01_08_00.mp3"
    # The python program is the same constant every time, never interpolated.
    assert tokens[tokens.index("-c") + 1] == TRANSCRIBE_PROGRAM
    assert "sys.argv[1]" in TRANSCRIBE_PROGRAM
    # Rebuilding is deterministic: the name can never alter the structure.
    assert cmd == build_remote_transcribe_command("NY_ABCD_2024_01_01_08_00.mp3")


def test_program_does_not_embed_the_file_name():
    # The static program takes the path from its argument, never a literal name.
    assert "m.transcribe(sys.argv[1]" in TRANSCRIBE_PROGRAM
    assert "m.transcribe('/data/" not in TRANSCRIBE_PROGRAM


# --- C2: no disabled host-key checking ---------------------------------------


def test_no_disabled_host_key_checking_in_backend():
    with open(BACKENDS_SOURCE) as f:
        source = f.read()
    assert "StrictHostKeyChecking=no" not in source


def test_host_key_is_learned_then_strictly_verified():
    with open(BACKENDS_SOURCE) as f:
        source = f.read()
    # First contact learns the key into a dedicated known_hosts file...
    assert "StrictHostKeyChecking=accept-new" in source
    assert "UserKnownHostsFile=" in source
    # ...and every data-carrying connection requires an exact match.
    assert "StrictHostKeyChecking=yes" in source


# --- C3: the remote image is pinned by digest --------------------------------


def test_image_is_pinned_by_digest_not_tag():
    digest_form = re.search(r"@sha256:[0-9a-f]{64}$", FASTER_WHISPER_IMAGE)
    assert digest_form, FASTER_WHISPER_IMAGE
    with open(BACKENDS_SOURCE) as f:
        source = f.read()
    # No floating tag may remain in the backend source.
    assert "latest-cuda" not in source
    # The backend builds its command from the pinned constant, not its own string.
    assert "build_remote_transcribe_command" in source


def test_safe_audio_name_pattern():
    assert AUDIO_FILE_NAME_RE.fullmatch("NY_ABCD_2024_01_01_08_00.mp3")
    assert not AUDIO_FILE_NAME_RE.fullmatch("$(id>x).mp3")
    assert not AUDIO_FILE_NAME_RE.fullmatch(".hidden")
