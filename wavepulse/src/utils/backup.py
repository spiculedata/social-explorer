# NOTE: Derived from NYU-DICE-Lab/WavePulse (Apache-2.0, Copyright 2024 New York University).
# Modified by Social Explorer contributors (see git history for changes). See NOTICE and README.md.

import os
import ssl
import time
from args import get_args
from ftplib import FTP_TLS, error_perm
from loguru import logger


def connect_to_ftps(
    ftp_server, ftp_port, ftp_username, ftp_password, retries=3, timeout=60
):
    """Connect over explicit FTPS and secure the data channel (FTP command port 21)."""
    attempts = 0
    while attempts < retries:
        try:
            ftps = FTP_TLS(context=ssl.create_default_context())
            ftps.connect(ftp_server, int(ftp_port))
            ftps.login(user=ftp_username, passwd=ftp_password)
            ftps.prot_p()
            return ftps
        except Exception as e:
            attempts += 1
            logger.warning(f"Attempt {attempts} failed: {e}")
            if attempts < retries:
                logger.warning(f"Retrying in {timeout} seconds...")
                time.sleep(timeout)
            else:
                logger.warning("All attempts to connect to the backup server failed.")
                raise


def backup_files_via_ftp(local_folder):
    args = get_args()
    ftp_server = args.ftp_server
    ftp_port = args.ftp_port
    ftp_username = args.ftp_username
    ftp_password = args.ftp_password
    remote_folder = args.ftp_remote_folder

    # Refuse to run without explicit configuration: the credentials shipped as
    # argparse defaults upstream were placeholders, not real ones.
    missing = [
        flag
        for flag, value in (
            ("--ftp-server", ftp_server),
            ("--ftp-username", ftp_username),
            ("--ftp-password", ftp_password),
        )
        if not value
    ]
    if missing:
        logger.error(
            f"audio backup is enabled but not configured: set {' and '.join(missing)}"
            " (the insecure built-in defaults were removed)"
        )
        return

    logger.info("starting audio file backup")

    try:
        ftp = connect_to_ftps(ftp_server, ftp_port, ftp_username, ftp_password)
    except Exception as e:
        logger.error(f"Failed to connect to the backup server: {e}")
        return
    logger.info("successfully connected to the backup server over FTPS")
    try:
        # Change to the remote folder
        ftp.cwd(remote_folder)

        # List all files in the local folder
        for filename in os.listdir(local_folder):
            local_path = os.path.join(local_folder, filename)

            # Check if it's a file (not a directory)
            if os.path.isfile(local_path):
                with open(local_path, "rb") as file:
                    # Store the file on the backup server
                    ftp.storbinary(f"STOR {filename}", file)
                # Delete the file after successful upload
                os.remove(local_path)
        logger.info("Audio file backup completed")
    except error_perm as e:
        logger.error(f"FTPS error: {e}")
    except Exception as e:
        logger.error(f"An error occurred: {e}")
    finally:
        # Close the connection (quit() can fail if the control channel is gone)
        try:
            ftp.quit()
        except Exception:
            ftp.close()
