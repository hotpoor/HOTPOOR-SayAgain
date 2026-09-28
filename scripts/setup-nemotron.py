"""Download a pinned NVIDIA model and register an already isolated Python runtime.

Run this script with the Python environment containing torch, transformers,
sherpa-onnx and soundfile. Existing recording model settings are preserved.
"""
import argparse
import datetime
import json
import os
import pathlib
import shutil
import sys

REPO = 'nvidia/Nemotron-3-Diarization'
REVISION = 'f667ed73aee57d40cc39428eb768b4fd87a0a29e'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--user-dir', required=True)
    parser.add_argument('--model-dir', required=True)
    parser.add_argument('--device', choices=['cpu', 'cuda'], default='cuda')
    args = parser.parse_args()
    import torch, transformers, sherpa_onnx, soundfile, librosa
    from huggingface_hub import snapshot_download
    if not hasattr(transformers, 'Nemotron3DiarizationModel'):
        raise RuntimeError('Install current Transformers with Nemotron3Diarization support')
    if args.device == 'cuda' and not torch.cuda.is_available():
        raise RuntimeError('CUDA unavailable in selected Python environment')
    runtime_path = pathlib.Path(args.user_dir)/'recording-models/runtime.json'
    if not runtime_path.exists(): raise RuntimeError('Register the existing SenseVoice runtime first')
    directory = pathlib.Path(args.model_dir).resolve()
    snapshot_download(REPO, revision=REVISION, local_dir=str(directory),
        allow_patterns=['config.json', 'processor_config.json', 'model.safetensors', 'README.md'], max_workers=2)
    runtime = json.loads(runtime_path.read_text(encoding='utf-8-sig'))
    stamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    runtime.setdefault('models', {})['nemotron'] = dict(path=str(directory), python=sys.executable,
        device=args.device, downloaded=True, verified=False, source=REPO, revision=REVISION,
        installed_at=stamp, verification='Downloaded; actual inference verification pending')
    backup = runtime_path.with_name('runtime.before-nemotron-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.json')
    shutil.copy2(runtime_path, backup)
    temporary = runtime_path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(runtime, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(temporary, runtime_path)
    print('NVIDIA model registered; inference still needs verification.')


if __name__ == '__main__': main()
