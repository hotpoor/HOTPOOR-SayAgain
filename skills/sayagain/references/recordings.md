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
