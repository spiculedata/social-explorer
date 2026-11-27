import hmac
import json
import os
import sys
import threading
import time
from pathlib import Path
from datetime import datetime

from flask import Flask, request, jsonify

# The schedule/url checks below only need the lightweight helpers in src/, not
# the full WavePulse stack (which may be missing in limited mode), so put src/
# on the path up front and import them directly.
sys.path.insert(0, '/app/src')
if os.path.isdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')):
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src'))

from path_safety import assert_safe_name, UnsafeNameError  # noqa: E402
from safe_http import assert_public_url, UnsafeUrlError  # noqa: E402

app = Flask(__name__)

# State
wavepulse_state = {
    'status': 'idle',  # idle, starting, running, stopping, error
    'active_streams': [],
    'started_at': None,
    'error': None,
    'recordings_count': 0,
    'transcripts_count': 0,
}

wavepulse_process = None
wavepulse_thread = None

DATA_DIR = Path(os.environ.get('WAVEPULSE_DATA_DIR', '/app/data'))
ASSETS_DIR = Path(os.environ.get('WAVEPULSE_ASSETS_DIR', '/app/assets'))
RECORDINGS_DIR = DATA_DIR / 'recordings'
TRANSCRIPTS_DIR = DATA_DIR / 'transcripts'
CLASSIFIED_DIR = DATA_DIR / 'classified'

# The UI proxy (ex-accell-ui) forwards this header; a request that does not
# carry the shared secret is refused. /health stays open for the container
# healthcheck. Fail closed: with no token configured nothing is controllable.
TOKEN_HEADER = 'X-WavePulse-Token'
PUBLIC_PATHS = {'/health'}

# Values the observatory understands; anything else is refused instead of
# being written into the environment of a root process.
ALLOWED_DEVICES = {'cpu', 'cuda'}
ALLOWED_COMPUTE_TYPES = {'float32', 'float16', 'int8_float32', 'int8'}


class ValidationError(ValueError):
    """The request body carries a value the recorder must not act on."""


@app.before_request
def require_shared_secret():
    """Refuse any request that does not carry the shared secret, except /health."""
    if request.path in PUBLIC_PATHS:
        return None
    expected = os.environ.get('WAVEPULSE_API_TOKEN')
    supplied = request.headers.get(TOKEN_HEADER, '')
    if not expected or not supplied or not hmac.compare_digest(supplied, expected):
        return jsonify({'error': 'Unauthorized'}), 401


def _validated_schedule(config):
    """Builds the observatory schedule from the request, refusing unsafe values."""
    streams = config.get('radioStreams', [])
    if not isinstance(streams, list):
        raise ValidationError('radioStreams must be a list.')
    schedule = []
    for stream in streams:
        if not isinstance(stream, dict):
            raise ValidationError('Every radio stream must be an object.')
        radio_name = stream.get('radio_name', stream.get('radioName', 'Unknown'))
        state = stream.get('state', '')
        url = stream.get('url', '')
        if not isinstance(url, str) or not url:
            raise ValidationError('Every stream needs a url.')
        try:
            assert_safe_name(radio_name, 'radio_name')
            assert_safe_name(state, 'state')
            assert_public_url(url)
        except (UnsafeNameError, UnsafeUrlError) as e:
            raise ValidationError(str(e)) from e

        time_slots = stream.get('time', [])
        if not time_slots:
            time_slots = [[ts.get('start', '00:00'), ts.get('end', '23:59')] for ts in stream.get('timeSlots', [])]
        if not time_slots:
            time_slots = [['00:00', '23:59']]
        schedule.append({
            'url': url,
            'radio_name': radio_name,
            'time': time_slots,
            'state': state,
        })
    return schedule


def _validated_compute(config):
    """Returns (device, compute_type) from the request, refusing unknown values."""
    device = config.get('device') or 'cpu'
    compute_type = config.get('computeType') or 'float32'
    if device not in ALLOWED_DEVICES:
        raise ValidationError('device must be one of: ' + ', '.join(sorted(ALLOWED_DEVICES)))
    if compute_type not in ALLOWED_COMPUTE_TYPES:
        raise ValidationError('computeType must be one of: ' + ', '.join(sorted(ALLOWED_COMPUTE_TYPES)))
    return device, compute_type


def _write_schedule(schedule):
    schedule_path = ASSETS_DIR / 'active_schedule.json'
    schedule_path.parent.mkdir(parents=True, exist_ok=True)
    schedule_path.write_text(json.dumps(schedule, indent=2))

    # Also save as weekly_schedule.json (default schedule file)
    weekly_path = ASSETS_DIR / 'weekly_schedule.json'
    weekly_path.write_text(json.dumps(schedule, indent=2))


@app.route('/status', methods=['GET'])
def get_status():
    """Get current WavePulse status."""
    # Count files
    wavepulse_state['recordings_count'] = len(list(RECORDINGS_DIR.glob('*.wav'))) + len(list(RECORDINGS_DIR.glob('*.mp3')))
    wavepulse_state['transcripts_count'] = len(list(TRANSCRIPTS_DIR.glob('*.json'))) + len(list(TRANSCRIPTS_DIR.glob('*.txt')))

    return jsonify(wavepulse_state)


@app.route('/start', methods=['POST'])
def start_wavepulse():
    """Start WavePulse recording with given configuration."""
    global wavepulse_thread

    if wavepulse_state['status'] == 'running':
        return jsonify({'error': 'WavePulse is already running'}), 400

    config = request.json or {}

    # Validate the caller-chosen values in the request handler, before any
    # thread or recorder sees them. API keys are never accepted over this
    # endpoint: HF_TOKEN and GEMINI_API_KEY come from the service environment.
    try:
        schedule = _validated_schedule(config)
        device, compute_type = _validated_compute(config)
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400

    wavepulse_state['status'] = 'starting'
    wavepulse_state['error'] = None

    def run_wavepulse():
        try:
            wavepulse_state['status'] = 'running'
            wavepulse_state['started_at'] = datetime.now().isoformat()
            wavepulse_state['active_streams'] = config.get('radioStreams', [])

            # Apply the schedule and environment even when the observatory
            # cannot import (limited mode): the schedule overwrite still holds.
            _write_schedule(schedule)
            os.environ['DEVICE'] = device
            os.environ['COMPUTE_TYPE'] = compute_type

            # Try to import and run actual WavePulse
            try:
                from wavepulse import start_observatory

                # Start the observatory (recording + transcription + classification)
                start_observatory()

            except ImportError as e:
                # WavePulse module not fully available — run in recording-only mode
                wavepulse_state['error'] = f'Running in limited mode: {str(e)}'
                # Keep running for status reporting
                while wavepulse_state['status'] == 'running':
                    time.sleep(5)

        except Exception as e:
            wavepulse_state['status'] = 'error'
            wavepulse_state['error'] = str(e)

    wavepulse_thread = threading.Thread(target=run_wavepulse, daemon=True)
    wavepulse_thread.start()

    return jsonify({'success': True, 'message': 'WavePulse starting...'})


@app.route('/stop', methods=['POST'])
def stop_wavepulse():
    """Stop WavePulse recording."""
    if wavepulse_state['status'] != 'running':
        return jsonify({'error': 'WavePulse is not running'}), 400

    wavepulse_state['status'] = 'stopping'

    # The thread will exit when status != 'running'
    time.sleep(1)
    wavepulse_state['status'] = 'idle'
    wavepulse_state['active_streams'] = []
    wavepulse_state['started_at'] = None

    return jsonify({'success': True, 'message': 'WavePulse stopped'})


@app.route('/recordings', methods=['GET'])
def list_recordings():
    """List recorded audio files."""
    recordings = []
    for f in sorted(RECORDINGS_DIR.glob('*.*'), key=lambda x: x.stat().st_mtime, reverse=True)[:100]:
        recordings.append({
            'filename': f.name,
            'size_bytes': f.stat().st_size,
            'modified': datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
        })
    return jsonify({'recordings': recordings, 'count': len(recordings)})


@app.route('/transcripts', methods=['GET'])
def list_transcripts():
    """List transcribed segments."""
    transcripts = []
    for f in sorted(TRANSCRIPTS_DIR.glob('*.json'), key=lambda x: x.stat().st_mtime, reverse=True)[:100]:
        try:
            data = json.loads(f.read_text())
            transcripts.append({
                'filename': f.name,
                'radio_name': data.get('radio_name', ''),
                'duration': data.get('duration', 0),
                'text_preview': data.get('text', '')[:200],
                'modified': datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
            })
        except Exception:
            continue
    return jsonify({'transcripts': transcripts, 'count': len(transcripts)})


@app.route('/health', methods=['GET'])
def health():
    """Health check."""
    return jsonify({'status': 'ok', 'service': 'wavepulse'})


if __name__ == '__main__':
    port = int(os.environ.get('WAVEPULSE_PORT', 8890))
    print(f'WavePulse API server starting on port {port}')
    from gunicorn.app.base import BaseApplication

    class WavePulseServer(BaseApplication):
        def load_config(self):
            # One worker: the service keeps recording state in process memory.
            self.cfg.set('bind', f'0.0.0.0:{port}')
            self.cfg.set('workers', '1')
            self.cfg.set('threads', '8')

        def load(self):
            return app

    WavePulseServer().run()
