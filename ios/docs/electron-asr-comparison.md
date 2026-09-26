# Electron / iPhone / 老 iPad：同音频本地转写对比

2026-09-27，在当前 Mac 上实际运行 SayAgain Electron，通过 renderer preload → Electron IPC `transcribeRecording` → 现有 Python worker → 数据库保存完成转写。测试使用隔离的临时用户目录，没有改动日常客户端录音库，没有云端调用或假推理。

## 测量结果

输入与 [iPhone 真机测速](iphone12pro-benchmark.md) 完全相同：241.4175 秒、24 kHz 单声道 WAV，11,592,136 字节；SHA-256 `aa57d537103e22d71bb0af431f3cc4f8ba5b17449e4ed01f98e463a369a5167f`。桌面数据库把时长四舍五入到毫秒，因此脚本报告 241.418 秒。

| 设备 / 路径 | 分段 | 完成耗时 | 音频时长 / 耗时 |
|---|---|---:|---:|
| M1 Max Electron，第 1 轮 | 与 iPhone 相同的 29 段 | 4.789 秒 | 50.41 倍 |
| M1 Max Electron，第 2 轮 | 同上 | 4.413 秒 | 54.70 倍 |
| M1 Max Electron，第 3 轮 | 同上 | 4.445 秒 | 54.32 倍 |
| M1 Max Electron，默认未指定分段 | 整条 241 秒音频为 1 段 | 14.336 秒 | 16.84 倍 |
| iPhone 12 Pro，Release 复测 | 29 段 | 69.148 秒 | 3.49 倍 |
| iPad mini 3，Debug | 29 段 | 811.08 秒 | 0.30 倍 |

Electron 相同分段三轮的中位数为 **4.4445 秒**，iPhone Release 总耗时约为其 **15.6 倍**，旧 iPad 约为其 **182.5 倍**。桌面直接整段转写的单轮耗时约为 iPhone 的 1/4.8，但两者分段不同。这些是当前客户端配置处理这一条录音的实测比例，不是固定硬件速度比。

## 配置与计时边界

- Mac：Apple M1 Max，10 核（8 性能核 + 2 能效核），64 GiB，arm64，macOS 26.5.2 (25F84)，Electron 44.4.5；接交流电、电池充满，`pmset` 的 `powermode=0`。没有采集温度。
- Electron：Python 3.12.9、sherpa-onnx 1.13.8、其内置 ONNX Runtime **1.28.2**（由 `sherpa_onnx.onnxruntime_version` 读取，不能用独立 Python onnxruntime 包的版本代替）、NumPy 1.26.4、SoundFile 0.14.0、soxr 1.1.0。实际 worker 使用 CPU **4 线程**，auto language、use_itn。
- iOS：sherpa-onnx 1.10.30 / ONNX Runtime 1.17.1，CPU **1 线程**；手机 Release 复测首尾为低电量模式开启、热状态 serious。iPad 是老系统 Debug 构建。线程、运行库、系统、编译、热状态等变量没有统一，不能归因成芯片本身的倍数差。
- 三端 SenseVoice INT8 权重 SHA-256 都是 `c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51`；tokens SHA-256 都是 `f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc`。
- 桌面计时从 renderer 调用真实转写 IPC 开始，到结果写入数据库并返回为止，包含 Python 启动、依赖导入、读音频、重采样、模型加载和推理；不包含打开 App、导入原始录音、刷新页面的时间。每轮新建 Python 进程和识别器，没有复用转写缓存；没有清空操作系统文件缓存，因此不宣称冷磁盘启动。
- iOS 总时间包含其音频处理、模型加载、分段推理和草稿检查点；两端保存策略不同。相同 29 段测试复用 iOS 已得到的边界，桌面时间不含寻找这些边界的耗时。
- 本轮不测 Silero VAD + CAMPPlus 分人完整流水线，也不测 Qwen TTS；没有测量桌面内存峰值或模型加载/推理分项。

## 实际发现与验证

第一次原样运行失败，错误为 `No module named 'soxr'`：现有桌面 Python 环境缺少处理非 16kHz 音频的重采样包。补装仓库 requirements 已指定的 soxr 1.1.0 后重测成功；没有修改模型、推理 worker 或原始音频。16kHz 输入以及先由 ffmpeg 统一采样率的路径不会触发同一个缺包分支，过去该类成功测试不能证明 24kHz 直接转写可用。

四轮成功测试都返回非空文字、完成数据库保存并在 renderer 重载后核对全文相同；相同分段三轮输出 SHA-256 一致。整段与分段输出不同，字符数不能代表识别准确率；没有人工标注参考文本，不报告 WER 或质量胜负。录音和转写全文不入库，公开报告只保留指标、哈希和分段时间。

## 复测

[脚本](../../scripts/benchmark-recording-asr.cjs) 启动临时 Electron profile，复用已登记的本地模型路径，结束后删除自己的临时录音库；保留指定位置的无全文 JSON 报告。原录音需自行提供，仓库不包含它。

```sh
SAYAGAIN_TEST_AUDIO=/absolute/original.wav \
SAYAGAIN_TEST_RUNTIME='/absolute/recording-models/runtime.json' \
SAYAGAIN_TEST_SEGMENTS="$PWD/ios/docs/benchmarks/2026-09-27-electron-matched.json" \
SAYAGAIN_BENCHMARK_OUTPUT=/tmp/electron-matched.json \
node scripts/benchmark-recording-asr.cjs
```

省略 `SAYAGAIN_TEST_SEGMENTS` 测默认整条转写；`SAYAGAIN_BENCHMARK_RUNS=1` 可只测一轮，默认三轮。缺失运行依赖时脚本报错，不自动安装。

证据：[相同分段三轮 JSON](benchmarks/2026-09-27-electron-matched.json)、[整条转写 JSON](benchmarks/2026-09-27-electron-whole.json)。
