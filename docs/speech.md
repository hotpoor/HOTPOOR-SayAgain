# Qwen 语音接入

## 在空间不足的电脑上使用云端

1. 启动客户端，完成母语和目标语言设置。
2. 点击侧栏「设置」，顶部「Qwen 云端 · 音色克隆与语音生成」就是 AK 配置入口。
3. 点「打开 Qwen 平台 ↗」前往 https://platform.qianwenai.com/ 获取平台 API Key（AK）。此语音接口不需要应用名称。
4. 选择云端和默认云端模型，在 Key 列表粘贴 AK 并备注名称；可点「添加 Key」保存多个，选中「用于生成」的一项。勾选「主动启用云端合成」，保存语音设置。保存本身不发起付费请求。
5. 在「我的音色」添加录音并设置默认样本；建议清晰朗读 10–20 秒。当前客户端接受 10–60 秒、10 MB 内、24 kHz 及以上单声道 PCM16 WAV。新录音和导入音频会转换为单声道 PCM16 WAV。录音时显示实时波形；停止后可拖动起止滑块、试听选段或恢复全段。保存会实际裁剪音频，外部原文件不变。裁掉朗读内容时需同步修改录音原文。

默认朗读文案跟随设置中的母语，当前中文为原创日常叙述，并提供其他已支持母语的对应文案。文案独立维护在 `renderer/reading-prompts.js`；没有预置文案的语言显示提示，不替换成目标语言。Skill 动态替换文案是后续功能，本次未提供运行时替换接口。
6. 在表达右侧点击「生成语音」，可选择本次生成模型（不改变默认模型），选择音色并确认发送该参考录音和文字。任务成功后显示波形、播放与慢速入口；失败显示错误，可手动重试。

没有有效录音、有效 AK 或平台额度时，不能完成真实合成。13 款模型接口适配已用模拟响应测试；Qwen3-TTS VC 和 Qwen-Audio 3.0 TTS Plus 已完成真实合成（各 3.68 秒），其余 11 款尚未逐一实测，尚未评价音色相似度。云端流式 WAV 的未知长度头会规范化，保持 PCM 音频数据不变；真正截断的普通 WAV 仍报错。解析失败的完整下载保留在应用目录 tts-downloads，同一任务重试会复用，成功后清理。

## 凭据与请求

- API Key 按用户选择明文保存，文件位于应用用户目录的 `qianwen-api-keys.secret`，权限为 0600。不依赖系统钥匙串。旧版加密密钥需要重新填写保存一次。常规状态只返回是否配置；设置页会加载完整 Key 列表，默认显示真实内容，每行可独立显示/隐藏。刷新和重开会恢复名称、Key 与当前选择。原单 Key 明文文件自动作为默认条目读取，保存时迁移到列表。删除条目后需保存语音设置；删完所有 Key 会关闭云端。
- AK 不写入 SQLite、日志、音频下载请求或备份。项目 `.secret` 是用户单独保存的私密文件，Git 忽略，不自动导入客户端。
- 清除密钥或关闭云端时取消未完成任务。已经发出的请求可能仍由平台计费。
- 固定 API 地址 `https://maas.qianwenaiapi.com/api/v1`。Qwen3-TTS VC 使用 `qwen-voice-enrollment` 与 multimodal-generation；Qwen-Audio 使用 `voice-enrollment` 与 SpeechSynthesizer，参考录音通过平台临时 OSS 上传接口提交。上传请求不携带 API Key，音色创建时启用 OSS 资源解析。
- 支持 13 款：Qwen-Audio 3.0 Plus / 3.1 Flash / 3.0 Flash；Qwen3-TTS VC 2026-01-22 / VC Realtime 2026-01-15；CosyVoice v3.5 Plus / v3.5 Flash / v3 Plus / v3 Flash；MiniMax speech-2.8-hd / speech-02-hd / speech-2.8-turbo / speech-02-turbo。设置页用分组勾选列表保存默认模型，生成窗口可单次覆盖，或勾选「同时设为默认模型」。任务保存选定模型，后续更改设置不影响排队任务和历史标注；不同模型分别创建音色、缓存音频。
- 同密钥、模型和参考音频复用云端音色；相同合成输入复用已保存音频。中断后不自动重试付费请求。

平台文档：[音色克隆](https://platform.qianwenai.com/docs/developer-guides/speech/voice-cloning)、[语音合成](https://platform.qianwenai.com/docs/api-reference/speech-synthesis/qwen-tts)。

## 新增接口与界面

CosyVoice 复用 voice-enrollment / SpeechSynthesizer；MiniMax 通过平台临时上传、voice_clone 与非流式 hex WAV 合成接入。MiniMax 首次使用新克隆音色有解锁费用，界面标明当前目录价 ¥9.9，另计试听与合成，实际按平台账单。

Qwen3-TTS VC Realtime 使用鉴权 WebSocket，收齐 session.finished 前的 PCM 才保存 WAV；中断、超时或取消不标记成功。此版本生成完成后播放，不提供边生成边播放。

左侧导航、右侧内容、模型列表和弹窗内容分别滚动，顶部栏与弹窗操作区保留在各自区域。

接口参考：[MiniMax](https://platform.qianwenai.com/docs/api-reference/speech-synthesis/minimax-tts)、[实时 Qwen-TTS](https://platform.qianwenai.com/docs/api-reference/speech-synthesis/qwen-tts-realtime/websocket-api)。

## 本地模型

软件只提供提示、运行模式配置和语音调用，不内置权重、不在切换模式时下载。模型下载、独立环境安装、硬件检查和运行验证由用户授权的 SayAgain Skill 执行；优先复用已有环境。

`npm run tts:check` 检查磁盘；`npm run tts:install` 仅在预检通过后安装。首次安装要求预留 10 GiB，这是包含依赖和缓存的预算，不是模型本身大小或官方硬件最低要求。空间不足会退出且不下载模型；已安装环境另预留 512 MiB 用于合成。

默认安装脚本固定为 Qwen/Qwen3-TTS-12Hz-0.6B-Base（模型约 2.52 GB），并非限制只能使用该模型。已有环境注册支持 0.6B/1.7B Base 与 CPU/CUDA/MPS；Windows 本机 1.7B + CUDA 已完成一次真实合成和缓存复用验证，其他组合未在本机测速。Python 仅用于独立 TTS worker，Electron 页面和存储使用 JavaScript。

## Skill 接入

在设置的 Skill 接入区启用本地接口，再点击「复制完整 Skill」粘贴给其他客户端，或「导出完整 Skill」复制整个文件夹到宿主支持的技能目录。包包含说明、协议、调用脚本、本地模型检查/安装/注册脚本，无需原仓库路径。需要同机运行 SayAgain、Node.js 22+ 与宿主执行本地命令的能力。接口启用不代表宿主安装成功；先读 context，再以评估回执确认实际调用。`npm run skill:context` 可检查本地上下文。接入仅监听随机本机端口，连接描述文件含会话令牌并设为仅用户可读写，不进入备份。

Skill 提交结构化评估与回执，保存被选中的表达片段，不保存整条来源消息。可选 `skills/sayagain/scripts/prompt-hook.cjs` 用于宿主 UserPromptSubmit 提醒；未自动安装全局钩子或改变信任设置，也不宣称每轮必达。宿主接入和每轮回执需后续单独验证。


## 复用现有环境（Windows / CPU / CUDA）

已有 Qwen3-TTS Base 权重和 Python 环境时无需再次下载。关闭客户端后运行：

```sh
node scripts/register-local-tts.cjs --python <Python绝对路径> --model-path <模型绝对路径> --device cuda:0
```

支持 0.6B Base 和 1.7B Base，设备可为 cpu、cuda:0 或 mps。注册器核实 Python 依赖和加速设备可用性，为模型文件计算指纹，并备份原 runtime.json；不修改已有 Python 环境。设置页显示实际模型和设备，以及 0.6B/1.7B × CPU/GPU 四种部署组合。CPU 无需独显；GPU 要求兼容环境。模型更大不等于每条语音必然更好，不承诺统一速度或显存下限。注册成功不等于完成音频质量验证。

模型、修订、设备均参与缓存标识；切换模型不会误用旧模型音频。CUDA 使用 bfloat16 和 SDPA。原安装器仍默认安装 0.6B CPU。

Windows 文件刷新使用可写句柄；0600 是 POSIX 模式，Windows 实际权限继承用户目录 ACL，不能宣称 chmod 提供同样的权限隔离。
