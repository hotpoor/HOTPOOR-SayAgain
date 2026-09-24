# Local recordings setup

The desktop “我的录音” page supports microphone capture, multiple imported files, local playback and editable transcripts. A recording session has one block_id; each approximately 30-second clip has its own entity and audio asset. Imported audio is decoded and normalized to mono PCM WAV; the source file remains untouched. Imports are limited to 100 MB per file. Recording begins only after the user clicks and grants microphone access.

Use an isolated Python 3.10 environment. Install `scripts/recording-requirements.txt` with that environment's pip. Inspect disk space first (at least 2 GiB for model download/cache, additional space for Python dependencies and recordings). Run:

```
<python> <skill>/scripts/setup-recording-models.py --models-dir <absolute-model-directory> --user-dir <SayAgain-user-data-directory>
```

Use the actual client user-data directory; do not guess for packaged/custom installations. On the development Windows client it is `%APPDATA%/HOTPOOR SayAgain`. The script downloads exact official releases, checks available sizes/hashes, and creates `recording-models/runtime.json`. It adapts the official FSMN export's config names for funasr-onnx. Downloading marks models as registered, not verified. Existing Qwen3-TTS installation remains separate and reusable; do not download it again for recording/transcription.

Confirm state in the running client using “刷新模型状态”. Import an authorized speech recording into a test session and run “本地转写”; check nonempty text, timestamps and persistence. A successful FSMN/SenseVoice inference may mark those descriptors `verified: true`, with a verification timestamp and test description. Do not mark success just because a model loads. Use isolated test data where possible.

CAMPPlus supports experimental session-scoped speaker candidate grouping using VAD and 3-second embedding windows (cosine threshold 0.65, not calibrated for all users). Sub-second speech is marked uncertain; overlapping speakers are not separated. Zipformer supports up to 20 custom Chinese/English phrases and reports detections without precise hit times. Unknown lexicon words fail explicitly. Both run only on manual clicks, up to 100 clips per analysis; no background listening. Verify their individual inference separately before marking their descriptors verified; report that separately from product integration. Keep recordings local, and do not silently switch to cloud if local inference fails. Machine transcripts must be reviewed; do not send uncertain recognized speech directly to expression correction as if user-confirmed.

Re-running setup resets verification; repeat the actual inference checks. Do not use this workflow to install global hooks or start recording automatically.


## Speaker clips pipeline

The “分人语音条” section creates a separate result session with per-clip audio, original-source timestamps, speaker labels and machine transcripts. Long-file import uses native FFmpeg decoding (2 GiB / 4 hours maximum); processing an existing session preserves original clips and user-edited transcripts. The UI provides language, optional speaker count, progress and cancellation. Never silently upload audio or install dependencies from opening settings.

For the minimal Silero pipeline, use an isolated Python 3.10–3.12 environment and `scripts/speaker-pipeline-requirements.txt`, plus an installed FFmpeg executable. Reuse valid existing models with `scripts/register-recording-models.py --user-dir <actual-user-data-dir> --sensevoice <model-directory> --campplus <onnx-file> --silero <onnx-file> --ffmpeg <executable>`. The helper backs up the existing runtime and records registrations as unverified. The full installer now also downloads Silero; FSMN remains supported as a fallback when Silero is not registered.

Inspect disk space first. Test an authorized recording via the actual worker/app before marking a model verified. A/B labels are session-local candidate groups, never confirmed identities. Sub-second speech may remain unknown; low cosine similarity flags review, not calibrated correctness. Do not automatically submit machine text for expression review or repurpose voiceprints for voice cloning.
