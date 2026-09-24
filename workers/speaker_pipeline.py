"""Local-only speaker clips pipeline. JSON stdin/stdout; progress JSON on stderr.
CLI: python speaker_pipeline.py --request request.json
Model paths come exclusively from the supplied runtime manifest.
"""
import argparse
import contextlib
import hashlib
import json
import math
import pathlib
import subprocess
import sys
import time

VERSION = 'speaker-clips-v1'
MAX_SECONDS = 14400


def progress(stage, done=0, total=0):
    print(json.dumps({'stage': stage, 'done': done, 'total': total}), file=sys.stderr, flush=True)


def options(value):
    value = value or {}
    language = value.get('language', 'auto')
    if language not in ['auto', 'en', 'zh', 'ja', 'ko', 'yue']:
        raise ValueError('Unsupported recognition language')
    count = value.get('speaker_count', 0)
    if isinstance(count, bool) or not isinstance(count, int) or not 0 <= count <= 8:
        raise ValueError('speaker_count must be 0 (auto) or 1–8')
    return {'language': language, 'speaker_count': count, 'max_clip_seconds': 18,
            'window_seconds': 3, 'hop_seconds': 1.5, 'review_similarity': .60}


def cluster(embeddings, windows, count=0):
    """Estimate count on stable windows; never let singleton outliers define a speaker."""
    import numpy as np
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score
    stable = np.flatnonzero(windows[:, 1] - windows[:, 0] >= 1.5)
    if not len(stable):
        return np.full(len(embeddings), -1), np.zeros(len(embeddings)), {'speakers': 0, 'reason': 'insufficient_speech'}
    sample = stable[np.linspace(0, len(stable)-1, min(1200, len(stable)), dtype=int)]
    data = embeddings[sample]
    scores = {}
    if count == 0:
        for k in range(2, min(6, len(data)-1)+1):
            model = KMeans(n_clusters=k, n_init=10, random_state=42).fit(data)
            sizes = np.bincount(model.labels_)
            if len(sizes) != k or min(sizes) < max(2, len(data)*.015):
                continue
            scores[k] = float(silhouette_score(data, model.labels_, metric='cosine'))
        best = max(scores, key=scores.get) if scores else 1
        count = best if scores.get(best, 0) >= .25 else 1
    if count > len(stable):
        raise ValueError('Not enough speech windows for requested speaker count')
    centers = KMeans(n_clusters=count, n_init=10, random_state=42).fit(embeddings[stable]).cluster_centers_
    centers /= np.maximum(np.linalg.norm(centers, axis=1)[:, None], 1e-9)
    similarities = embeddings @ centers.T
    labels = similarities.argmax(axis=1)
    # Remove isolated one-window flips, but do not smooth across VAD/source boundaries.
    original = labels.copy()
    for i in range(1, len(labels)-1):
        if windows[i-1, 2] == windows[i, 2] == windows[i+1, 2] and original[i-1] == original[i+1]:
            labels[i] = original[i-1]
    order = sorted(set(labels.tolist()), key=lambda k: int(np.flatnonzero(labels == k)[0]))
    mapping = {k: i for i, k in enumerate(order)}
    confidence = similarities[np.arange(len(labels)), labels]
    return np.array([mapping[k] for k in labels]), confidence, {'speakers': len(order), 'candidate_scores': scores, 'selected_speakers': count}


def split_turn(audio, start, end, max_seconds=18):
    import numpy as np
    result = []
    while end-start > max_seconds:
        candidates = np.arange(start+8, min(start+16, end-3), .05)
        energies = [np.mean(audio[max(0, int((t-.08)*16000)):int((t+.08)*16000)]**2) for t in candidates]
        cut = float(candidates[int(np.argmin(energies))])
        result.append((start, cut)); start = cut
    if end > start:
        result.append((start, end))
    return result


def run(request):
    import numpy as np
    import soundfile as sf
    import sherpa_onnx as sh
    config = options(request.get('options'))
    models = request['models']; out = pathlib.Path(request['output_dir']).resolve()
    out.mkdir(parents=True, exist_ok=True)
    if any(out.iterdir()):
        raise ValueError('Output directory must be empty')
    sources = request['sources']
    if not isinstance(sources, list) or not 1 <= len(sources) <= 2000:
        raise ValueError('Expected 1–2000 sources')
    required = ['campplus', 'sensevoice']
    for key in required:
        if not pathlib.Path(models[key]['path']).exists():
            raise ValueError('Missing model: '+key)
    if 'silero' in models:
        vad_config = sh.VadModelConfig(); vad_config.silero_vad.model = models['silero']['path']
        vad_config.silero_vad.min_silence_duration = .35
        vad_config.silero_vad.min_speech_duration = .25
        vad_config.silero_vad.max_speech_duration = 30
        vad_config.sample_rate = 16000
        def detect(audio):
            detector = sh.VoiceActivityDetector(vad_config, buffer_size_in_seconds=60)
            spans = []
            for i in range(0, len(audio), 512):
                detector.accept_waveform(audio[i:i+512])
                while not detector.empty():
                    item = detector.front; spans.append((item.start/16000, (item.start+len(item.samples))/16000)); detector.pop()
            detector.flush()
            while not detector.empty():
                item = detector.front; spans.append((item.start/16000, (item.start+len(item.samples))/16000)); detector.pop()
            return spans
        vad_name = 'silero'
    else:
        from funasr_onnx import Fsmn_vad
        def detect(audio):
            spans = Fsmn_vad(models['fsmn']['path'], quantize=True)(audio)
            if len(spans) == 1 and isinstance(spans[0], list) and (not spans[0] or isinstance(spans[0][0], list)):
                spans = spans[0]
            return [(a/1000, b/1000) for a, b in spans if b > a]
        vad_name = 'fsmn'
    extractor = sh.SpeakerEmbeddingExtractor(sh.SpeakerEmbeddingExtractorConfig(model=models['campplus']['path'], num_threads=2, provider='cpu'))
    regions = []; windows = []; embeddings = []; decoded = []; duration = 0
    for si, source in enumerate(sources):
        progress('decode', si, len(sources))
        target = out/f'input-{si:04d}.wav'
        remaining = MAX_SECONDS-duration
        if remaining <= 0:
            raise ValueError('Total audio exceeds four hours')
        subprocess.run([request.get('ffmpeg') or 'ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', source['audio'], '-t', str(remaining+1), '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', str(target)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=600)
        audio, rate = sf.read(target, dtype='float32')
        duration += len(audio)/rate
        if duration > MAX_SECONDS:
            raise ValueError('Total audio exceeds four hours')
        decoded.append(target)
        spans = detect(audio)
        progress('voiceprints', si, len(sources))
        for span_index, (a, b) in enumerate(spans):
            if span_index % 50 == 0: progress('voiceprints', span_index, len(spans))
            a=max(0.,a); b=min(len(audio)/16000,b)
            if b<=a: continue
            ri = len(regions); regions.append((si,a,b))
            if b-a < .65: continue
            n = max(1, int(math.ceil((b-a-3)/1.5))+1)
            for t in np.linspace(a, max(a,b-3), n):
                stop = min(b,t+3); stream = extractor.create_stream()
                stream.accept_waveform(16000, audio[int(t*16000):int(stop*16000)]); stream.input_finished()
                if extractor.is_ready(stream):
                    e = np.asarray(extractor.compute(stream)); norm = np.linalg.norm(e)
                    if not np.isfinite(e).all() or norm < 1e-9: continue
                    embeddings.append(e/norm); windows.append((t,stop,ri))
        progress('voiceprints', si+1, len(sources))
    if not regions: raise ValueError('No speech found')
    if not embeddings: raise ValueError('Speech is too short for speaker grouping')
    progress('cluster')
    windows = np.array(windows); embeddings = np.array(embeddings)
    labels, similarity, stats = cluster(embeddings, windows, config['speaker_count'])
    turns = []
    for ri,(si,a,b) in enumerate(regions):
        ids = np.flatnonzero(windows[:,2] == ri)
        if not len(ids):
            # Preserve tiny utterances as uncertain instead of borrowing another file's identity.
            candidates = [(a,b,-1,0.)]
        else:
            mid = windows[ids,:2].mean(axis=1)
            edges = [a]+[(mid[j-1]+mid[j])/2 for j in range(1,len(ids))]+[b]
            candidates = [(max(a,edges[j]),min(b,edges[j+1]),int(labels[idx]),float(similarity[idx])) for j,idx in enumerate(ids)]
        for aa,bb,label,sim in candidates:
            if bb<=aa:continue
            if turns and turns[-1]['source']==si and turns[-1]['label']==label and aa-turns[-1]['end']<.65:
                turns[-1]['end']=bb;turns[-1]['similarities'].append(sim)
            else:
                turns.append({'source':si,'start':aa,'end':bb,'label':label,'similarities':[sim]})
    recognizer=None
    if request.get('transcribe',True):
        recognizer_path=pathlib.Path(models['sensevoice']['path'])
        model=next(recognizer_path.glob('*int8.onnx'))
        recognizer=sh.OfflineRecognizer.from_sense_voice(model=str(model),tokens=str(recognizer_path/'tokens.txt'),language=config['language'],use_itn=True,num_threads=4)
    clips=[]; current=None; audio=None
    for ti,turn in enumerate(turns):
        if current!=turn['source']:
            current=turn['source'];audio,_=sf.read(decoded[current],dtype='float32')
        for a,b in split_turn(audio,turn['start'],turn['end']):
            if len(clips)>=10000:raise ValueError('Too many short clips')
            start_ms=int(round(a*1000));end_ms=int(round(b*1000))
            samples=audio[start_ms*16:end_ms*16]
            if not len(samples):continue
            text=''
            if recognizer:
                stream=recognizer.create_stream();stream.accept_waveform(16000,samples);recognizer.decode_stream(stream);text=stream.result.text
            filename=f'{len(clips)+1:05d}.wav';sf.write(out/filename,samples,16000,subtype='PCM_16')
            sim=float(np.mean(turn['similarities']));speaker=None if turn['label']<0 else chr(65+turn['label'])
            clips.append({'file':filename,'source_index':current,'start_ms':start_ms,'end_ms':end_ms,'speaker':speaker,'similarity':sim,'review':speaker is None or sim<config['review_similarity'],'text':text})
        if ti%10==0:progress('transcribe',ti,len(turns))
    # Include fingerprints and versions for reproducibility, never audio/text in progress logs.
    hashes={}
    for key in ['campplus','sensevoice',vad_name]:
        root=pathlib.Path(models[key]['path'])
        files=[root] if root.is_file() else sorted(root.glob('*.onnx'))
        for f in files:
            h=hashlib.sha256()
            with f.open('rb') as stream:
                for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
            hashes[key+'/'+f.name]=h.hexdigest()
    import sklearn, platform
    result={'runtime_versions':{'python':platform.python_version(),'numpy':np.__version__,'scikit_learn':sklearn.__version__},'version':VERSION,'options':config,'vad':vad_name,'clustering':stats,'model_hashes':hashes,'sherpa_onnx_version':sh.__version__,'duration_ms':round(duration*1000),'clips':clips}
    (out/'manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    for f in decoded:f.unlink()
    progress('complete',len(clips),len(clips))
    return result


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--request');args=parser.parse_args()
    request=json.loads(pathlib.Path(args.request).read_text()) if args.request else json.load(sys.stdin)
    try:
        with contextlib.redirect_stdout(sys.stderr):result=run(request)
        print(json.dumps({'manifest':'manifest.json','clip_count':len(result['clips'])}))
    except Exception as error:
        print(json.dumps({'error':str(error)},ensure_ascii=False));sys.exit(1)

if __name__=='__main__':main()
