# NOTE: This file was added by Social Explorer contributors and is not part of upstream
# NYU-DICE-Lab/WavePulse (Apache-2.0). It is distributed with that derived work; see NOTICE and README.md.
"""
Remote command construction for the Scaleway GPU transcription backend.

Kept in a standard-library-only module so the safety properties of the
remote command can be tested and enforced without torch, requests or loguru
installed (see wavepulse/tests/test_gpu_command.py and acceptance/374/).

The command built here runs over SSH on the GPU instance. Historically the
audio file name was interpolated straight into a double-quoted `python -c`
string expanded by the remote shell, so a crafted station name could run
arbitrary commands as root. The audio path is now passed as a separate
argument to a static program, and every file name is checked against a safe
alphabet first.
"""

import re
import shlex

# ghcr.io/fedirz/faster-whisper-server, tag 0.6.0-rc.4-cuda, pinned to the
# multi-arch image index digest resolved from ghcr.io on 2026-11-26 (the
# registry no longer serves the floating ":latest-cuda" tag this previously
# referenced). Update the digest deliberately; never go back to a tag.
FASTER_WHISPER_IMAGE = (
    "ghcr.io/fedirz/faster-whisper-server@sha256:"
    "9c195aaef4d1e1b778ee731d1a40d8f45fd8289617048c93182314c7bb8f71e4"
)

# Audio file names reach the remote shell, so only a fixed safe alphabet is
# accepted: letters, digits, underscore, dash and dot, no leading dot, at
# most 128 characters. Station names are validated earlier
# (station_names.py); this is the last line of defence before the command
# is built.
AUDIO_FILE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")

# The python program that runs inside the GPU container. The audio path is
# NOT interpolated here: it is passed as a separate argument (sys.argv[1]).
TRANSCRIBE_PROGRAM = """\
import json, sys
from faster_whisper import WhisperModel
m = WhisperModel('large-v3', device='cuda', compute_type='float16')
segs, info = m.transcribe(sys.argv[1], beam_size=5, language='en')
result = [{'start': s.start, 'end': s.end, 'text': s.text} for s in segs]
json.dump({'segments': result, 'language': 'en'}, open('/data/transcript.json', 'w'))
"""


def validate_audio_file_name(audio_file_name: str) -> str:
    """Return `audio_file_name` unchanged when safe, raise ValueError otherwise."""
    if not isinstance(audio_file_name, str) or not AUDIO_FILE_NAME_RE.fullmatch(
        audio_file_name
    ):
        raise ValueError(f"unsafe audio file name: {audio_file_name!r}")
    return audio_file_name


def build_remote_transcribe_command(audio_file_name: str) -> str:
    """Build the shell command run on the GPU instance over SSH.

    The python program is a constant and the audio path is validated against
    the safe alphabet and passed through `shlex.quote`, so a crafted file
    name can never change what the remote shell executes.
    """
    validate_audio_file_name(audio_file_name)
    python_code = shlex.quote(TRANSCRIBE_PROGRAM)
    audio_arg = shlex.quote(f"/data/{audio_file_name}")
    return (
        f"docker run --rm --gpus all -v /tmp:/data "
        f"{FASTER_WHISPER_IMAGE} python -c {python_code} {audio_arg}"
    )
