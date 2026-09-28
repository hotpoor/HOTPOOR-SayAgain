"""Offline IndexTTS 2.5 adapter. One request per process; no installation fallback."""
import contextlib
import hashlib
import inspect
import json
import math
import os
from pathlib import Path
import sys
import wave

MODEL = 'IndexTeam/IndexTTS-2.5'
LANGUAGES = {'zh': 'ZH', 'chinese': 'ZH', 'en': 'EN', 'english': 'EN',
             'ja': 'JA', 'japanese': 'JA', 'es': 'ES', 'spanish': 'ES',
             'ar': 'AR', 'arabic': 'AR'}


def forbid_network(event, args):
    if event in ('socket.connect', 'socket.connect_ex', 'socket.getaddrinfo'):
        raise RuntimeError('IndexTTS worker is offline; install missing resources separately')


def absolute(value, label):
    if not isinstance(value, str) or not os.path.isabs(value):
        raise ValueError(label + ' must be an absolute path')
    return Path(value).absolute()


def request_parameters(request):
    language = LANGUAGES.get(str(request.get('language', '')).lower())
    if not language:
        raise ValueError('IndexTTS 2.5 supports ZH, EN, JA, ES and AR only')
    if not isinstance(request.get('text'), str) or not request['text'].strip():
        raise ValueError('Text must not be empty')
    if request.get('instruction'):
        raise ValueError('This adapter uses emotion vectors, not text instructions')
    vector = request.get('emotion_vector')
    if vector is not None and (not isinstance(vector, list) or len(vector) != 8 or any(
            isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
            or not 0 <= v <= 1 for v in vector)):
        raise ValueError('Emotion vector must contain 8 finite values between 0 and 1')
    if vector is not None and sum(vector) > 1 + 1e-6:
        raise ValueError('情绪配比总和不能超过 100%，请降低部分情绪')
    intensity = request.get('emotion_intensity', 1)
    if isinstance(intensity, bool) or not isinstance(intensity, (int, float)) or not math.isfinite(intensity) or not 0 <= intensity <= 1:
        raise ValueError('Emotion intensity must be between 0 and 1')
    reference = absolute(request.get('reference_path'), 'Reference audio')
    output = absolute(request.get('output_path'), 'Output audio')
    if reference.resolve() == output.resolve():
        raise ValueError('Output must not overwrite the reference audio')
    if not reference.is_file():
        raise ValueError('Reference audio is missing')
    # infer_v2_5 scales vectors by emo_alpha itself. Do not multiply twice.
    return dict(spk_audio_prompt=str(reference), text=request['text'], lang=language,
                output_path=str(output), emo_vector=vector, emo_alpha=float(intensity),
                use_emo_text=False, use_random=False, verbose=False)


def model_files(request):
    from omegaconf import OmegaConf
    root = absolute(request.get('model_path'), 'Model directory')
    repo = absolute(request.get('repo_path'), 'Source directory')
    cfg = OmegaConf.load(root / 'config.yaml')
    if str(cfg.get('version', '')) != '2.5' or cfg.gpt.number_text_tokens != 60509:
        raise ValueError('Expected IndexTTS 2.5 checkpoints, not IndexTTS 2/1.5')
    names = ['config.yaml', 'codec.pth', 'multilingual_zh_ja_yue_char_del.tiktoken',
             'hf_cache/campplus_cn_common.bin', 'hf_cache/bigvgan/config.json',
             'hf_cache/bigvgan/bigvgan_generator.pt', 'hf_cache/w2v-bert-2.0/config.json',
             'hf_cache/w2v-bert-2.0/preprocessor_config.json']
    names += [str(cfg[key]) for key in ('gpt_checkpoint', 's2mel_checkpoint', 'w2v_stat', 'emo_matrix', 'spk_matrix')]
    w2v = root / 'hf_cache/w2v-bert-2.0'
    weights = next((name for name in ('model.safetensors', 'pytorch_model.bin') if (w2v / name).is_file()), None)
    if weights is None:
        raise ValueError('Missing offline w2v-bert-2.0 weights in model_dir/hf_cache; no download was started')
    names.append('hf_cache/w2v-bert-2.0/' + weights)
    files = []
    for area, base, name in [('repo', repo, 'indextts/infer_v2_5.py')] + [('model', root, name) for name in dict.fromkeys(names)]:
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('Checkpoint files must stay within the model directory')
        file = base / relative
        if not file.is_file() or file.stat().st_size == 0:
            raise ValueError('Missing offline IndexTTS resource: ' + name)
        # Reject Git LFS pointers and obvious placeholder weights.
        if relative.name in ('gpt.pth', 'codec.pth', 's2mel.pth', 'model.safetensors', 'pytorch_model.bin', 'campplus_cn_common.bin', 'bigvgan_generator.pt') and file.stat().st_size < 1024 * 1024:
            raise ValueError('Incomplete IndexTTS weights: ' + name)
        stat = file.stat()
        files.append(dict(root=area, path=relative.as_posix(), size=stat.st_size, mtime_ms=stat.st_mtime_ns / 1000000))
    return files


def load_model_class(request):
    repo = absolute(request.get('repo_path'), 'Source directory')
    sys.path.insert(0, str(repo))
    import torch
    device = request.get('device', 'cpu')
    if device not in ('cpu', 'mps', 'cuda:0'):
        raise ValueError('Unsupported device')
    if device == 'cuda:0' and not torch.cuda.is_available():
        raise ValueError('CUDA is unavailable in this environment')
    if device == 'mps' and not torch.backends.mps.is_available():
        raise ValueError('MPS is unavailable in this environment')
    from indextts.infer_v2_5 import IndexTTS2
    source = Path(inspect.getfile(IndexTTS2)).resolve()
    if source != (repo / 'indextts/infer_v2_5.py').resolve():
        raise ValueError('IndexTTS was imported from a different source directory')
    params = inspect.signature(IndexTTS2.infer).parameters
    if not {'spk_audio_prompt', 'text', 'lang', 'output_path', 'emo_vector', 'emo_alpha'} <= set(params):
        raise ValueError('Unsupported IndexTTS 2.5 inference API')
    # Upstream otherwise downloads auxiliary weights at construction time.
    import indextts.utils.model_download as downloader
    def no_download(model_dir, *args, **kwargs):
        if Path(model_dir).resolve() != Path(request['model_path']).resolve():
            raise RuntimeError('Unexpected auxiliary model directory')
        model_files(request)
        root = Path(request['model_path']) / 'hf_cache'
        return {'w2v_bert': str(root / 'w2v-bert-2.0'),
                'campplus': str(root / 'campplus_cn_common.bin'),
                'bigvgan': str(root / 'bigvgan')}
    downloader.ensure_models_available = no_download
    return IndexTTS2


def synthesize(request, model_class):
    import torch
    params = request_parameters(request)
    model_path = str(absolute(request.get('model_path'), 'Model directory'))
    device = request.get('device', 'cpu')
    if device == 'mps':
        # The upstream CUDA low-VRAM path does not cover Apple unified memory.
        # Bound allocation before loading weights; never disable MPS's safety limit.
        recommended = torch.mps.recommended_max_memory()
        budget = min(12 * 1024 ** 3, recommended // 2)
        if budget <= 0:
            raise ValueError('MPS 无法获取可用内存预算')
        torch.mps.set_per_process_memory_fraction(float(budget / recommended))
        params.update(max_text_tokens_per_segment=40, num_beams=1)
    # Upstream's inner no_grad blocks omit reference conditioning. Cover the
    # entire request so cached speaker/style tensors cannot retain training graphs.
    with torch.inference_mode():
        model = model_class(cfg_path=os.path.join(model_path, 'config.yaml'), model_dir=model_path,
                            device=device, use_bf16=False, use_cuda_kernel=False,
                            use_deepspeed=False, use_qwen_emo=False)
        model.infer(**params)
    with wave.open(params['output_path'], 'rb') as audio:
        if audio.getnframes() <= 0 or audio.getnchannels() != 1 or audio.getsampwidth() != 2:
            raise ValueError('IndexTTS returned an invalid mono PCM WAV')
        return dict(ok=True, sample_rate=audio.getframerate(), frames=audio.getnframes())


def main():
    os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1')
    sys.addaudithook(forbid_network)
    request = json.load(sys.stdin)
    with contextlib.redirect_stdout(sys.stderr):
        files = model_files(request)
        model_class = load_model_class(request)
        if '--check' in sys.argv:
            digest = hashlib.sha256()
            for item in files:
                root = request['repo_path'] if item['root'] == 'repo' else request['model_path']
                digest.update((item['root'] + '/' + item['path'] + '\0').encode())
                with open(Path(root) / item['path'], 'rb') as source:
                    for chunk in iter(lambda: source.read(1024 * 1024), b''):
                        digest.update(chunk)
            result = dict(ok=True, model_id=MODEL, files=files, fingerprint=digest.hexdigest(), synthesis_verified=False)
        else:
            result = synthesize(request, model_class)
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps(dict(ok=False, error=str(exc)[:1500])))
        sys.exit(1)
