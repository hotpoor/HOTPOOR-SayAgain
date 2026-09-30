# 本地声音复现实验

用紧凑人物音色条对照「原声 → 目标音色参考 → 生成结果」。支持上传音频、人物头像、姓名和描述；示范音频经 SenseVoice 转写后可校对，再用已安装的 Qwen3-TTS 1.7B Base 克隆目标音色生成同语言语音。结果可试听、下载，保存原始生成参数并复用相同输入的已完成结果。

这是独立实验页面。**当前模型只接收生成文字与目标音色参考，示范录音的情绪、重音、停顿没有直接传给合成模型。**人物描述只用于资料展示。它不是 SeamlessExpressive 或 Voice Conversion 的验证结果，也不宣称完整复现表演。

## 在当前 Windows 工作区运行

从仓库根目录执行：

```powershell
& ../speaker-local/sayagain-input-venv/Scripts/python.exe experiments/voice-studio/server.py
```

打开 `http://127.0.0.1:8768`。服务器只监听本机。复用 `speaker-local/sayagain-input-venv`、`qwen-tts-local/.venv`、`qwen-tts-local/models/Qwen3-TTS-12Hz-1.7B-Base` 和应用自带 FFmpeg；默认运行目录为仓库外的 `seamless-local/studio-data`，可用 `--data-dir` 指定。环境不存在时明确报错，不自动下载。路径按本机工作区约定配置，未验证其他机器或平台。

公开中、英、日样例来自现有 SenseVoice 模型的 `test_wavs`，不隐式选取用户私人录音。首次打开预置中文内容和英文音色参考。已有相同样例的生成结果时直接展示。上传限制 20 MB、1–60 秒；音色参考至少 3 秒，建议 10–20 秒。音频经 FFmpeg 转为 24 kHz 单声道，原上传内容只作临时解码，成功后的 WAV 留在本机。

点击「从录音识别文字」，校对结果，再点击生成。示例文字使用前一轮对照确认过的中文表达；SenseVoice 实测仍会将「开放时间」识别为「放时间」，不能省略人工校对。

生成一次最多 300 字、10 分钟超时，仅允许一条 GPU 任务同时运行。重复请求同一组输入复用运行中的任务或成功缓存；失败需用户明确重试。失败日志仅在本机实验目录保存。API 检查本机 Host、Origin 和会话令牌；不开放外网访问。

人物音色资料使用浏览器本地存储，头像仅在当前页保留。生成参数与输出保存在实验目录；源录音和目标音色更换后，已有生成结果仍显示其原参数。没有通用数据迁移、任务取消、安装包或产品发布流程。

## 2026-09-30 实测

- RTX 3090 / CUDA / Qwen3-TTS-12Hz-1.7B-Base，用 7.152 秒公开英文参考合成中文「开放时间早上九点至下午五点。」。
- 包含独立 worker 启动和模型加载，84.425 秒生成 3.68 秒、24 kHz PCM16 WAV。不是纯模型推理吞吐量。
- 使用空参考原文，即 `x_vector_only_mode=True`。没有冒充已核实的英文参考逐字原文。
- 页面真实调用、有效音频生成、播放进度推进、下载入口、736/360 像素布局与无 JavaScript 异常通过检查。
- 生成结果经 SenseVoice 回转写为「开放时间早上九点至下午五点」，没有明显漏词；这属于机器内容核查，不替代人工听感或音色相似度评估。相同生成输入重启后复用成功缓存，浏览器实测约 4 毫秒返回，无额外 GPU 生成。
- `verify.py` 检查真实上传解码、CPU 转写、坏音频、无效 ID、缺少令牌和外部 Host/Origin 拒绝。
- 尚未人工验收音色相似度或自然度；不提供情绪保持或跨语言韵律保持指标。

已启动服务器时，可运行接口检查（不发起 GPU 生成）：

```powershell
& ../speaker-local/sayagain-input-venv/Scripts/python.exe experiments/voice-studio/verify.py
```
