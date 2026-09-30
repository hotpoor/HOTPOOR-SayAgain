"""Exercise a running local studio using public fixtures; no GPU generation."""
import json
from pathlib import Path
import re
import requests

URL = 'http://127.0.0.1:8768'
session = requests.Session()
session.trust_env = False
page = session.get(URL, timeout=10)
page.raise_for_status()
token = re.search(r"const TOKEN='([^']+)'", page.text).group(1)
headers = {'X-Studio-Token': token}
assert session.get(URL+'/api/presets', timeout=10).status_code == 403
assert session.get(URL, headers={'Host': 'example.com'}, timeout=10).status_code == 403
assert session.post(URL+'/api/transcribe', headers={**headers, 'Origin': 'https://example.com'}, json={}, timeout=10).status_code == 403
presets = session.get(URL+'/api/presets', headers=headers, timeout=10).json()['presets']
assert set(presets) == {'zh', 'en', 'ja'}
fixture = Path(__file__).resolve().parents[3] / 'speaker-local/sayagain-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09/test_wavs/zh.wav'
upload = session.post(URL+'/api/upload', headers=headers, data=fixture.read_bytes(), timeout=40)
upload.raise_for_status()
audio = upload.json()
assert 5 < audio['seconds'] < 6
transcribed = session.post(URL+'/api/transcribe', headers=headers, json={'source': audio['id']}, timeout=90)
assert transcribed.status_code == 200, transcribed.text
transcribed.raise_for_status()
assert '九' in transcribed.json()['text']
assert session.post(URL+'/api/generate', headers=headers, json={'source': '../bad', 'target': presets['en']['id'], 'text': 'test'}, timeout=10).status_code == 400
assert session.post(URL+'/api/upload', headers=headers, data=b'invalid audio', timeout=40).status_code == 400
assert session.post(URL+'/api/generate', headers=headers, json={'engine': 'unknown', 'source': presets['zh']['id']}, timeout=10).status_code == 400
assert session.post(URL+'/api/generate', headers=headers, json={'engine': 'seamless', 'source': presets['zh']['id'], 'target_language': 'invalid'}, timeout=10).status_code == 400
seamless = session.get(URL+'/api/seamless', headers=headers, timeout=10)
seamless.raise_for_status()
assert 'eng' in seamless.json()['languages'] and 'cmn' in seamless.json()['languages']
assert session.get(URL+'/api/seamless', timeout=10).status_code == 403
for job in seamless.json()['examples']:
    cached = session.post(URL+'/api/generate', headers=headers, json={'engine': 'seamless', 'source': job['source'], 'target_language': job['target_language']}, timeout=10)
    cached.raise_for_status()
    assert cached.json()['state'] == 'completed' and cached.json()['id'] == job['id']
    assert session.get(URL+'/api/jobs/'+job['id'], headers=headers, timeout=10).json()['translated_text'] == job['translated_text']
print(json.dumps({'passed': ['public fixture upload/decode', 'real CPU transcription', 'invalid audio rejected', 'invalid ID/engine/language rejected', 'session token required', 'foreign Host and Origin rejected', 'Seamless local capability API'], 'transcript': transcribed.json()['text']}, ensure_ascii=False))
