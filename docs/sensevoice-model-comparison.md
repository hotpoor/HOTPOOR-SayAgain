# SenseVoice Windows 同环境模型对照测试

结论：本次同一英文音频测试中，仅替换模型文件即可使全大写、无标点输出变为正常大小写和句末句号。两份词表 SHA256 相同；每份模型的 auto/en 输出相同。不能据此评价整体识别准确率或确认上游模型版本。

## 环境与方法

- Python: 3.10.6 (tags/v3.10.6:9c7b4bd, Aug  1 2022, 21:53:49) [MSC v.1932 64 bit (AMD64)]
- Python 路径: `J:\codex_projects\speaker-local\sayagain-input-venv\Scripts\python.exe`
- 平台: Windows-10-10.0.26200-SP0
- sherpa-onnx 1.13.8；CPU；num_threads=4；use_itn=True；greedy_search；sample_rate=16000；feature_dim=80；debug=False。
- 每组新建识别器，加载耗时单列；推理耗时仅测 decode_stream。每组运行一次，未进行性能基准重复采样。
- 使用同一份 WAV，PCM int16 转 float32 /32768；无重采样。直接保存 stream.result.text，无大小写、标点或其他文本后处理。

## 校验与路径

- 压缩包：`J:\codex_projects\speaker-local\sensevoice-comparison-20260925\mac-model.zip`
- 压缩包 SHA256：`26e5481c800aae02208e5f8e3cff169db9f693c3ccc3b48031137d356291ff8e`（与提供值一致）
- 音频：`J:\codex_projects\speaker-local\sayagain-models\sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09\test_wavs\en.wav`
- 音频 SHA256：`eb1eb008904465b74c304aad8342e8c7d3c6e61ffe9f66adcaca9cf0f76a93f4`（与提供值一致）
- 音频：16000 Hz，7.152000 秒，单声道。

### Windows

- 模型：`J:\codex_projects\speaker-local\sayagain-models\sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09\model.int8.onnx`
- 模型 SHA256：`12ca1a2ae7ecf3e0019ef2822307ee0b5cadc9196569e379b4c4026f8205276d`
- 词表：`J:\codex_projects\speaker-local\sayagain-models\sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09\tokens.txt`
- 词表 SHA256：`f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc`

### Mac

- 模型：`J:\codex_projects\speaker-local\sensevoice-comparison-20260925\mac-model\sensevoice\model.int8.onnx`
- 模型 SHA256：`c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51`
- 词表：`J:\codex_projects\speaker-local\sensevoice-comparison-20260925\mac-model\sensevoice\tokens.txt`
- 词表 SHA256：`f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc`

## 原始输出与耗时

| 模型 | language | 加载耗时（秒） | 推理耗时（秒） | stream.result.text |
|---|---|---:|---:|---|
| Windows | auto | 2.056690 | 0.355901 | THE TRIVBAL CHIEF THIN CALLED FOR THE BOY AND PRESENTED HIM WITH FIFTY PIECES OF COOD |
| Windows | en | 1.635368 | 0.316581 | THE TRIVBAL CHIEF THIN CALLED FOR THE BOY AND PRESENTED HIM WITH FIFTY PIECES OF COOD |
| Mac | auto | 1.693013 | 0.333132 | The tribal chieftain called for the boy and presented him with 50 pieces of code. |
| Mac | en | 1.717811 | 0.324255 | The tribal chieftain called for the boy and presented him with 50 pieces of code. |

## 保留与限制

- 压缩包及解压后的 Mac 模型保留在独立比较目录；Windows 原模型保留原位。
- 测试前后重新校验两份模型、词表、测试音频，文件内容均未变化。
- runtime.json 的测试前后 SHA256 一致；未切换应用配置、未升级依赖。
- Mac 来源由用户说明为 PatchxNote 内置 patchnote-standard 0.2.0；该包版本不代表上游模型版本，准确发布日期或微调批次仍未确认。
- 等待用户决定是否切换。
