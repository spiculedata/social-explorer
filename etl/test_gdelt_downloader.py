"""Tests for the GDELT downloader's network boundary.

The downloader fetches the GDELT master list and then every file it names. Both
steps must talk only to https://data.gdeltproject.org with TLS verification on,
and a downloaded file is accepted only when its size and MD5 match the master
list. Everything here runs offline: responses come from fakes, never the network.
"""
import hashlib
import re
from pathlib import Path

import pytest

import gdelt_downloader
from gdelt_downloader import (
    MASTER_LIST_URL,
    GDELTDownloader,
    GDELTUrlError,
    GDELTVerificationError,
)

MASTER_LIST = (
    '12345 08c0e2a53cb3e25b0606b9ab45d50e57 https://data.gdeltproject.org/gdeltv2/20251130234500.export.CSV.zip\n'
    '67890 2592f7d0f40c6f4d6e42e6d707dcbbea https://data.gdeltproject.org/gdeltv2/20251130233000.gkg.csv.zip\n'
    '12345 08c0e2a53cb3e25b0606b9ab45d50e57 https://data.gdeltproject.org/gdeltv2/20241230234500.export.CSV.zip\n'
)


class FakeResponse:
    def __init__(self, body=b'', status=200, headers=None):
        self.status_code = status
        self._body = body if isinstance(body, bytes) else body.encode()
        self.text = self._body.decode()
        self.headers = headers or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise AssertionError(f'HTTP {self.status_code}')

    def iter_content(self, chunk_size=8192):
        for i in range(0, len(self._body), chunk_size):
            yield self._body[i:i + chunk_size]

    def close(self):
        pass


# A URL that is not https on the GDELT host must be refused before any request
# is made: the master list is attacker-writable, and an entry must not be able
# to point the downloader at another host (including an internal address).
@pytest.mark.parametrize('url', [
    'http://data.gdeltproject.org/gdeltv2/20251130234500.export.CSV.zip',  # plain http
    'https://evil.example.com/gdeltv2/20251130234500.export.CSV.zip',      # another host
    'https://data.gdeltproject.org.evil.example.com/20251130234500.export.CSV.zip',
    'ftp://data.gdeltproject.org/20251130234500.export.CSV.zip',
    'https://user:pw@data.gdeltproject.org/20251130234500.export.CSV.zip',
    'file:///etc/passwd',
])
def test_non_https_or_foreign_host_urls_are_refused(url):
    with pytest.raises(GDELTUrlError):
        gdelt_downloader.assert_gdelt_url(url)


@pytest.mark.parametrize('url', [
    'https://data.gdeltproject.org/gdeltv2/20251130234500.export.CSV.zip',
    'https://DATA.GDELTPROJECT.ORG/gdeltv2/20251130234500.export.CSV.zip',
])
def test_gdelt_urls_are_accepted(url):
    assert gdelt_downloader.assert_gdelt_url(url) is None


def test_master_list_is_https_on_gdelt_host():
    assert MASTER_LIST_URL.startswith('https://data.gdeltproject.org/')


def _downloader(tmp_path, responses):
    downloader = GDELTDownloader(download_dir=str(tmp_path))
    calls = []

    def get(url, **kwargs):
        calls.append({'url': url, **kwargs})
        if url not in responses:
            raise AssertionError(f'unexpected request to {url}')
        return responses[url]

    downloader.session.get = get
    downloader.calls = calls
    return downloader


def test_get_2025_files_keeps_only_2025_and_2026_entries(tmp_path):
    downloader = _downloader(tmp_path, {MASTER_LIST_URL: FakeResponse(MASTER_LIST)})
    files = downloader.get_2025_files()
    assert [url for _, _, url in files] == [
        'https://data.gdeltproject.org/gdeltv2/20251130234500.export.CSV.zip',
        'https://data.gdeltproject.org/gdeltv2/20251130233000.gkg.csv.zip',
    ]
    assert all(kwargs.get('verify', True) for kwargs in downloader.calls)


def test_master_list_entry_on_another_host_is_refused(tmp_path):
    tampered = MASTER_LIST.replace(
        'https://data.gdeltproject.org/gdeltv2/20251130233000.gkg.csv.zip',
        'http://169.254.169.254/latest/meta-data/',
    )
    downloader = _downloader(tmp_path, {MASTER_LIST_URL: FakeResponse(tampered)})
    with pytest.raises(GDELTUrlError):
        downloader.get_2025_files()


def test_master_list_entry_without_a_valid_md5_is_refused(tmp_path):
    tampered = MASTER_LIST.replace('2592f7d0f40c6f4d6e42e6d707dcbbea', 'not-a-hash')
    downloader = _downloader(tmp_path, {MASTER_LIST_URL: FakeResponse(tampered)})
    with pytest.raises(GDELTVerificationError):
        downloader.get_2025_files()


def _file_body_and_hash():
    body = b'synthetic GDELT export content, no real data\n' * 10
    return body, hashlib.md5(body).hexdigest()


def test_download_file_writes_verified_file(tmp_path):
    body, digest = _file_body_and_hash()
    url = 'https://data.gdeltproject.org/gdeltv2/20251130234500.export.CSV.zip'
    downloader = _downloader(tmp_path, {url: FakeResponse(body)})

    path = downloader.download_file(url, expected_size=str(len(body)), expected_md5=digest)

    assert path == tmp_path / '20251130234500.export.CSV.zip'
    assert path.read_bytes() == body
    # No verify=False: TLS verification stays on (requests' default)
    assert all(kwargs.get('verify', True) for kwargs in downloader.calls)
    # The .part side file is gone once the file has been moved into place
    assert list(tmp_path.glob('*.part')) == []


def test_download_file_with_wrong_hash_is_rejected(tmp_path):
    body, _ = _file_body_and_hash()
    url = 'https://data.gdeltproject.org/gdeltv2/20251130234500.export.CSV.zip'
    downloader = _downloader(tmp_path, {url: FakeResponse(body)})

    with pytest.raises(GDELTVerificationError, match='Hash mismatch'):
        downloader.download_file(url, expected_md5='0' * 32)

    # Neither the verified name nor the partial file may survive a hash mismatch
    assert list(tmp_path.iterdir()) == []


def test_download_file_with_wrong_size_is_rejected(tmp_path):
    body, digest = _file_body_and_hash()
    url = 'https://data.gdeltproject.org/gdeltv2/20251130234500.export.CSV.zip'
    downloader = _downloader(tmp_path, {url: FakeResponse(body)})

    with pytest.raises(GDELTVerificationError, match='Size mismatch'):
        downloader.download_file(url, expected_size=str(len(body) + 1), expected_md5=digest)

    assert list(tmp_path.iterdir()) == []


def test_download_file_refuses_a_foreign_host_url_before_any_request(tmp_path):
    downloader = _downloader(tmp_path, {})
    with pytest.raises(GDELTUrlError):
        downloader.download_file('http://169.254.169.254/latest/meta-data/')
    assert downloader.calls == []


def test_download_batch_passes_the_master_list_hash_through(tmp_path):
    body, digest = _file_body_and_hash()
    url = 'https://data.gdeltproject.org/gdeltv2/20251130234500.export.CSV.zip'
    downloader = _downloader(tmp_path, {url: FakeResponse(body)})
    downloader.max_workers = 1

    downloader.download_batch([(str(len(body)), digest, url)], max_files=1)

    assert (tmp_path / '20251130234500.export.CSV.zip').read_bytes() == body


def test_no_verify_false_anywhere_in_etl():
    """TLS verification must never be switched off in the ETL tree.

    The needle is spelled indirectly so this file does not trip its own scan,
    and the scan tolerates whitespace (verify= False is still a disabled check).
    Test files are excluded: the call sites that matter are the pipeline modules.
    """
    needle = re.compile(r'verify\s*=\s*False')
    etl_dir = Path(__file__).parent
    offenders = [
        path.name
        for path in sorted(etl_dir.glob('*.py'))
        if not path.name.startswith('test_')
        and needle.search(path.read_text(encoding='utf-8', errors='replace'))
    ]
    assert offenders == [], f'TLS verification disabled in: {offenders}'
