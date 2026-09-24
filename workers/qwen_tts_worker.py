"""One local synthesis per process. JSON stdin/stdout; no remote model fallback."""
import contextlib
import json
import os
import sys

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'

def main():
    request = json.load(sys.stdin)
    with contextlib.redirect_stdout(sys.stderr):
        import numpy as np
        import soundfile as sf
        import torch
        from qwen_tts import Qwen3TTSModel
        device = request.get('device', 'cpu')
        if device not in ('cpu', 'mps', 'cuda:0'):
            raise ValueError('Unsupported device')
        # CPU is the portable default; accelerate backends are explicitly selected.
        dtype = torch.float32 if device in ('cpu', 'mps') else torch.bfloat16
        model = Qwen3TTSModel.from_pretrained(request['model_path'], device_map=device,
                                             dtype=dtype, attn_implementation='sdpa' if device.startswith('cuda') else 'eager', local_files_only=True)
        ref_audio, sr = sf.read(request['reference_path'], dtype='float32')
        if ref_audio.ndim > 1:
            ref_audio = ref_audio.mean(axis=1)
        transcript = request.get('reference_text', '').strip()
        wavs, sample_rate = model.generate_voice_clone(
            text=request['text'], language=request['language'], ref_audio=(ref_audio, sr),
            ref_text=transcript or None, x_vector_only_mode=not bool(transcript),
            non_streaming_mode=True, max_new_tokens=2048,
        )
        samples = np.asarray(wavs[0])
        if not samples.size or not np.isfinite(samples).all():
            raise ValueError('Model returned invalid audio')
        sf.write(request['output_path'], samples, sample_rate, subtype='PCM_16')
    print(json.dumps({'ok': True, 'sample_rate': sample_rate}))

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'ok': False, 'error': str(exc)[:1500]}))
        sys.exit(1)
