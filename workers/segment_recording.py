"""Decode to a disk-backed stream; preserve online VAD state across read blocks."""
import contextlib, json, pathlib, subprocess, sys, tempfile, wave

def main():
    request = json.load(sys.stdin)
    output = sys.stdout
    def emit(value):
        print(json.dumps(value, ensure_ascii=False), file=output, flush=True)
    with contextlib.redirect_stdout(sys.stderr):
        import numpy as np
        from funasr_onnx.vad_bin import Fsmn_vad_online
        folder = pathlib.Path(request['output'])
        pcm_path = folder / 'decoded.pcm'
        with pcm_path.open('wb') as pcm:
            for i, source in enumerate(request['inputs']):
                emit({'type': 'progress', 'stage': 'decoding', 'completed': i, 'total': len(request['inputs'])})
                with tempfile.TemporaryFile() as log:
                    child = subprocess.Popen([request['ffmpeg'], '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', source,
                        '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1'], stdout=subprocess.PIPE, stderr=log)
                    try:
                        while True:
                            block = child.stdout.read(32000 * 10)
                            if not block: break
                            pcm.write(block)
                            emit({'type': 'progress', 'stage': 'decoding', 'processedMs': pcm.tell() / 32})
                        if child.wait() != 0: raise ValueError('音频解码失败，请确认文件完整且包含音轨')
                    finally:
                        if child.poll() is None: child.kill()
                        child.wait()
        count = pcm_path.stat().st_size // 2
        if not count: raise ValueError('文件中没有音频数据')
        vad = Fsmn_vad_online(request['model'], quantize=True, max_end_sil=600)
        # A maximum is only a fallback for uninterrupted speech, not a read boundary.
        vad.config['model_conf']['max_single_segment_time'] = 60000
        params = {}; spans = []; pending = None; read_frames = 0
        with pcm_path.open('rb') as pcm:
            while True:
                block = pcm.read(6400)  # 200 ms, not an output clip boundary.
                if not block: break
                audio = np.frombuffer(block, dtype='<i2').astype(np.float32) / 32768
                read_frames += len(audio)
                params['is_final'] = read_frames >= count
                # The frontend needs enough frames for very short final inputs.
                if len(audio) < 800: audio = np.pad(audio, (0, 800-len(audio)))
                found = vad(audio, param_dict=params)
                if found and isinstance(found[0], list) and (not found[0] or isinstance(found[0][0], list)): found = found[0]
                for start, end in found:
                    if start >= 0: pending = start
                    if end >= 0 and pending is not None:
                        spans.append((pending, min(end, count/16))); pending = None
                if read_frames % 16000 == 0 or read_frames >= count:
                    emit({'type': 'progress', 'stage': 'vad', 'processedMs': read_frames/16, 'durationMs': count/16})
        if pending is not None: spans.append((pending, count/16))
        clips = []
        with pcm_path.open('rb') as pcm:
            for start, end in spans:
                # Retain a little context and overlap around any maximum-length cut.
                first = max(0, int((start-200)*16)); last = min(count, int((end+100)*16))
                if last <= first: continue
                pcm.seek(first*2); data = pcm.read((last-first)*2)
                filename = folder / ('clip_%06d.wav' % len(clips))
                with wave.open(str(filename), 'wb') as wav:
                    wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(16000); wav.writeframes(data)
                clips.append({'file': filename.name, 'start_ms': first/16, 'end_ms': last/16})
        (folder/'manifest.json').write_text(json.dumps({'clips': clips, 'duration_ms': count/16}), encoding='utf-8')
        emit({'type': 'done'})
if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False), flush=True)
        sys.exit(1)
