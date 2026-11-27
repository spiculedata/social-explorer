"""Tests for the WavePulse control API's authentication and request validation.

Covers issue #366: every route except /health needs the shared secret, and /start
refuses unsafe station names, absolute/escaping paths and internal stream URLs.
Run with: python -m pytest test_api_server.py (needs flask, requests, pytest).
"""
import os
import time

import pytest

os.environ.setdefault('WAVEPULSE_API_TOKEN', 'test-token')

import api_server  # noqa: E402


@pytest.fixture()
def client():
    api_server.app.config['TESTING'] = True
    with api_server.app.test_client() as c:
        yield c


@pytest.fixture()
def auth():
    return {'X-WavePulse-Token': 'test-token'}


PROTECTED_ROUTES = [
    ('/status', 'GET'),
    ('/start', 'POST'),
    ('/stop', 'POST'),
    ('/recordings', 'GET'),
    ('/transcripts', 'GET'),
]


class TestAuthentication:
    @pytest.mark.parametrize('path,method', PROTECTED_ROUTES)
    def test_without_the_secret_every_route_is_401(self, client, path, method):
        response = client.open(path, method=method)
        assert response.status_code == 401

    @pytest.mark.parametrize('path,method', PROTECTED_ROUTES)
    def test_with_a_wrong_secret_every_route_is_401(self, client, auth, path, method):
        response = client.open(path, method=method, headers={'X-WavePulse-Token': 'wrong'})
        assert response.status_code == 401

    def test_health_stays_open_for_the_container_healthcheck(self, client):
        response = client.get('/health')
        assert response.status_code == 200
        assert response.get_json()['status'] == 'ok'

    def test_a_request_with_the_secret_gets_through(self, client, auth):
        response = client.get('/status', headers=auth)
        assert response.status_code == 200

    def test_with_no_token_configured_nothing_is_controllable(self, client, monkeypatch):
        monkeypatch.delenv('WAVEPULSE_API_TOKEN', raising=False)
        response = client.get('/status', headers={'X-WavePulse-Token': 'anything'})
        assert response.status_code == 401


class TestStartValidation:
    def _start(self, client, auth, stream):
        return client.post('/start', headers=auth, json={'radioStreams': [stream]})

    @pytest.mark.parametrize('state', ['../etc', '..', '/abs', 'CA/state', 'a' * 33, ''])
    def test_unsafe_state_is_refused(self, client, auth, state):
        response = self._start(client, auth, {'url': 'https://example.org/stream', 'radio_name': 'KQED', 'state': state})
        assert response.status_code == 400
        assert api_server.wavepulse_state['status'] == 'idle'

    @pytest.mark.parametrize('radio_name', ['../escape', '..', '/etc/passwd', 'KQ ED', 'x' * 33])
    def test_unsafe_radio_name_is_refused(self, client, auth, radio_name):
        response = self._start(client, auth, {'url': 'https://example.org/stream', 'radio_name': radio_name, 'state': 'CA'})
        assert response.status_code == 400
        assert api_server.wavepulse_state['status'] == 'idle'

    @pytest.mark.parametrize('url', [
        'http://127.0.0.1:8080/stream',      # loopback
        'http://169.254.169.254/latest',     # link-local cloud metadata
        'http://10.0.0.5/internal',          # private
        'http://[::1]/stream',               # IPv6 loopback
        'ftp://example.org/stream',          # not http(s)
        'http://wavepulse:8890',             # compose-network neighbour
    ])
    def test_internal_stream_urls_are_refused(self, client, auth, url):
        response = self._start(client, auth, {'url': url, 'radio_name': 'KQED', 'state': 'CA'})
        assert response.status_code == 400
        assert api_server.wavepulse_state['status'] == 'idle'

    def test_unknown_device_and_compute_type_are_refused(self, client, auth):
        assert client.post('/start', headers=auth, json={'device': 'tpu', 'radioStreams': []}).status_code == 400
        assert client.post('/start', headers=auth, json={'computeType': 'bfloat16', 'radioStreams': []}).status_code == 400

    def test_a_valid_request_is_accepted_and_keys_are_not_taken(self, client, auth, monkeypatch, tmp_path):
        monkeypatch.setattr(api_server, 'assert_public_url', lambda url: None)
        monkeypatch.setattr(api_server, 'ASSETS_DIR', tmp_path)
        env_before = {k: os.environ.get(k) for k in ('HF_TOKEN', 'GEMINI_API_KEY', 'DEVICE', 'COMPUTE_TYPE')}
        for key in env_before:
            os.environ.pop(key, None)
        try:
            response = client.post('/start', headers=auth, json={
                'radioStreams': [{'url': 'https://example.org/stream', 'radio_name': 'KQED', 'state': 'CA'}],
                'device': 'cpu',
                'computeType': 'float32',
                'huggingFaceToken': 'hf_attacker-token',
                'geminiApiKey': 'AIza-attacker-key',
            })
            assert response.status_code == 200
            time.sleep(0.3)  # the worker thread writes the schedule
            schedule = (tmp_path / 'active_schedule.json').read_text()
            assert 'KQED' in schedule
            # API keys are never accepted over this endpoint; they come from the service environment
            assert os.environ.get('HF_TOKEN') is None
            assert os.environ.get('GEMINI_API_KEY') is None
        finally:
            for key, value in env_before.items():
                if value is not None:
                    os.environ[key] = value
            api_server.wavepulse_state['status'] = 'idle'
