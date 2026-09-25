# Local recordings setup

## Current workflow (2026-09-25)

The desktop “我的音频” page uses the “分人语音条” pipeline for file imports and microphone recordings. Recording starts only after the user clicks and grants microphone access. Microphone audio is saved approximately every 30 seconds; after stopping, consecutive blocks from the same recording are joined before analysis. Checkpoint boundaries are not speech boundaries.

The pipeline is: file import / stopped recording → FFmpeg 16 kHz mono PCM → VAD → CAMPPlus embeddings → batch KMeans speaker clustering and smoothing → short clips → automatic SenseVoice INT8 transcription → manual review, playback and export. Silero is preferred; FSMN is a fallback when Silero is not registered. Embedding windows are 3 seconds with approximately 1.5-second hops. Stable windows establish speaker centers; shorter windows are assigned afterward. Clips over 18 seconds are split at a low-energy position between 8 and 16 seconds.

Transcription does not require prior speaker confirmation. Candidate labels are not confirmed identities; do not confirm them on the user's behalf. Corrected time intervals must be saved before retranscription, which uses the saved intervals and preserves speaker attribution. Machine text remains unreviewed; manual corrections take precedence and must not be overwritten by batch retry. Translation is separate and deferred.

List-level import creates a session. Adding files or recordings within a session appends a new audio group to that same session. Original materials are retained; successful processing archives source checkpoint clips while preserving their assets and notes. Each result has playable audio, source-relative timestamps and candidate speakers. New tasks use independent labels and do not automatically match stored voiceprints or inherit existing people's details. The native file import limit is 2 GiB; total duration per task is at most 4 hours. The UI provides language, optional speaker count, progress and cancellation. Failed or canceled pending recordings can be retried.

The old ordinary import, pause-based resegmentation and standalone speaker/keyword UI entries are retired. Legacy data and compatibility code remain; do not describe their FSMN segmentation or ASR-first reanalysis as the current user workflow.

## Environment and verification

For versioned model downloads, prefer [Release models](release-models.md): it verifies all files and does not write runtime.json. The legacy full installer below remains an official-source fallback and resets registration; do not use it merely to download a comparison model.

Use an isolated Python 3.10–3.12 environment. For the minimal pipeline install `scripts/speaker-pipeline-requirements.txt` and provide FFmpeg. `scripts/recording-requirements.txt` covers the broader legacy environment. Inspect disk space for model weights, dependencies, download cache and recordings first. Reuse valid existing models:

```sh
<python> <skill>/scripts/register-recording-models.py --user-dir <actual-user-data-dir> --sensevoice <model-directory> --campplus <onnx-file> --silero <onnx-file> --ffmpeg <absolute-executable>
```

When model installation is requested, use:

```sh
<python> <skill>/scripts/setup-recording-models.py --models-dir <absolute-model-directory> --user-dir <actual-user-data-directory>
```

Use the actual client user-data directory; do not guess for packaged/custom installations. The helpers create or update `recording-models/runtime.json`. Registration is not verified inference. The full installer includes Silero; FSMN remains supported as a fallback. Qwen3-TTS is a separate environment and need not be installed for transcription. Opening settings must not install dependencies or download models.

Check model status in the running client, then process an authorized recording through the actual worker/app in an isolated test session. Verify playable clips, original timestamps, nonempty transcription, speaker candidates and persistence before reporting success. Test automatic transcription without first confirming speakers. A model loading successfully does not establish transcription quality. Re-registration or setup may reset verification, so repeat actual inference checks as needed.

Short speech may remain uncertain; overlapping speakers are not separated. Cosine similarity flags review and is not a calibrated accuracy score. Keep recordings local, do not silently switch to cloud on failure, and do not submit uncertain machine text as user-confirmed expression material or repurpose voiceprints for cloning. Do not install global hooks or start recording automatically.

## Import preflight and WinError 2

Run these checks after setup/migration, before claiming the recording environment is ready, and when an import fails. Reuse successful checks while the relevant configuration and files remain unchanged. Check the user's existing environment before proposing downloads or installations.

1. Resolve the **running client's actual user-data directory**, including a `SAYAGAIN_DATA_DIR` override. Read `recording-models/runtime.json` there. Do not assume a development directory matches a packaged/custom installation, and do not inspect or print unrelated secret files.
2. Verify `runtime.python` exists and runs. Execute dependency checks with **that interpreter**, not a different Python on PATH: `import numpy, soundfile, sherpa_onnx, sklearn`; include `funasr_onnx` when using FSMN. Verify SenseVoice has its `tokens.txt` and INT8 ONNX model, CAMPPlus points to its ONNX file, and the selected Silero file or FSMN directory/config/model exists. A historical `verified` flag does not validate moved paths.
3. Resolve FFmpeg as the current speaker pipeline does: nonempty `SAYAGAIN_FFMPEG`, then `runtime.ffmpeg`, then the application's bundled `ffmpeg-static` executable. An explicit invalid path is an error, not permission to silently choose another. Verify it is a runnable file. Source installations can resolve the bundled path from their actual project directory with `node -p "require('ffmpeg-static')"`; on Windows it normally ends in `node_modules/ffmpeg-static/ffmpeg.exe`. Packaged apps need the unpacked executable path. The portable Skill does **not** bundle FFmpeg or depend on the source checkout: locate the user's installed application or existing FFmpeg and use its verified absolute path. A missing PATH command alone is not evidence that FFmpeg is uninstalled.
4. Run an actual decode from the registered Python with an isolated short audio fixture or an authorized sample. For example, substitute verified paths in the following argument-based command; use a **new temporary output path**, keep the source untouched, and do not interpolate user text into executable code:

```text
<registered-python> -c "import subprocess,sys; subprocess.run([sys.argv[1],'-nostdin','-v','error','-n','-i',sys.argv[2],'-t','1','-vn','-ar','16000','-ac','1','-c:a','pcm_s16le',sys.argv[3]],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=30)" <absolute-ffmpeg> <sample-audio> <new-temporary.wav>
```

Quote path arguments appropriately for the current shell, including Chinese names and spaces. Check the resulting WAV has frames, one channel, 16 kHz and 16-bit PCM, for example with Python's `wave` module. `-version`, successful model loading or the presence of a file is not a decode test. If decoding fails, inspect the subprocess exit/error and relevant stderr; report the failing stage.

5. With an authorized short speech sample, test the actual worker/app import, segmentation, nonempty transcript and saved results after reopening. Keep this in an isolated test session where possible. A synthetic decode fixture proves decoding only, not speech recognition quality. Do not mark models verified from a decode-only test.

### Repairing a missing executable

`[WinError 2]` at Python `subprocess` startup can mean the requested **program** is missing. Identify whether the failed launch is the registered Python, FFmpeg, or another tool; separately check the selected source file. A missing input file normally produces FFmpeg's own error after the program starts. In the known legacy case, runtime omitted `ffmpeg` and the old worker tried the bare command `ffmpeg`, which was absent from Windows PATH even though the app bundled it.

After verifying the available executable, back up `runtime.json` and update only its `ffmpeg` field to the absolute path if that is the missing configuration. Preserve all model descriptors, other settings and verification records; use structured JSON writing and read back the result. Repair a conflicting `SAYAGAIN_FFMPEG` override at its actual source instead of writing a lower-priority field that cannot take effect. Do not rerun `setup-recording-models.py` or `register-recording-models.py` solely to repair this field: those workflows can reset model verification. Do not automatically download models, change global PATH or switch to cloud.

The app reads runtime when each import starts, so a runtime-only correction can be retried directly; changed process environment or main-process code requires a restart. Confirm no relevant task is active before restarting. Report separately: paths checked, real decoding passed/failed, model inference passed/failed/not tested, and app import passed/failed/not tested. Preserve the original recording and existing notes on failure.


## Difference from Freenote / PatchxNote

The inspected SayAgain Mac runtime uses the official sherpa-onnx 2024-07-17 general INT8 export; Freenote / PatchxNote also selected the same official model. Their ONNX files match the newly downloaded official file byte-for-byte (SHA-256 `c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51`). This establishes common model selection, not a technology-origin relationship between products. The installer currently points to the distinct 2025-09-09 Cantonese fine-tuned export; check actual runtime files rather than assuming all installations match.

SayAgain currently uses batch analysis after import or recording stop. Inspection of the local PatchxNote 1.0.2 (21) installation found FSMN configuration, realtime preview/session processing, online speaker tracking, global reclustering, short-speech confirmation/refinement, ASR chunk construction with context and display-time restoration, stored voiceprint matching, and optional HTTP LLM correction mechanisms. These differ from SayAgain's Silero-preferred batch clustering, per-speaker short-clip transcription, manual person association and manual text correction.

The PatchxNote evidence comes from bundled configuration, C++ symbols and Dart remnants, not complete source code. It does not prove that every mechanism is enabled by default or establish the exact execution order. Matching SenseVoice weights does not ensure matching results when segmentation, context and postprocessing differ. A shared-code comparison completed 24 public-sample inferences across four model sources with ITN on/off; the official general model and Freenote produced identical token sequences. This is not an end-to-end comparison of the applications.
