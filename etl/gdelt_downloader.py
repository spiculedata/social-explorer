import hashlib
import logging
import os
import re
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import List, Tuple
from urllib.parse import urlparse

import requests

from safe_http import guarded_session

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# The only host this downloader may talk to. Entries in the master list that name
# any other host are refused: a rewritten list must not turn the ETL container into
# a client for an internal or attacker-chosen address.
GDELT_HOST = 'data.gdeltproject.org'
MASTER_LIST_URL = f'https://{GDELT_HOST}/gdeltv2/masterfilelist.txt'

# The master list's second column is an MD5 hex digest; anything else is a tampered
# or malformed entry, and cannot be checked against the file we download.
_MD5_RE = re.compile(r'^[0-9a-f]{32}$')


class GDELTUrlError(ValueError):
    """A master-list entry or download URL is not an https URL on the GDELT host."""


class GDELTVerificationError(RuntimeError):
    """A downloaded file does not match the size or hash the master list gave."""


def assert_gdelt_url(url: str) -> None:
    """Refuse anything that is not a plain https URL on the GDELT host."""
    parsed = urlparse(url)
    if parsed.scheme != 'https':
        raise GDELTUrlError(f'GDELT URLs must be https://, got: {url!r}')
    host = (parsed.hostname or '').rstrip('.').lower()
    if host != GDELT_HOST:
        raise GDELTUrlError(f'GDELT downloads are restricted to {GDELT_HOST}, got host {host!r}: {url!r}')
    if parsed.username is not None or parsed.password is not None:
        raise GDELTUrlError(f'GDELT URLs must not carry credentials: {url!r}')


class GDELTDownloader:
    def __init__(self, download_dir: str = "data/gdelt_raw", max_workers: int = 4):
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(parents=True, exist_ok=True)
        self.max_workers = max_workers
        # TLS verification stays on (requests' default), environment proxies and
        # .netrc are ignored, and every connection goes to an address that was
        # checked to be public before it was dialed (safe_http.guarded_session).
        self.session = guarded_session()

    def get_2025_files(self) -> List[Tuple[str, str, str]]:
        """Fetch the GDELT master list over https and keep the 2025+ entries.

        Every entry is checked before it is returned: the URL must be an https
        address on the GDELT host, and the hash column must be an MD5 digest.
        A list that fails either check aborts the fetch rather than feeding an
        unchecked URL or an unverifiable file into the download batch.
        """
        logger.info("Fetching GDELT masterlist...")

        response = self.session.get(MASTER_LIST_URL, timeout=30)
        response.raise_for_status()

        files_2025 = []
        for line in response.text.split('\n'):
            if not line.strip():
                continue

            parts = line.split()
            if len(parts) >= 3:
                size, hash_val, url = parts[0], parts[1], parts[2]
                assert_gdelt_url(url)
                if not _MD5_RE.match(hash_val):
                    raise GDELTVerificationError(f'Master-list entry has no valid MD5 hash: {line!r}')

                filename = url.split('/')[-1]
                if filename.startswith('2025') or filename.startswith('2026'):
                    files_2025.append((size, hash_val, url))

        logger.info(f"Found {len(files_2025)} files from 2025-2026")
        return files_2025

    def download_file(self, url: str, expected_size: str = None, expected_md5: str = None) -> Path:
        """Download a single GDELT file and verify it against the master list.

        The file is downloaded to a `.part` side file and only moved into place
        once its size and MD5 match what the master list said, so a tampered or
        truncated download is never left behind where the pipeline can load it.
        """
        assert_gdelt_url(url)
        filename = url.split('/')[-1]
        filepath = self.download_dir / filename

        if filepath.exists():
            logger.debug(f"File already exists: {filename}")
            return filepath

        partial = filepath.with_name(filepath.name + '.part')
        md5 = hashlib.md5()
        total = 0
        try:
            logger.info(f"Downloading {filename}...")
            response = self.session.get(url, timeout=60, stream=True)
            response.raise_for_status()

            with open(partial, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        md5.update(chunk)
                        total += len(chunk)

            if expected_size is not None and total != int(expected_size):
                raise GDELTVerificationError(
                    f"Size mismatch for {filename}: expected {expected_size}, got {total}"
                )

            digest = md5.hexdigest()
            if expected_md5 is not None:
                if not _MD5_RE.match(expected_md5):
                    raise GDELTVerificationError(f"Master list gave no valid MD5 for {filename}")
                if digest != expected_md5.lower():
                    raise GDELTVerificationError(
                        f"Hash mismatch for {filename}: expected {expected_md5}, got {digest}"
                    )

            os.replace(partial, filepath)
            return filepath

        except Exception as e:
            logger.error(f"Error downloading {filename}: {e}")
            if partial.exists():
                partial.unlink()
            raise

    def extract_csv(self, zip_path: Path) -> Path:
        """Extract CSV from zip file"""
        csv_path = zip_path.with_suffix('.csv')

        if csv_path.exists():
            return csv_path

        try:
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                csv_files = [f for f in zip_ref.namelist() if f.endswith('.csv') or f.endswith('.CSV')]
                if csv_files:
                    zip_ref.extract(csv_files[0], self.download_dir)
                    extracted_path = self.download_dir / csv_files[0]
                    if extracted_path != csv_path:
                        extracted_path.rename(csv_path)
                    return csv_path
                else:
                    logger.error(f"No CSV file found in {zip_path}")
                    return None

        except Exception as e:
            logger.error(f"Error extracting {zip_path}: {e}")
            return None

    def download_batch(self, file_list: List[Tuple[str, str, str]], max_files: int = None):
        """Download a batch of files with threading"""
        if max_files:
            file_list = file_list[:max_files]

        logger.info(f"Starting download of {len(file_list)} files...")

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_url = {
                executor.submit(self.download_file, url, size, hash_val): (url, size)
                for size, hash_val, url in file_list
            }

            completed = 0
            for future in as_completed(future_to_url):
                url, size = future_to_url[future]
                try:
                    filepath = future.result()
                    completed += 1
                    if completed % 100 == 0:
                        logger.info(f"Downloaded {completed}/{len(file_list)} files")
                except Exception as e:
                    logger.error(f"Failed to download {url}: {e}")

if __name__ == "__main__":
    downloader = GDELTDownloader()
    files_2025 = downloader.get_2025_files()

    # Download first 10 files as a test
    logger.info("Starting test download of first 10 files...")
    downloader.download_batch(files_2025[:10])
