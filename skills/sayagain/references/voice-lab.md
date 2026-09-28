# Voice Lab and local IndexTTS

Use this reference for speech experiments, IndexTTS setup and local synthesis failures. The review bridge does not expose synthesis: use SayAgain's desktop UI or its existing application service for an authorized local verification.

## Controls and records

- 「我的音色 → 音色实验」 creates an independent synthesis record on every click, newest submission first. It preserves text, voice, reference sample, model and emotion settings; it does not create an expression or change defaults.
- Qwen3-TTS Base accepts text, language and the reference voice, without a separate emotion instruction. Do not pass another model's tags to it or claim that reference prosody is perfectly neutral.
- IndexTTS 2.5 accepts eight emotion weights and a separate intensity. Weights must each be 0–1 and sum to at most 1. Pass the raw vector and intensity separately: upstream scales the vector. Zero strength retains the reference state rather than forcing neutrality.
- Cloud controls depend on the model: supported Qwen-Audio/CosyVoice variants use `input.instruction`; MiniMax uses `input.voice_setting.emotion`. Capability metadata is not proof that the configured proxy accepts the parameter or produces the intended emotion. Keep cloud upload authorization separate from local testing; do not silently switch models, strip controls or repeat paid requests.

## Set up IndexTTS separately

Check the [official repository](https://github.com/index-tts/index-tts) when asked for the latest version. The current SayAgain adapter specifically targets `IndexTTS2` from `indextts/infer_v2_5.py` and model configuration version `2.5`, not an old IndexTTS 2 source tree. Upstream package metadata can still say `2.0.0`; inspect the implementation and model configuration.

Locate the user's SayAgain checkout and the actual app data directory. The registrar `scripts/register-index-tts.cjs` and worker `workers/index_tts_worker.py` belong to that checkout, not this portable Skill. Read the checkout's `docs/index-tts-local.md` for its pinned installation recipe, auxiliary resources and measured results. If the checkout is unavailable, locate the matching application tooling before claiming registration is possible.

For an authorized installation, use a separate Python 3.11 environment and the upstream locked dependencies. Check disk space for weights, environment and installation caches; reuse verified files. The currently integrated model requires the 2.5 weights/tokenizer/config plus local w2v-bert-2.0, CAMPPlus and BigVGAN resources (14 files, about 6.60 GiB of weights/resources). Verify fixed official revisions and file hashes, then register with the checkout's helper:

```sh
node "$SAYAGAIN_REPO/scripts/register-index-tts.cjs" \
  --python "$INDEX_ROOT/source/.venv/bin/python" \
  --repo-path "$INDEX_ROOT/source" \
  --model-path "$INDEX_ROOT/checkpoints" \
  --device mps --data-dir "$SAYAGAIN_APP_DATA"
```

Set these variables to discovered absolute paths and select the actual supported device (`cpu`, `mps` or `cuda:0`). Registration fingerprints existing resources; it does not download. Refresh 「检查模型」 afterwards. Preserve the Qwen and transcription runtimes.

The current adapter is offline and uses vector emotions with `use_qwen_emo=False`. Optional QwenEmotion/free-text emotion inference is not installed or enabled by this workflow. A request for that mode needs a separate implementation and validation; do not label it available merely because upstream offers it.

## Diagnose failures and verify the fix

- Read the failed task's model, device, reference duration, text length and control snapshot. Keep private reference audio, text and debug outputs local; do not include them in repository docs or raw error banners.
- Distinguish cancellation, timeout, output overflow, process signal, exit code and malformed/empty JSON. A `SIGKILL` can cause empty stdout; it does not prove a broken model. Inspect local OS memory/termination evidence before attributing the cause. Do not blindly repeat a resource-exhausting request or redownload valid weights.
- On MPS, SayAgain covers model construction and inference with `torch.inference_mode()`, caps MPS allocator memory at the lesser of 12 GiB and half the recommended working set, and passes `num_beams=1` with 40-token segments to upstream. These are adapter safeguards, not a cap on total Python memory or a guarantee for every device. Do not disable allocator limits to force an out-of-memory request through.
- For a reported synthesis bug, verify the authorized failing input locally after the fix, then the real application queue, saved waveform and playback. A short public sample alone is insufficient. Preserve the failure record and distinguish simulated tests, real inference, ASR comparison and human listening. Segmentation/single-beam generation may change pauses and prosody; successful output is not an emotion-quality or voice-similarity score.
- After restarting to load code changes, verify that the old process actually exited and the new service can accept work. A reopened window can belong to an old process whose speech service has already closed.

The September 2026 M1 Max / 64 GiB regression case used a 19.32-second reference, 47 Chinese characters and anger intensity 0.6. After the memory fix, the desktop queue generated 8.188 seconds in 83.379 seconds and playback reached the end. This is one local case including model loading, not a realtime-performance claim or verification of all languages/emotions.
