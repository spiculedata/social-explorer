"""Tests for the audio backup uploader (utils/backup.py).

The backup code must refuse to run without explicit --ftp-server/--ftp-username/
--ftp-password configuration and must upload over FTPS, not plain FTP. The
insecure credentials and address that upstream shipped as argparse defaults were
removed (issue #385).
"""

import os
import sys
import types
from unittest import mock

import pytest

# utils/backup.py imports "args" (which imports torch) and "loguru". Stub both so
# the tests run without the transcription runtime installed.
_SRC = os.path.join(os.path.dirname(__file__), "src")
sys.path.insert(0, _SRC)

_backup_settings = {
    "ftp_server": None,
    "ftp_port": "21",
    "ftp_username": None,
    "ftp_password": None,
    "ftp_remote_folder": "daily_recordings",
}

_fake_args = types.ModuleType("args")
_fake_args.get_args = lambda: types.SimpleNamespace(**_backup_settings)
_fake_loguru = types.ModuleType("loguru")
_fake_loguru.logger = mock.Mock()
sys.modules.setdefault("args", _fake_args)
sys.modules.setdefault("loguru", _fake_loguru)

import utils.backup as backup  # noqa: E402


@pytest.fixture(autouse=True)
def reset_logging_stub():
    _fake_loguru.logger.reset_mock()
    _backup_settings.update(
        {
            "ftp_server": "backup.example.internal",
            "ftp_port": "990",
            "ftp_username": "backup-user",
            "ftp_password": "backup-pass",
            "ftp_remote_folder": "daily_recordings",
        }
    )
    yield
    _fake_loguru.logger.reset_mock()


def test_refuses_to_run_without_configuration():
    _backup_settings.update(
        {"ftp_server": None, "ftp_username": None, "ftp_password": None}
    )
    with mock.patch.object(backup, "FTP_TLS") as ftp_tls:
        backup.backup_files_via_ftp("/tmp/audio")
    ftp_tls.assert_not_called()
    logged = " ".join(
        str(call.args[0]) for call in _fake_loguru.logger.error.call_args_list
    )
    assert "--ftp-server" in logged
    assert "--ftp-username" in logged
    assert "--ftp-password" in logged


def test_refuses_partial_configuration():
    _backup_settings.update({"ftp_password": None})
    with mock.patch.object(backup, "FTP_TLS") as ftp_tls:
        backup.backup_files_via_ftp("/tmp/audio")
    ftp_tls.assert_not_called()
    logged = " ".join(
        str(call.args[0]) for call in _fake_loguru.logger.error.call_args_list
    )
    assert "--ftp-password" in logged


def test_connects_with_ftps_and_secures_data_channel():
    ftps = mock.Mock()
    ftps_factory = mock.Mock(return_value=ftps)
    with mock.patch.object(backup, "FTP_TLS", ftps_factory) as _, mock.patch.object(
        backup.os, "listdir", return_value=[]
    ):
        backup.backup_files_via_ftp("/tmp/audio")
    ftps_factory.assert_called_once()
    ftps.connect.assert_called_once_with("backup.example.internal", 990)
    ftps.login.assert_called_once_with(user="backup-user", passwd="backup-pass")
    ftps.prot_p.assert_called_once()
    ftps.quit.assert_called_once()


def test_uploads_files_over_encrypted_channel_and_deletes_local_copy(tmp_path):
    ftps = mock.Mock()
    local_dir = tmp_path / "audio"
    local_dir.mkdir()
    (local_dir / "segment1.mp3").write_bytes(b"audio")
    (local_dir / "segment2.wav").write_bytes(b"audio")
    (local_dir / "subdir").mkdir()
    with mock.patch.object(backup, "FTP_TLS", mock.Mock(return_value=ftps)):
        backup.backup_files_via_ftp(str(local_dir))
    uploaded = [call.args[0] for call in ftps.storbinary.call_args_list]
    assert sorted(name.split()[1] for name in uploaded) == [
        "segment1.mp3",
        "segment2.wav",
    ]
    assert not (local_dir / "segment1.mp3").exists()
    assert not (local_dir / "segment2.wav").exists()
    assert (local_dir / "subdir").exists()


def test_connect_failure_does_not_touch_local_files(tmp_path):
    local_dir = tmp_path / "audio"
    local_dir.mkdir()
    (local_dir / "segment1.mp3").write_bytes(b"audio")
    with mock.patch.object(
        backup, "FTP_TLS", mock.Mock(side_effect=OSError("refused"))
    ), mock.patch.object(backup.time, "sleep"):
        backup.backup_files_via_ftp(str(local_dir))
    assert (local_dir / "segment1.mp3").exists()
    _fake_loguru.logger.error.assert_called_once()
