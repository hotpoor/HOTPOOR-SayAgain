# 本地 IndexTTS 2.5 环境

SayAgain 的音色实验使用官方 `IndexTTS2` / `infer_v2_5`，通过八维情绪配比和 `emo_alpha` 调整表达。源码、Python 环境及模型独立于 Qwen 和录音转写环境。

## 本次安装配置

- 官方源码：`index-tts/index-tts`，固定提交 `ee40fa7d6c6b8a2c7f06105f9f1e65775b74868c`。
- Python 3.11.9；按上游 lockfile 安装基础依赖，Torch / Torchaudio 2.8.0、Transformers 4.52.1。
- macOS Apple Silicon 使用 MPS，关闭 BF16、CUDA kernel、DeepSpeed 和编译加速。
- MPS 合成使用完整 `torch.inference_mode()`；模型加载前将分配上限设为 12 GiB 与系统推荐工作集一半中的较小值。采用单 beam 和上游 40-token 分段，保留原文及情绪参数，不自动改用 CPU 或云端。
- 安装目录：`~/.local/share/hotpoor-sayagain/index-tts-2.5/`，其中 `source/.venv` 是独立 Python 环境，`checkpoints` 存放模型。
- 主模型及三个辅助模型共 14 个文件，精确大小 7,082,482,799 字节（约 6.596 GiB），逐文件核验内容 SHA-256。安装还需给依赖、缓存和系统保留空间，不能仅按模型体积判断。

| 模型仓库 | 固定 revision |
| --- | --- |
| `IndexTeam/IndexTTS-2.5` | `c39ce5ba981572cb187443877ff559dfb246ce63` |
| `facebook/w2v-bert-2.0` | `da985ba0987f70aaeb84a80f2851cfac8c697a7b` |
| `funasr/campplus` | `e4b6ede7ce16997aff4ae69fbca1f0175e2afede` |
| `nvidia/bigvgan_v2_22khz_80band_256x` | `633ff708ed5b74903e86ff1298cf4a98e921c513` |

本次配齐的是音色实验使用的向量情绪模式：不需要额外的 QwenEmotion 文本转情绪模型，也不下载重复的 Fairseq 权重、训练权重或 IndexTTS 2 专用的 MaskGCT。`use_qwen_emo` 保持关闭；不把自由文字情绪描述标为已支持。

## 登记和使用

环境与文件检查通过后，使用 `node scripts/register-index-tts.cjs --help` 中的参数登记 Python、源码、模型目录及设备。登记文件位于 SayAgain 用户目录的 `index-tts/runtime.json`，保存文件指纹。仅登记成功不表示实际合成已验证。

打开「我的音色 → 音色实验」，点击「检查模型」，选择「本地 IndexTTS-2.5」。缺失文件、文件变化或空间不足时仍应显示不可用，不能静默切换云端。详情见[音色实验](voice-lab.md)。

Worker 在合成阶段离线运行。首次验证使用官方公开示例录音与原创短句；环境检查、实际生成、字词正确性、音色相似度和情绪听感应分别记录。

## 2026-09-28 本机实测

M1 Max / 64 GiB、MPS 环境通过实际张量运算、依赖检查及中英文本前端检查。使用官方公开 `voice_01.wav` 作为参考，在隔离数据库中调用 SayAgain 的真实 `Speech.requestVoiceLab` 队列，离线合成“你好，欢迎使用音色实验。”。没有使用模拟 runner、云端接口或用户私人录音。

| 模式 | 参数 | 输出时长 | 总耗时 |
| --- | --- | ---: | ---: |
| 沿用参考录音 | 无情绪覆盖 | 2.868 秒 | 75.380 秒 |
| 开心 | 八维向量 `[1,0,0,0,0,0,0,0]`，强度 0.6 | 2.589 秒 | 42.954 秒 |

两条任务均成功，生成有效的 22,050 Hz 单声道 PCM WAV，分别持久化文本、模型指纹和情绪快照。每条均启动新 worker，耗时包含模型加载；这不是实时性能或充分的基准测试。

既有本地 SenseVoice 对两条输出均转写为“你好，欢迎使用音色试验。”，与输入仅有“实验／试验”的同音用字差异，因此没有记为逐字完全匹配。未进行真人试听、音色相似度评分或情绪质量验收；参数通过和音频不同不能代替听感判断。

本机证据位于安装目录的 `validation/`：`environment-probe.json`、`synthesis-report.json`、`asr-report.json`、`neutral.wav` 和 `happy.wav`。模型文件的完整校验另见安装目录 `model-verification.json`。

### 较长输入暴露的内存问题

后续真实用户任务（47 字中文、19.32 秒参考录音、生气强度 0.6）约 79 秒失败，原界面只显示“worker 未返回有效结果”。相同参数离线复现为 `SIGKILL`、空 stdout；系统日志明确记录 Python 占用约 35,385 MB 压缩内存，并因没有交换空间而终止进程。早先两条短句成功不能证明这一场景可用。

因此增加上述 MPS 内存与分段策略，并将进程信号、非零退出码、超时、超量输出、空结果及 JSON 格式错误分别报告。模型 stderr 仍不显示或持久化到应用记录，避免夹带私人台词或录音路径；没有将未知 SIGKILL 一律认定为内存错误。

修复后相同输入实际生成成功：73.487 秒得到 8.977 秒的非静音 PCM WAV。本地 ASR 覆盖所有分句，但存在“车换／撤换”和句末语气字差异，不记为逐字准确。随后在重启后的日常客户端用相同输入再次生成，83.379 秒得到 8.188 秒音频；列表显示“已生成”，实际播放至结尾，原失败记录仍保留。

12 GiB 限制的是 MPS 分配器，不是整个 Python 进程内存。单 beam 与较短分段可能改变停顿、韵律和生成结果，听感仍需用户判断。此结果验证当前失败样例，不代表所有长文本、参考音频或情绪均已验收。

## 官方依据

- [官方仓库及版本说明](https://github.com/index-tts/index-tts)
- [固定版本的 Python 依赖](https://github.com/index-tts/index-tts/blob/ee40fa7d6c6b8a2c7f06105f9f1e65775b74868c/pyproject.toml)
- [2.5 推理实现及 MPS 选择](https://github.com/index-tts/index-tts/blob/ee40fa7d6c6b8a2c7f06105f9f1e65775b74868c/indextts/infer_v2_5.py)
- [官方模型文件](https://huggingface.co/IndexTeam/IndexTTS-2.5/tree/c39ce5ba981572cb187443877ff559dfb246ce63)
