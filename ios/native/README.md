# Native local ASR (iOS 12 and modern builds)

This is device-only SenseVoice transcription, extended from the first-ten-seconds feasibility probe to complete recordings. It keeps the current recording and transcript unchanged. No URLSession, desktop worker, or cloud inference is involved. It uses the desktop's exact INT8 model/token files, fingerprinted in `model-manifest.json`. The UI reports audio duration, model loading, inference, total elapsed time and sampled whole-process physical memory footprint. Footprint is sampled every 100 ms, so it is not an exact kernel high-water mark.

Pinned native inputs:

- sherpa-onnx v1.10.30: https://github.com/k2-fsa/sherpa-onnx/tree/v1.10.30
- Microsoft ONNX Runtime C 1.17.1 official pod: https://onnxruntimepackages.z14.web.core.windows.net/pod-archive-onnxruntime-c-1.17.1.zip
- The official runtime's arm64 objects target iOS 12. The sherpa-provided prebuilt runtime of the same version targets iOS 13 and must not be substituted.
- `sherpa-ios12-memory.patch` loads SenseVoice from a file path instead of making an extra full model byte buffer; disables CPU arena, memory patterns and weight prepacking, and uses basic graph optimizations. The weights are unchanged.

Build using a current Xcode (to resolve the official archive's modern ObjC selector stubs), CMake, and the extracted source/package:

```
python3 ios/scripts/build-native-asr.py \
  --sherpa-source /path/to/sherpa-onnx-1.10.30 \
  --ort-package /path/to/extracted-official-ort-pod \
  --model-dir /path/to/desktop/sensevoice \
  --build-dir /path/to/asr-build
```

The script builds static sherpa libraries and links the official ORT archive into an iOS 12 dynamic framework with classic dyld fixups. The older signing Mac's Xcode 13 embeds/signs that framework. Generated binaries and model resources are ignored by Git; the reproducible source, patch, manifest and build helper are tracked inputs. CMake verifies its pinned dependency downloads against upstream SHA256 hashes. The runtime uses CPU/one thread; it does not enable CoreML or speaker clustering.

Whole recordings use bounded 7–10 second audio buffers and one recognizer load per job. A low-energy 120 ms window after seven seconds is preferred as the cut point; this is not learned VAD and continuous speech can still be split inside a word. Segment timestamps describe input ranges, not word alignment.

Each completed segment atomically checkpoints `<recording filename>.asr.json` alongside its source audio, including the original audio filename, segment ranges, transcript and benchmark data. The draft reloads when the recording is opened. Cancellation takes effect after the active load/decode step, preserves finished segments and never changes the original text. “采用本机转写草稿” explicitly fills the editor; the user still reviews/saves. Process interruption leaves the last checkpoint; restarting inference starts from the beginning, not a resume. Keep the app in the foreground during this experiment. Idle sleep is temporarily disabled while running and restored afterwards; entering the background requests cancellation after the current step.

The earlier `local-asr-probe.json` / `local-asr-progress.json` files are historical diagnostics and no longer updated. Current validation: `SmokeTests/testLocalASRFullRecording`, including unchanged original text and app-relaunch persistence. Successful linking alone does not confirm runtime feasibility. See `../docs/validation.md` for physical-device evidence. JSON library export does not yet include sidecar ASR drafts; a complete Documents backup preserves them.
