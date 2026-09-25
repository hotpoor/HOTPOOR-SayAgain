# Versioned Release model downloads

Release: [SayAgain v0.2.1](https://github.com/hotpoor/HOTPOOR-SayAgain/releases/tag/v0.2.1). This is a source/portable-Skill and model distribution release, not a packaged desktop installer.

The bundled [manifest](../assets/model-manifest.json) pins sources, file sizes, SHA256 hashes, extracted paths and download URLs. Weights are Release attachments, not Git source objects. Archives contain upstream attribution/license text and PROVENANCE.txt. No Python environments, FFmpeg binaries, user recordings, personal voice references or runtime.json are distributed.

| Model ID | Archive size | Attachment count |
|---|---:|---:|
| `sensevoice-2025` | 226.4 MiB | 1 |
| `sensevoice-patchnote` | 228.5 MiB | 1 |
| `campplus` | 27.0 MiB | 1 |
| `fsmn-vad` | 2.2 MiB | 1 |
| `silero-vad` | 0.6 MiB | 1 |
| `zipformer-kws` | 37.1 MiB | 1 |
| `qwen3-tts-0.6b-base` | 2399.6 MiB | 3 |
| `qwen3-tts-1.7b-base` | 4333.7 MiB | 5 |

## Select and download

Use Python 3.10+; the downloader uses only the standard library. Reuse valid existing models first. Select models according to the user's chosen features and TTS size; do not download everything merely because it is listed.

```sh
python <skill>/scripts/download-release-models.py --list
python <skill>/scripts/download-release-models.py --model sensevoice-patchnote --models-dir /absolute/new-models
python <skill>/scripts/download-release-models.py --model fsmn-vad --model campplus --model zipformer-kws --models-dir /absolute/new-models
python <skill>/scripts/download-release-models.py --model qwen3-tts-1.7b-base --models-dir /absolute/new-models
```

The helper checks free space, validates cached downloads, resumes partial HTTP downloads when supported, joins ordered Qwen parts, verifies the complete ZIP, rejects unsafe archive paths and verifies every extracted file before exposing the directory. Qwen `.zip.part001`, `.part002`, etc. are byte slices, not independently extractable ZIPs. All parts are required. No dependencies are installed and application configuration is unchanged. `--cache-dir` selects another cache; `--offline` uses verified cached assets only. Existing conflicting models or failed checksums stop installation; inspect before retrying and never overwrite a working model. Remove a stale `.sayagain-download.lock` only after confirming no download process uses the cache; interrupted `.assembling` files also need inspection before retrying.

## Model selection

- `sensevoice-2025`: previously registered Windows export, named 2025-09-09 upstream. English comparison output was uppercase without punctuation.
- `sensevoice-patchnote`: user-provided Mac model from PatchxNote patchnote-standard 0.2.0. Same Windows sample produced normal casing/punctuation. Exact upstream date/training revision is unknown; package version is not a SenseVoice version. Preserve both models; switching the application's selected model requires the user's choice.
- `fsmn-vad`: current legacy recording segmentation; config.yaml and am.mvn adapt original export filenames/config, weights unchanged.
- `silero-vad`: alternative supported by the speaker pipeline. Included and checksum-verified, not newly inference-tested on every platform.
- `campplus`: candidate speaker embeddings, not identity recognition.
- `zipformer-kws`: optional keyword spotting.
- Qwen Base 0.6B/1.7B are alternatives. Choose the requested size; CPU/GPU uses the same weights with separately compatible runtimes. CustomVoice is not supported by SayAgain voice cloning and is not bundled. Packaging weights is not a new synthesis verification.

## Register only when authorized

Reuse the actual compatible Python and verified FFmpeg. For the minimal speaker pipeline:

```sh
<python> <skill>/scripts/register-recording-models.py --user-dir <actual-user-data> --sensevoice <models>/sensevoice-patchnote --campplus <models>/campplus/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx --silero <models>/silero-vad/silero_vad.onnx --ffmpeg <absolute-ffmpeg>
```

For FSMN/Zipformer, back up the actual runtime, update only explicitly selected model paths and retain unrelated registrations. Clear verification only for changed entries. Never copy another machine's runtime.json. Complete [import preflight](recordings.md#import-preflight-and-winerror-2) and actual inference before marking ready.

For TTS, install pinned requirements in a separate environment only if needed; reuse working environments. Then register:

```sh
node <skill>/scripts/register-local-tts.cjs --python <absolute-python> --model-path <models>/qwen3-tts-1.7b-base --device <cpu|cuda:0|mps>
```

Registration backs up runtime but does not prove synthesis quality. Test with user-authorized reference audio/text locally. Download, registration, actual inference and app integration are separate states. Keep current configuration unchanged for download/comparison-only requests.
