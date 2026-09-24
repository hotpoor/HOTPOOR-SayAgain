# Qwen 语音接入

## 在空间不足的电脑上使用云端

1. 启动客户端，完成母语和目标语言设置。
2. 点击侧栏「设置」，顶部「Qwen 云端 · 音色克隆与语音生成」就是 AK 配置入口。
3. 点「打开 Qwen 平台 ↗」前往 https://platform.qianwenai.com/ 获取平台 API Key（AK）。此语音接口不需要应用名称。
4. 选择云端、粘贴 AK、勾选「主动启用云端合成」，保存语音设置。保存本身不发起付费请求。
5. 在「我的音色」添加录音并设置默认样本；建议清晰朗读 10–20 秒。当前客户端接受 10–60 秒、10 MB 内、24 kHz 及以上单声道 PCM16 WAV。新录音和导入音频会转换为单声道 PCM16 WAV。
6. 在表达右侧点击「生成语音」，选择音色并确认发送该参考录音和文字。任务成功后显示波形、播放与慢速入口；失败显示错误，可手动重试。

没有有效录音、有效 AK 或平台额度时，不能完成真实合成。接口适配已用模拟响应测试；当前未验证真实用户声音的克隆听感，也未发起付费请求。

## 凭据与请求

- API Key 由 Electron safeStorage 系统加密，文件位于应用用户目录的 `qianwen-api-key.enc`。只向页面返回“是否已保存”；输入框保存后清空，不回显密钥。
- AK 不写入 SQLite、日志、音频下载请求或备份。项目 `.secret` 是用户单独保存的私密文件，Git 忽略，不自动导入客户端。
- 清除密钥或关闭云端时取消未完成任务。已经发出的请求可能仍由平台计费。
- 固定 API 地址 `https://maas.qianwenaiapi.com/api/v1`；音色创建使用 `qwen-voice-enrollment`，target_model 和生成 model 均为 `qwen3-tts-vc-2026-01-22`。
- 同密钥、模型和参考音频复用云端音色；相同合成输入复用已保存音频。中断后不自动重试付费请求。

平台文档：[音色克隆](https://platform.qianwenai.com/docs/developer-guides/speech/voice-cloning)、[语音合成](https://platform.qianwenai.com/docs/api-reference/speech-synthesis/qwen-tts)。

## 本地模型

`npm run tts:check` 检查磁盘；`npm run tts:install` 仅在预检通过后安装。首次安装要求预留 10 GiB，这是包含依赖和缓存的预算，不是模型本身大小或官方硬件最低要求。空间不足会退出且不下载模型；已安装环境另预留 512 MiB 用于合成。

模型固定为 Qwen/Qwen3-TTS-12Hz-0.6B-Base；模型约 2.52 GB。Python 仅用于独立 TTS worker，Electron 页面和存储使用 JavaScript。当前机器未安装或验证本地推理，CPU 为保守默认后端。

## Skill 接入

在设置中启用 Skill 接入，再让自己的客户端读取仓库 `skills/sayagain/SKILL.md`。`npm run skill:context` 可检查本地上下文。接入仅监听随机本机端口，连接描述文件含会话令牌并设为仅用户可读写，不进入备份。

Skill 提交结构化评估与回执，保存被选中的表达片段，不保存整条来源消息。可选 `skills/sayagain/scripts/prompt-hook.cjs` 用于宿主 UserPromptSubmit 提醒；未自动安装全局钩子或改变信任设置，也不宣称每轮必达。宿主接入和每轮回执需后续单独验证。
