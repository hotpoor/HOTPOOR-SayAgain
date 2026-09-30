"""Offline SeamlessM4T v2 speech translation. JSON stdin/stdout."""
import contextlib
import json
import os
import sys
import time

os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', HF_HUB_DISABLE_PROGRESS_BARS='1')

def main():
    request = json.load(sys.stdin)
    with contextlib.redirect_stdout(sys.stderr):
        import numpy as np
        import soundfile as sf
        import soxr
        import torch
        from transformers import AutoProcessor, SeamlessM4Tv2Model
        torch.set_num_threads(8)
        torch.manual_seed(42)
        if not torch.cuda.is_available():
            raise RuntimeError('Seamless 实验需要已验证的 CUDA 环境')
        audio, rate = sf.read(request['source_path'], dtype='float32')
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        if not 1 <= len(audio)/rate <= 30 or not np.isfinite(audio).all():
            raise ValueError('Seamless 实验仅接受 1–30 秒有效录音')
        if rate != 16000:
            audio = soxr.resample(audio, rate, 16000)
        started = time.perf_counter()
        processor = AutoProcessor.from_pretrained(request['model_path'], local_files_only=True, trust_remote_code=False)
        model = SeamlessM4Tv2Model.from_pretrained(request['model_path'], local_files_only=True,
                                                  trust_remote_code=False, dtype=torch.float16).to('cuda').eval()
        torch.cuda.synchronize()
        load_seconds = time.perf_counter() - started
        inputs = processor(audio=audio, sampling_rate=16000, return_tensors='pt').to('cuda')
        inputs = {key: value.to(torch.float16) if value.is_floating_point() else value for key, value in inputs.items()}
        torch.cuda.reset_peak_memory_stats()
        torch.cuda.synchronize()
        started = time.perf_counter()
        with torch.inference_mode():
            result = model.generate(**inputs, tgt_lang=request['target_language'], generate_speech=True,
                                    return_intermediate_token_ids=True, text_num_beams=4, text_max_new_tokens=256)
        torch.cuda.synchronize()
        inference_seconds = time.perf_counter() - started
        translated_text = processor.batch_decode(result.sequences, skip_special_tokens=True)[0]
        length = int(result.waveform_lengths.reshape(-1)[0].item())
        samples = result.waveform[0, :length].float().cpu().numpy().squeeze()
        if not samples.size or not np.isfinite(samples).all() or np.max(np.abs(samples)) == 0:
            raise RuntimeError('Seamless 没有生成有效音频')
        sf.write(request['output_path'], samples, model.config.sampling_rate, subtype='PCM_16')
        reply = {'ok': True, 'translated_text': translated_text, 'load_seconds': load_seconds,
                 'inference_seconds': inference_seconds, 'peak_cuda_bytes': torch.cuda.max_memory_allocated(),
                 'sample_rate': model.config.sampling_rate, 'dtype': 'float16'}
    print(json.dumps(reply, ensure_ascii=False))

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'ok': False, 'error': str(exc)[:1500]}, ensure_ascii=False))
        sys.exit(1)
