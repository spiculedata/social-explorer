"""The CLIP model image_pipeline loads.

open-clip-torch 3+ no longer switches on QuickGELU for the 'openai' weights when the plain
'ViT-B-32' config is requested (it warns about a QuickGELU mismatch and produces different,
degraded embeddings). The '-quickgelu' config matches the weights, and also exists in 2.x.
"""
import sys
import types

import pytest


@pytest.fixture
def image_pipeline(monkeypatch):
    """Import image_pipeline with its heavy, unrelated dependencies stubbed out."""
    for name in ('imagehash', 'PIL', 'PIL.Image', 'db_config'):
        monkeypatch.setitem(sys.modules, name, types.ModuleType(name))
    sys.modules['PIL'].Image = sys.modules['PIL.Image']
    sys.modules['db_config'].get_connection_context = lambda *a, **k: None
    monkeypatch.setenv('IMAGE_CACHE_DIR', '/tmp/image_cache_test')
    monkeypatch.delitem(sys.modules, 'image_pipeline', raising=False)
    import image_pipeline as module
    monkeypatch.setattr(module, '_clip_model', None)
    return module


def test_clip_loads_quickgelu_config_for_openai_weights(image_pipeline, monkeypatch):
    calls = {}

    class Model:
        def eval(self):
            return self

    fake_open_clip = types.ModuleType('open_clip')

    def create_model_and_transforms(name, pretrained=None):
        calls['create'] = (name, pretrained)
        return Model(), None, object()

    def get_tokenizer(name):
        calls['tokenizer'] = name
        return object()

    fake_open_clip.create_model_and_transforms = create_model_and_transforms
    fake_open_clip.get_tokenizer = get_tokenizer
    monkeypatch.setitem(sys.modules, 'open_clip', fake_open_clip)
    monkeypatch.setitem(sys.modules, 'torch', types.ModuleType('torch'))

    assert image_pipeline.get_clip_model() is not None
    assert calls['create'] == ('ViT-B-32-quickgelu', 'openai')
    assert calls['tokenizer'] == 'ViT-B-32-quickgelu'
