"""Local Nemotron diarization followed by the same SenseVoice transcription.

Uses the upstream streaming cache so long files do not require a full attention
matrix. Speaker IDs are scoped to one source, never treated as real identities.
"""
import contextlib
import hashlib
import json
import pathlib
import subprocess
import sys
import time

from speaker_pipeline import options, progress, split_turn


def timeline(segments, duration):
    """Sweep overlapping model turns into non-overlapping multi-speaker spans."""
    events = {}
    for item in segments:
        start = max(0, round(float(item['Start']) * 1000))
        end = min(round(duration * 1000), round(float(item['End']) * 1000))
        speaker = int(item['Speaker'])
        if not 0 <= speaker < 8 or end <= start:
            continue
        events.setdefault(start, []).append((speaker, 1))
        events.setdefault(end, []).append((speaker, -1))
    active = {}; spans = []; previous = 0
    for position in sorted(events):
        keys = sorted(k for k, count in active.items() if count > 0)
        if keys and position > previous:
            if spans and spans[-1][1] == previous and spans[-1][2] == keys:
                spans[-1] = (spans[-1][0], position, keys)
            else:
                spans.append((previous, position, keys))
        for key, change in events[position]:
            active[key] = active.get(key, 0) + change
        previous = position
    return spans


def streaming_inputs(processor, audio):
    rate = 16000
    if len(audio) <= processor.num_samples_first_audio_chunk:
        yield processor(audio, sampling_rate=rate, is_streaming=True,
                        is_first_audio_chunk=True, is_last_audio_chunk=True)
        return
    yield processor(audio[:processor.num_samples_first_audio_chunk], sampling_rate=rate,
                    is_streaming=True, is_first_audio_chunk=True)
    frame = processor.num_mel_frames_per_step
    start = processor.audio_chunk_start(frame)
    while start + processor.num_samples_per_audio_chunk < len(audio):
        yield processor(audio[start:start + processor.num_samples_per_audio_chunk],
                        sampling_rate=rate, is_streaming=True, is_first_audio_chunk=False)
        frame += processor.num_mel_frames_per_step
        start = processor.audio_chunk_start(frame)
    if start < len(audio):
        yield processor(audio[start:], sampling_rate=rate, is_streaming=True,
                        is_first_audio_chunk=False, is_last_audio_chunk=True)


def run(request):
    started = time.perf_counter()
    import torch
    import soundfile as sf
    import sherpa_onnx as sh
    import transformers
    from transformers import AutoProcessor, AutoModelForAudioFrameClassification
    config = options(request.get('options'))
    if config['speaker_count']:
        raise ValueError('NVIDIA 模式自动区分最多8人，请选择自动估计人数')
    sources = request['sources']
    if len(sources) != 1:
        raise ValueError('NVIDIA 对比模式每次处理一份完整音频，避免跨文件混用说话人编号')
    out = pathlib.Path(request['output_dir']).resolve()
    out.mkdir(parents=True, exist_ok=True)
    if any(out.iterdir()):
        raise ValueError('Output directory must be empty')
    descriptor = request['models']['nemotron']
    model_path = descriptor['path']
    device = descriptor.get('device', 'cuda' if torch.cuda.is_available() else 'cpu')
    if device == 'cuda' and not torch.cuda.is_available():
        raise ValueError('NVIDIA 模式已配置 CUDA，但当前运行环境不可用')
    torch.set_num_threads(4)
    if device == 'cuda': torch.cuda.reset_peak_memory_stats()
    progress('loading')
    processor = AutoProcessor.from_pretrained(model_path, local_files_only=True, trust_remote_code=False)
    model = AutoModelForAudioFrameClassification.from_pretrained(
        model_path, local_files_only=True, trust_remote_code=False,
        dtype=torch.float32).to(device).eval()
    processor.set_streaming_mode('low_latency')
    progress('decode')
    target = out/'input-0000.wav'
    parts = sources[0].get('audio_parts') or [sources[0]['audio']]
    with sf.SoundFile(target, mode='w', samplerate=16000, channels=1, subtype='PCM_16') as joined:
        for index, filename in enumerate(parts):
            remaining = 14400 - joined.tell()/16000
            if remaining <= 0: raise ValueError('一次最多处理4小时音频')
            part = out/f'part-{index}.wav'
            subprocess.run([request['ffmpeg'], '-nostdin', '-v', 'error', '-y', '-i', filename,
                            '-t', str(remaining+1), '-vn', '-ar', '16000', '-ac', '1',
                            '-c:a', 'pcm_s16le', str(part)], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=600)
            for block in sf.blocks(part, blocksize=65536, dtype='float32'): joined.write(block)
            part.unlink()
    audio, _ = sf.read(target, dtype='float32')
    duration = len(audio)/16000
    if duration > 14400: raise ValueError('一次最多处理4小时音频')
    if duration < .08: raise ValueError('音频过短，至少需要80毫秒')
    diar_started = time.perf_counter()
    cache = None; logits = []
    with torch.inference_mode():
        for index, inputs in enumerate(streaming_inputs(processor, audio)):
            outputs = model(**inputs.to(device, dtype=model.dtype), speaker_cache=cache)
            cache = outputs.speaker_cache
            logits.append(outputs.logits.cpu())
            if index % 20 == 0: progress('diarize', min(round(index*.72), round(duration)), round(duration))
    segments = processor.extract_speaker_dict(torch.cat(logits, dim=1))[0]
    spans = timeline(segments, duration)
    diar_seconds = time.perf_counter()-diar_started
    if not spans: raise ValueError('NVIDIA 模型未检测到语音')
    peak = torch.cuda.max_memory_allocated() if device == 'cuda' else None
    del model, cache, logits, outputs
    if device == 'cuda': torch.cuda.empty_cache()
    recognizer = None
    if request.get('transcribe', True):
        root = pathlib.Path(request['models']['sensevoice']['path'])
        recognizer = sh.OfflineRecognizer.from_sense_voice(model=str(next(root.glob('*int8.onnx'))),
            tokens=str(root/'tokens.txt'), language=config['language'], use_itn=True, num_threads=4)
    clips = []
    for index, (start, end, speakers) in enumerate(spans):
        for a, b in split_turn(audio, start/1000, end/1000):
            if len(clips) >= 10000: raise ValueError('Too many short clips')
            a, b = round(a*1000), round(b*1000)
            if b <= a: continue
            samples = audio[a*16:b*16]; text = ''
            if recognizer:
                stream = recognizer.create_stream(); stream.accept_waveform(16000, samples)
                recognizer.decode_stream(stream); text = stream.result.text
            filename = f'{len(clips)+1:05d}.wav'
            sf.write(out/filename, samples, 16000, subtype='PCM_16')
            keys = [chr(65+k) for k in speakers]
            clips.append(dict(file=filename, source_index=0, start_ms=a, end_ms=b,
                speaker=keys[0] if len(keys)==1 else None, speakers=keys,
                similarity=0., review=True, text=text))
        progress('transcribe', index+1, len(spans))
    hashes = {}
    for key in ['nemotron', 'sensevoice']:
        root = pathlib.Path(request['models'][key]['path'])
        files = sorted(root.glob('*.safetensors')) if key == 'nemotron' else sorted(root.glob('*.onnx'))
        for filename in files:
            digest = hashlib.sha256()
            with filename.open('rb') as handle:
                for block in iter(lambda: handle.read(1024*1024), b''): digest.update(block)
            hashes[key+'/'+filename.name] = digest.hexdigest()
    result = dict(version='speaker-clips-v1', engine='nemotron', options={**config, 'engine':'nemotron'},
        model_id='nvidia/Nemotron-3-Diarization', model_revision=descriptor.get('revision'),
        streaming_mode='low_latency', device=device, elapsed_seconds=time.perf_counter()-started,
        diarization_seconds=diar_seconds, peak_cuda_bytes=peak, model_hashes=hashes,
        runtime_versions={'torch':torch.__version__, 'transformers':transformers.__version__},
        duration_ms=round(duration*1000), clustering={'speakers':len({k for _,_,keys in spans for k in keys})},
        overlap_ms=sum(b-a for a,b,keys in spans if len(keys)>1), clips=clips)
    (out/'manifest.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    if len(parts)==1: target.unlink()
    return result


if __name__ == '__main__':
    try:
        request = json.load(sys.stdin)
        with contextlib.redirect_stdout(sys.stderr): result = run(request)
        print(json.dumps({'manifest':'manifest.json','clip_count':len(result['clips'])}))
    except Exception as error:
        print(json.dumps({'error':str(error)}, ensure_ascii=False)); sys.exit(1)
