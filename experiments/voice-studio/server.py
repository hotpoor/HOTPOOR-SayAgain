"""Loopback-only voice-cloning experiment; existing model environments required."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

APP = Path(__file__).resolve().parent
REPO = APP.parents[1]
WORKSPACE = REPO.parent
ASR_PYTHON = WORKSPACE / 'speaker-local/sayagain-input-venv/Scripts/python.exe'
TTS_PYTHON = WORKSPACE / 'qwen-tts-local/.venv/Scripts/python.exe'
MODEL = WORKSPACE / 'qwen-tts-local/models/Qwen3-TTS-12Hz-1.7B-Base'
SENSE = WORKSPACE / 'speaker-local/sayagain-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09'
FFMPEG = REPO / 'node_modules/ffmpeg-static/ffmpeg.exe'
TOKEN = secrets.token_urlsafe(32)
LOCK = threading.Lock()
JOBS = {}
LANGUAGES = {'Chinese', 'English', 'Japanese', 'Korean', 'French', 'German', 'Spanish', 'Italian', 'Portuguese', 'Russian', 'Auto'}

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8768)
parser.add_argument('--data-dir', default=str(WORKSPACE / 'seamless-local/studio-data'))
args = parser.parse_args()
DATA = Path(args.data_dir).resolve()
MEDIA = DATA / 'media'
MEDIA.mkdir(parents=True, exist_ok=True)

def audio_info(path):
    import soundfile as sf
    info = sf.info(str(path))
    return {'seconds': info.duration, 'sample_rate': info.samplerate}

def media(path):
    ident = hashlib.sha256(path.read_bytes()).hexdigest()
    target = MEDIA / (ident + '.wav')
    if not target.exists():
        target.write_bytes(path.read_bytes())
    return {'id': ident, 'url': '/media/' + ident + '.wav', **audio_info(target)}

PRESETS = {lang: media(SENSE / 'test_wavs' / (lang + '.wav')) for lang in ['zh', 'en', 'ja']}

def get_audio(ident):
    if not isinstance(ident, str) or len(ident) != 64 or any(c not in '0123456789abcdef' for c in ident):
        raise ValueError('无效音频标识')
    path = MEDIA / (ident + '.wav')
    if not path.is_file():
        raise ValueError('找不到音频，请重新上传')
    return path

def synthesize(ident, request):
    job = JOBS[ident]
    started = time.perf_counter()
    try:
        output = MEDIA / (ident + '.wav')
        worker = {'text': request['text'], 'language': request['language'],
                  'reference_path': str(get_audio(request['target'])),
                  'reference_text': request.get('reference_text', ''),
                  'output_path': str(output), 'device': 'cuda:0', 'model_path': str(MODEL)}
        env = os.environ.copy()
        env.update(PYTHONIOENCODING='utf-8', HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1')
        with (DATA / (ident + '.log')).open('w', encoding='utf-8') as log:
            result = subprocess.run([str(TTS_PYTHON), str(REPO / 'workers/qwen_tts_worker.py')],
                                    input=json.dumps(worker, ensure_ascii=False), text=True,
                                    encoding='utf-8', stdout=subprocess.PIPE, stderr=log, env=env, timeout=600)
        reply = json.loads(result.stdout.strip().splitlines()[-1]) if result.stdout.strip() else {}
        if result.returncode != 0 or not reply.get('ok'):
            raise RuntimeError(reply.get('error', '本地生成失败，请查看实验日志'))
        import numpy as np
        import soundfile as sf
        samples, _ = sf.read(str(output))
        if not samples.size or not np.isfinite(samples).all() or np.max(np.abs(samples)) == 0:
            raise RuntimeError('生成音频为空或无效')
        job.update(state='completed', url='/media/' + ident + '.wav', elapsed_seconds=time.perf_counter()-started,
                   model=MODEL.name, device='cuda:0', **audio_info(output))
        (DATA / (ident + '.json')).write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception as exc:
        job.update(state='failed', error=str(exc)[:1000], elapsed_seconds=time.perf_counter()-started)
    finally:
        LOCK.release()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def allowed(self, auth=False):
        expected = f'127.0.0.1:{args.port}'
        if self.headers.get('Host') != expected:
            return False
        if self.headers.get('Sec-Fetch-Site') == 'cross-site':
            return False
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + expected:
            return False
        return not auth or secrets.compare_digest(self.headers.get('X-Studio-Token', ''), TOKEN)

    def respond(self, value, status=200):
        body = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.allowed():
            return self.respond({'error': '访问来源无效'}, 403)
        route = urlparse(self.path).path
        if route == '/':
            body = (APP / 'index.html').read_text(encoding='utf-8').replace('__STUDIO_TOKEN__', TOKEN).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'")
            self.end_headers()
            return self.wfile.write(body)
        if route.startswith('/media/'):
            try:
                filename = route.removeprefix('/media/')
                if not filename.endswith('.wav'):
                    raise ValueError('无效文件')
                path = get_audio(filename[:-4])
                body = path.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'audio/wav')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                return self.wfile.write(body)
            except ValueError as exc:
                return self.respond({'error': str(exc)}, 404)
        if not self.allowed(auth=True):
            return self.respond({'error': '会话已过期，请刷新页面'}, 403)
        if route == '/api/presets':
            canonical = {'source': PRESETS['zh']['id'], 'target': PRESETS['en']['id'],
                         'text': '开放时间早上九点至下午五点。', 'language': 'Chinese',
                         'reference_text': '', 'model': MODEL.name}
            ident = hashlib.sha256(json.dumps(canonical, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            saved = DATA / (ident + '.json')
            example = json.loads(saved.read_text(encoding='utf-8')) if saved.is_file() and (MEDIA / (ident + '.wav')).exists() else None
            return self.respond({'presets': PRESETS, 'example_result': example})
        if route.startswith('/api/jobs/'):
            ident = route.rsplit('/', 1)[-1]
            if len(ident) == 64 and all(c in '0123456789abcdef' for c in ident):
                saved = DATA / (ident + '.json')
                if ident not in JOBS and saved.is_file():
                    JOBS[ident] = json.loads(saved.read_text(encoding='utf-8'))
            return self.respond(JOBS[ident]) if ident in JOBS else self.respond({'error': '任务不存在'}, 404)
        return self.respond({'error': '找不到页面'}, 404)

    def do_POST(self):
        if not self.allowed(auth=True):
            return self.respond({'error': '访问来源或会话无效'}, 403)
        try:
            route = urlparse(self.path).path
            size = int(self.headers.get('Content-Length', 0))
            maximum = 20 * 1024 * 1024 if route == '/api/upload' else 16 * 1024
            if not 0 < size <= maximum:
                raise ValueError('文件过大或请求为空，音频上限为 20 MB')
            raw = self.rfile.read(size)
            if len(raw) != size:
                raise ValueError('上传中断，请重试')
            if route == '/api/upload':
                upload_id = secrets.token_hex(16)
                original = DATA / (upload_id + '.upload')
                converted = DATA / (upload_id + '.wav')
                try:
                    original.write_bytes(raw)
                    result = subprocess.run([str(FFMPEG), '-hide_banner', '-loglevel', 'error', '-y', '-i',
                                             str(original), '-ac', '1', '-ar', '24000', '-t', '61', str(converted)],
                                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
                    if result.returncode:
                        raise ValueError('无法解码音频，请上传 WAV、MP3 或 M4A')
                    info = audio_info(converted)
                    if not 1 <= info['seconds'] <= 60:
                        raise ValueError('请使用 1–60 秒短录音；音色参考建议至少 10 秒')
                    return self.respond(media(converted))
                finally:
                    original.unlink(missing_ok=True)
                    converted.unlink(missing_ok=True)
            request = json.loads(raw)
            if route == '/api/transcribe':
                audio = get_audio(request.get('source'))
                job = {'audio': str(audio), 'models': {'sensevoice': {'path': str(SENSE)}}, 'language': 'auto',
                       'turns': [{'start_ms': 0, 'end_ms': round(audio_info(audio)['seconds']*1000), 'speaker': 'source'}]}
                result = subprocess.run([str(ASR_PYTHON), str(REPO / 'workers/transcribe_recording.py')],
                                        input=json.dumps(job), text=True, encoding='utf-8', stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE, timeout=90,
                                        env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
                response = json.loads(result.stdout)
                if result.returncode or response.get('error'):
                    raise ValueError(response.get('error', '转写失败'))
                return self.respond({'text': response['text']})
            if route == '/api/generate':
                get_audio(request.get('source'))
                reference = get_audio(request.get('target'))
                if not 3 <= audio_info(reference)['seconds'] <= 60:
                    raise ValueError('目标音色参考至少需要 3 秒，建议 10–20 秒')
                text = request.get('text', '').strip()
                if not 1 <= len(text) <= 300:
                    raise ValueError('请填写并校对 1–300 字的生成文字')
                language = request.get('language', 'Chinese')
                if language not in LANGUAGES:
                    raise ValueError('不支持的合成语言')
                ref_text = request.get('reference_text', '').strip()
                if len(ref_text) > 1000:
                    raise ValueError('音色参考原文过长')
                canonical = {'source': request['source'], 'target': request['target'], 'text': text,
                             'language': language, 'reference_text': ref_text, 'model': MODEL.name}
                ident = hashlib.sha256(json.dumps(canonical, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                if ident in JOBS and JOBS[ident]['state'] in ('running', 'completed'):
                    return self.respond(JOBS[ident])
                saved = DATA / (ident + '.json')
                if saved.exists() and (MEDIA / (ident + '.wav')).exists():
                    JOBS[ident] = json.loads(saved.read_text(encoding='utf-8'))
                    return self.respond(JOBS[ident])
                if not LOCK.acquire(blocking=False):
                    return self.respond({'error': '本机正在生成，请等待当前任务完成'}, 409)
                JOBS[ident] = {'id': ident, 'state': 'running', **canonical}
                threading.Thread(target=synthesize, args=(ident, canonical), daemon=True).start()
                return self.respond(JOBS[ident], 202)
            return self.respond({'error': '接口不存在'}, 404)
        except Exception as exc:
            self.respond({'error': str(exc)[:1000]}, 400)

if __name__ == '__main__':
    for required in [ASR_PYTHON, TTS_PYTHON, MODEL, FFMPEG]:
        if not required.exists():
            raise SystemExit('缺少本地运行依赖：' + str(required))
    print(f'Voice Studio http://127.0.0.1:{args.port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
