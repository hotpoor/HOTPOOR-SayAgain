# 本地说话人拆条与转写：speaker-clips-v1

客户端的四来源模型名称、文件指纹与公开出处见 [模型来源说明](model-provenance.md)。

## 当前流程与 Freenote / PatchxNote 的差异

本次核对的 SayAgain Mac 模型是官方 `2024-07-17` 通用 INT8 导出文件；Freenote / PatchxNote 也选用了相同的官方通用模型，完整文件指纹一致。这里仅表述共同选型，不推断产品之间的技术来源关系；具体指纹及官方入口见 README。安装器指向的 `2025-09-09` 粤语微调包与此不同，实际环境应按文件核对。

截至 2026-09-25，当前链路为：导入文件 / 停止录音并拼接同次保存块 → FFmpeg 16 kHz 单声道 PCM → VAD → CAMPPlus → 整批 KMeans 与平滑 → 按候选说话人拆短条 → SenseVoice 自动转写 → 人工校对、回放与导出。当前无需先确认说话人；保存的人工边界用于后续重新转写。

与本机 Freenote（现名 PatchxNote）相比，主要差异是：SayAgain 优先 Silero、停止录音后批处理、整批聚类、按人拆短条后识别、人工关联人物及修订文字；PatchxNote 安装包中发现 FSMN、实时增量预览、在线跟踪与全局重新聚类/短句细化、ASR 合并补边与时间恢复、已存声纹匹配和可选 HTTP LLM 纠错机制。详细六项对照与证据范围见 [README 对比章节](../README.md#与-freenote--patchxnote-的录音处理策略对比)。

PatchxNote 的依据是本机 1.0.2（21）安装包配置和二进制符号，未取得完整源码；不能确认所有机制默认开启或完整调用顺序。相同 ASR 模型不代表相同切块、上下文或结果，已完成统一代码的四来源模型公开样例对照，尚未完成两个应用完整流程的同音频质量对照。

## 用户流程

在「我的录音 → 分人语音条」选择转写语言和说话人数（默认自动）：

- 会话列表的「导入音频并新建会话」通过系统文件选择器读取一个文件，用 FFmpeg 在本地解码，支持 MP3/WAV/M4A/FLAC/OGG/AAC/Opus。不经过页面整文件解码，单文件最多 2 GiB、单次总时长最多 4 小时。
- 「解析待处理录音」只处理当前会话尚未解析的素材，支持 1–2000 个。全部片段共享本次任务的声纹中心，同次麦克风录音的连续保存块会拼接后解析，30秒保存边界不作为发言边界；不同录音批次不会拼接。不同源文件的时间轴各自独立。
- 麦克风停止后自动处理本次保存的片段，拼接后分人、拆条并转写。原保存块和拼接音频保留；保存失败时先重试，全部保存成功再解析。语音过短无法提取声纹时保留“不确定”并尝试转写。
- 任务显示阶段进度，可以取消。在会话内添加文件或录音，完成后保存到同一会话，新建音频分组，标题和会话标识保持不变。只有列表导入才创建会话，标题不再自动叠加后缀。解析成功后，原录音保存块归档但资产保留，并记录到音频来源；原保存块的人工笔记保留在原始音频区。新音频候选说话人分配不冲突的标签，不自动匹配到旧人物。历史独立会话暂不自动合并。
- 每条有可播放音频、原来源和起点、候选说话人 A–H 或「不确定」。拆条后自动转写原文；说话人仍标记为候选，之后可校正时间段、名称和文字。支持按说话人筛选，取消分页与展开更多，全部条目内联滚动；高度可调，侧边纵向滑块显示位置并支持拖动跳转，一键回到列表顶部。播放器使用 preload="none"。

说话人标签仅在单次任务内有效，不确认真人身份，不创建可跨任务追踪的声纹档案。短插话和重叠发言仍可能归错；这不是音源分离。文字不会自动作为用户确认的表达提交语言纠错。

## 对话记录与说话人备注

结果按原音频文件分组，以紧凑的中性色聊天记录呈现：每条有原来源的起止时间（精确到毫秒）、可播放语音和下方识别文字。点击顶部说话人卡片，可填写备注名与说明；备注保存在当前会话，立即同步到所有发言行、说话人筛选和 `transcript.txt` 导出。别名不修改底层声音分组，也不代表已确认身份或时间区间。

列表和详情显示创建时间、最后更新时间。最后更新汇总会话、片段、原文件的更新时间。文字人工修订后直接显示修订版本，原机器分句不重复显示。未确认的候选也可直接转写，编辑控件在每条下方展开。说话人可勾选一位或多位已有标签，也可输入新名称后选中；点击确认才保存。多人标签分别保存，不合并成新身份。“暂不确定”不能与具体人同时勾选。

## 策略

1. **统一输入**：FFmpeg 转为16 kHz单声道PCM。每个源单独解码，超过总时长即失败。
2. **VAD**：优先使用已登记的 Silero；仅有 FSMN 时使用 funasr-onnx 的 FSMN。Silero 阈值0.5、最短静音350 ms、最短语音250 ms、最长检测段30秒。选择会写入结果，不声称两种VAD会产生相同边界。
3. **声纹**：CAMPPlus，3秒窗口、约1.5秒步长，对每个向量做L2归一化。小于650 ms的区间保留为不确定；650–1500 ms的声纹只参与分配，不参与建立中心。
4. **人数与聚类**：最多抽样1200个不少于1.5秒的窗口。对2–6类进行固定随机种子42、10次初始化的KMeans；排除极小簇，比较余弦轮廓系数，低于0.25时退回一人。可手动指定1–8人。用全部稳定窗口训练最终中心，对全部声纹按余弦相似度分配。
5. **平滑与时间对齐**：只在同一VAD区间内消除被同一标签包围的单窗口跳变。换人点取相邻窗口中心的中点，这是近似边界，不是字级对齐。
6. **短语音条**：同一来源内，相同标签且间隔不足650 ms的区间合并。长于18秒时在第8–16秒内搜索160 ms窗口的最低能量位置切开，保留覆盖和顺序。没有单独把问答/语义句子作为硬边界。
7. **转写**：客户端在拆条流程中自动识别候选区间，用户无需先确认；重新转写采用已保存的校正区间，尚未保存的编辑仍须先保存。SenseVoice INT8，4个CPU线程，按用户语言选项推理，启用ITN。每条音频和文字使用同一采样区间，避免将邻条文字复制进来。
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

`workers/speaker_pipeline.py` 是试验复现入口，默认包含自动转写；客户端传入 `transcribe: true`，自动识别原文。CLI 测试可传 `transcribe: false` 只生成候选分段，客户端不提供此模式。接收JSON标准输入，也支持 `--request /absolute/request.json`：

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
