# 语音识别模型：名称、来源与核验证据

核验日期：2026-09-25。客户端「设置 → 语音识别模型」与「我的音频」展示同一份记录。这里是样本来源说明，不是当前机器的模型自动识别结果，也不是模型下载或切换入口。

应用名称、模型包名称、模型本身的公开名称与 ONNX 导出格式分别记录。仅凭名称不同，不推断自行训练、微调或产品之间的技术来源关系。

## 官方通用版

- 应用或发布包标识：sherpa-onnx · 2024-07-17 · INT8
- 公开模型：SenseVoiceSmall 通用模型
- 文件：`model.int8.onnx`
- 大小：239233841 字节
- SHA-256：`c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51`

官方发布的通用 INT8 导出文件。开启 ITN 时支持标点；支持中、英、日、韩、粤语。日期是导出包标识。

官方发布包通过大小及 SHA-256 校验，再对包内模型计算完整指纹。

[sherpa 官方模型说明](https://k2-fsa.github.io/sherpa/onnx/sense-voice/pretrained.html) · [官方通用版下载](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2)

## 官方粤语微调版

- 应用或发布包标识：sherpa-onnx · 2025-09-09 · INT8
- 公开模型：ASLP-lab / WSYue-ASR · SenseVoiceSmall 粤语微调
- 文件：`model.int8.onnx`
- 大小：237115547 字节
- SHA-256：`12ca1a2ae7ecf3e0019ef2822307ee0b5cadc9196569e379b4c4026f8205276d`

官方说明：在通用模型上使用粤语数据微调，仍支持五种语言；该版不支持标点。

官方发布包通过大小及 SHA-256 校验，模型元数据标明 ASLP-lab / WSYue-ASR。

[sherpa 官方模型说明](https://k2-fsa.github.io/sherpa/onnx/sense-voice/pretrained.html) · [官方粤语版下载](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2)

## Freenote / PatchxNote 内置样本

- 应用或发布包标识：PatchxNote 1.0.2（21）· patchnote-standard 0.2.0
- 公开模型：同一份官方 SenseVoiceSmall 通用 INT8 模型
- 文件：`model.int8.onnx`
- 大小：239233841 字节
- SHA-256：`c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51`

Freenote / PatchxNote 也选用了相同的官方通用模型，并将其集成到商业化产品中。已验证的标点等能力在上游模型直接推理中已有体现，不能归因于厂商独立微调。

本次核对的内置文件与官方 2024-07-17 通用 INT8 文件完整 SHA-256 相同。仅说明文件一致，不推断产品之间的技术来源关系。

[sherpa 官方模型说明](https://k2-fsa.github.io/sherpa/onnx/sense-voice/pretrained.html) · [官方通用版下载](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2)

## 闪电说官网推荐的量化版

- 应用或发布包标识：应用显示 SenseVoice Small · 本地；文件名 model.onnx
- 公开模型：iic / SenseVoiceSmall-onnx · 官方量化导出
- 文件：`model_quant.onnx → model.onnx（按官网说明更名）`
- 大小：241216270 字节
- SHA-256：`21dc965f689a78d1604717bf561e40d5a236087c85a95584567835750549e822`

ONNX 是模型导出格式。此样本从官网指向的 iic 官方模型库手动安装；文件更名不改变内容。

大小及 SHA-256 与官方模型库一致。文件提交日期 2024-09-25，修订 4e95991ddb34c70e9b94f026d62ac82a9d941ae1；不是训练日期。尚未核对闪电说自动下载的默认文件。

[闪电说官网量化说明](https://shandianshuo.cn/docs/faq/memory-quantized-model) · [iic 官方 ONNX 模型库](https://modelscope.cn/models/iic/SenseVoiceSmall-onnx/files)

## 核验结论及范围

Freenote / PatchxNote 也选用了相同的官方 SenseVoice 通用模型。本次官方通用与 Freenote 的完整模型文件指纹相同；四个来源实际对应三份不同文件。包名 patchnote-standard 0.2.0 不是模型训练版本号。

闪电说样本依照官网量化说明，从 iic/SenseVoiceSmall-onnx 下载 model_quant.onnx 并改名为 model.onnx。官方文件修订为 4e95991ddb34c70e9b94f026d62ac82a9d941ae1，文件提交时间为 2024-09-25 11:30:27 UTC。提交时间不等于训练或首次发布日期。ONNX 是导出格式，不是微调版本号。尚未核对应用自动下载文件，不能将手动样本结论推广至所有闪电说安装。

官方两份 sherpa 下载包的发布方 SHA-256：

| 发布包 | SHA-256 |
| --- | --- |
| 2024-07-17 通用 INT8 | `7d1efa2138a65b0b488df37f8b89e3d91a60676e416f515b952358d83dfd347e` |
| 2025-09-09 粤语 INT8 | `7305f7905bfcf77fa0b39388a313f3da35c68d971661a65475b56fb2162c8e63` |

同一套 ONNX Runtime 1.30.0 CPU 代码（4 线程、统一特征提取及 CTC 解码），对官方公开中、英、粤样例分别关闭/开启 ITN，完成 24 次推理。官方通用与 Freenote 输出 token 一致；通用模型的 6 个输出与独立 sherpa-onnx 调用一致。禁止测试进程访问网络后，四来源英文样例 × ITN 开关的 8 个结果仍一致。这是模型与测试脚本层面的验证，不是原应用完整链路或整机断网测试。

ITN 是模型内的文本规范化条件，可影响数字、标点和大小写，不等于外部 AI 润色。有限公开样例不足以评定各应用整体识别质量。日期、金额、小数、百分比、长数字专项评测仍待测试语音；不把尚未测试的能力写成结论。

本机 SayAgain Mac 当前登记文件与上述通用版一致；安装脚本指向的 2025-09-09 粤语包不同。其他安装需核对实际 runtime 与文件指纹，不能仅按应用名推断版本。模型权重、真实用户内容和录音不加入仓库。
