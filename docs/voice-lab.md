# 音色实验

桌面端在「我的音色」中提供「音色实验」。选择已有音色和参考录音，输入一句话，按所选模型支持的方式调整表达，再生成一条独立语音。

实验不创建表达回顾记录，不修改默认音色、默认参考样本或默认合成模型。每次提交生成新的实验记录，方便比较同一句话的不同版本；历史按提交时间倒序排列，保留文本、模型、参考样本和表达方式，并支持播放、导出及取消任务。

## 模型与表达方式

| 模型 | 实验控制 |
| --- | --- |
| 本地 Qwen3-TTS Base | 文本、语言及参考样本；没有独立情绪指令 |
| 本地 IndexTTS 2.5 | 八种情绪及强度；需要先配置完整本地运行环境 |
| Qwen-Audio 3.0 Plus / 3.0 Flash / 3.1 Flash | 自由编辑说话方式，常用标签填入描述 |
| 支持指令的 CosyVoice 版本 | 自由编辑说话方式，常用标签填入描述 |
| MiniMax Speech | 该模型支持的情绪选项 |
| 云端 Qwen3-TTS VC、其他无控制接口的版本 | 文本、语言及参考样本 |

Qwen-Audio/CosyVoice 使用 `input.instruction`；MiniMax 使用 `input.voice_setting.emotion`。参数与实际选择一起保存。Qwen3-TTS Base 不会接收其他模型留下的情绪参数。

IndexTTS 的八种情绪配比总和不得超过 100%，避免混合时出现负的参考权重；页面、主进程与 worker 都会检查，不会自动改写配比。整体强度单独传给模型。全部配比为零或强度为零时，保留参考录音的说话状态，不代表强制中性声音。

模型的接口能力与实际生成效果分开判断。兼容平台可能拒绝某些参数或模型版本，任务会保留错误，不会静默更换模型、删除情绪参数后重试或重复付费调用。

## 参考录音

复用已有参考录音，不要求录齐各种情绪。优先使用单人、清晰的自然说话，并校对录音原文。本地 Qwen Base 的参考文字为空时沿用仅提取说话人特征的模式。

云端沿用现有主动启用与发送确认流程；选中的参考录音和待生成文本会发送至当前配置的平台。浏览实验页、切换模型或点击情绪标签不会发起合成、上传或下载。

## 本地运行环境

Qwen Base 复用现有本地 TTS 运行环境。IndexTTS 2.5 使用独立运行环境，不改动 Qwen 的配置；缺少环境或权重时保留未配置状态。仅有 IndexTTS 2.0 源码不能作为 2.5 环境登记。

本功能不自动下载模型。登记已有完整 IndexTTS 2.5 环境的方法及检查项见 `scripts/register-index-tts.cjs --help`。当前本地安装使用的固定版本和组件见 [IndexTTS 2.5 环境](index-tts-local.md)。

## 验证边界

后端测试用模拟模型输出和模拟云响应检查参数、任务、持久化与错误处理；桌面检查使用独立的临时数据目录，不读取真实 API Key，不上传个人参考录音。

模拟测试通过只证明接入逻辑，不能代替真实模型合成或真人试听。新增模型需要单独验证实际可用性、字词准确性、音色相似度和情绪表现。

## 接口依据

- [Qwen3-TTS 官方模型与复刻接口](https://github.com/QwenLM/Qwen3-TTS)
- [IndexTTS 官方 2.5 推理接口](https://github.com/index-tts/index-tts)
- [阿里云语音合成与指令控制](https://help.aliyun.com/zh/model-studio/realtime-tts-user-guide)
- [当前兼容平台的语音合成接口](https://platform.qianwenai.com/docs/developer-guides/speech/tts)
- [MiniMax Speech API](https://platform.minimax.io/docs/api-reference/speech-t2a-http)
