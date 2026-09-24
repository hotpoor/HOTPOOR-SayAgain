# 本地说话人拆条与转写：speaker-clips-v1

## 用户流程

在「我的录音 → 分人语音条」选择转写语言和说话人数（默认自动）：

- 「导入长音频并分人转写」通过系统文件选择器读取一个文件，用 FFmpeg 在本地解码，支持 MP3/WAV/M4A/FLAC/OGG/AAC/Opus。不经过页面整文件解码，单文件最多 2 GiB、单次总时长最多 4 小时。
- 「当前会话分人并转写」处理已有会话的全部原片段，支持 1–2000 个。全部片段共享本次任务的声纹中心，但不跨源片段拼接音频；此前每30秒切分的边界仍会保留。不同源文件的时间轴各自独立。
- 任务显示阶段进度，可以取消。完成后创建独立的「原名称 · 分人语音条」会话。保留原录音、旧分析和人工修改的文字。
- 每条有可播放音频、原来源和起点、说话人 A–H 或「不确定」、未校对的机器文字。支持按说话人筛选，每页最多40条；不将数百个播放器同时载入页面。

说话人标签仅在单次任务内有效，不确认真人身份，不创建可跨任务追踪的声纹档案。短插话和重叠发言仍可能归错；这不是音源分离。文字不会自动作为用户确认的表达提交语言纠错。

## 策略

1. **统一输入**：FFmpeg 转为16 kHz单声道PCM。每个源单独解码，超过总时长即失败。
2. **VAD**：优先使用已登记的 Silero；仅有 FSMN 时使用 funasr-onnx 的 FSMN。Silero 阈值0.5、最短静音350 ms、最短语音250 ms、最长检测段30秒。选择会写入结果，不声称两种VAD会产生相同边界。
3. **声纹**：CAMPPlus，3秒窗口、约1.5秒步长，对每个向量做L2归一化。小于650 ms的区间保留为不确定；650–1500 ms的声纹只参与分配，不参与建立中心。
4. **人数与聚类**：最多抽样1200个不少于1.5秒的窗口。对2–6类进行固定随机种子42、10次初始化的KMeans；排除极小簇，比较余弦轮廓系数，低于0.25时退回一人。可手动指定1–8人。用全部稳定窗口训练最终中心，对全部声纹按余弦相似度分配。
5. **平滑与时间对齐**：只在同一VAD区间内消除被同一标签包围的单窗口跳变。换人点取相邻窗口中心的中点，这是近似边界，不是字级对齐。
6. **短语音条**：同一来源内，相同标签且间隔不足650 ms的区间合并。长于18秒时在第8–16秒内搜索160 ms窗口的最低能量位置切开，保留覆盖和顺序。没有单独把问答/语义句子作为硬边界。
7. **转写**：SenseVoice INT8，4个CPU线程，按用户语言选项推理，启用ITN。每条音频和文字使用同一采样区间，避免将邻条文字复制进来。
8. **复核标记**：声纹与中心的平均余弦相似度低于0.60，或无可靠标签，标记复核。相似度不是准确率，未标记也不保证正确；所有文字均为 machine_unreviewed。

### 试验中修正的问题

最初的直接全量凝聚聚类会被极短异常声音干扰：两类可能变成「几乎所有语音」和「一个异常片段」。v1改为稳定窗口建立中心、短句后分配，并限制自动人数候选中的极小簇。不要把0.65的单一阈值当作通用说话人数判断，也不要把每个不匹配窗口都当新说话人。

自动人数仍是启发式估计；相近声线、广告插播、配乐和录音设备变化都可能影响结果。多源/少量语音场景优先由用户指定人数。

## 环境与模型

使用独立Python 3.10–3.12环境。复现核心流程安装 `skills/sayagain/scripts/speaker-pipeline-requirements.txt`；完整旧录音功能使用 `recording-requirements.txt`。FFmpeg为单独依赖，登记时记录可执行文件绝对路径，避免GUI启动时PATH不同。

可用完整安装器从官方来源下载模型：

```sh
<python> skills/sayagain/scripts/setup-recording-models.py \
  --models-dir /absolute/models --user-dir /absolute/SayAgainUserData
```

也可以复用已有模型，不重新下载：

```sh
<python> skills/sayagain/scripts/register-recording-models.py \
  --user-dir /absolute/SayAgainUserData \
  --sensevoice /absolute/models/sensevoice \
  --campplus /absolute/models/campplus.onnx \
  --silero /absolute/models/silero_vad.onnx \
  --ffmpeg /absolute/bin/ffmpeg
```

注册只检查依赖和文件，标记待验证；不会下载模型或修改录音数据库。已有runtime会备份，保留不相关的模型条目。用另一Python环境重登记后，其他模型依赖仍需分别验证。

模型来源：
- [sherpa-onnx 官方模型与移动端支持](https://github.com/k2-fsa/sherpa-onnx)
- [SenseVoice](https://github.com/FunAudioLLM/SenseVoice)
- [3D-Speaker / CAMPPlus](https://github.com/modelscope/3D-Speaker)
- [Silero VAD](https://github.com/snakers4/silero-vad)

## 命令行复现

`workers/speaker_pipeline.py` 接收JSON标准输入，也支持 `--request /absolute/request.json`：

```json
{
  "models": {
    "sensevoice": {"path": "/absolute/models/sensevoice"},
    "campplus": {"path": "/absolute/models/campplus.onnx"},
    "silero": {"path": "/absolute/models/silero_vad.onnx"}
  },
  "ffmpeg": "/absolute/bin/ffmpeg",
  "sources": [{"audio": "/absolute/input.mp3", "name": "input.mp3"}],
  "options": {"language": "en", "speaker_count": 0},
  "output_dir": "/absolute/empty-output-directory"
}
```

输出数字编号的PCM WAV和 `manifest.json`。标准输出为单个JSON结果；标准错误提供阶段进度，不输出转写文本。请使用新的空目录。manifest保存算法版本、选项、VAD种类、人数评分、推理库版本、模型SHA256、每条文字与源内起止时间。

桌面进程为每个任务创建独立临时目录，验证文件名、音频长度、时间顺序、源索引及文本，再暂存音频并用单个SQLite事务写入结果会话/asset/clip。失败回滚新实体、删除新文件；原会话/原片段revision变化时拒绝提交。取消会终止worker进程组及解码子进程，并清理临时目录。程序强制崩溃可能留下临时文件，但不会将半个任务标记成功。

## 验证

```sh
npm test
<python> tests/speaker_pipeline_test.py
```

分别覆盖异常短声纹、分段覆盖、配置校验、恶意/错误结果、音频与时间戳一致性、事务回滚、原文保护及重开持久化。真实模型推理和桌面IPC另做隔离目录验证，不以单元测试替代识别准确率评估。

首次访谈试验在本机约102分钟音频上得到两个主要声音分组和601条语音（Silero+CAMPPlus+SenseVoice）。这个数字属于早期脚本，v1调整了聚类、极短语音和转写边缘，条数可能改变。录音、文字、声纹缓存、模型与测试数据不进入Git仓库。


本次集成验证：新worker对同一约102分钟音频得到648条、两个主要声音分组、38条不确定语音；整批持久化通过。锁定的独立环境在120秒双人样本上通过Electron原生文件导入、13条结果、筛选、实际播放、重新打开和取消测试。仅验证macOS CPU。

桌面端复现测试（使用临时数据目录，不写正式录音库）：

```sh
SAYAGAIN_TEST_RUNTIME=/absolute/runtime.json \
SAYAGAIN_TEST_AUDIO=/absolute/two-speakers.wav \
node scripts/smoke-speaker-pipeline.cjs
```

测试样本需包含两位主要说话人，测试会指定人数为2；自动人数另由整段样本与算法测试验证。
