# SenseVoice 四来源公开样例实测

核验日期：2026-09-25。输入为官方模型包内公开 en.wav、zh.wav、yue.wav；未使用私人录音。四来源、三种语言、ITN 开关共 24 次推理均成功。来源、完整文件指纹、统一推理条件及禁网测试边界见 [模型来源证据](model-provenance.md)。

以下为统一特征提取、模型推理与 CTC 解码后的可读文本，已去除特殊标签和 SentencePiece 分隔符，没有应用正则处理、外部大小写转换或 AI 润色。此表不是各原应用的最终展示文本，也不代表整体识别准确率。

## 原样输出

### en.wav

| 来源 | ITN 关 | ITN 开 |
| --- | --- | --- |
| 官方通用 INT8（2024-07-17） | the tribal chieftain called for the boy and presented him with fifty pieces of code | The tribal chieftain called for the boy and presented him with 50 pieces of code. |
| 官方粤语微调 INT8（2025-09-09） | THE TRIVBAL CHIEF THIN CALLED FOR THE BOY AND PRESENTED HIM WITH FIFTY PIECES OF COOD | THE TRIVBAL CHIEF THIN CALLED FOR THE BOY AND PRESENTED HIM WITH FIFTY PIECES OF COOD |
| Freenote / PatchxNote 内置 | the tribal chieftain called for the boy and presented him with fifty pieces of code | The tribal chieftain called for the boy and presented him with 50 pieces of code. |
| 闪电说：官网指向的量化 ONNX | the tribal chieftain called for the boy and presented him with fifty pieces of gold | The tribal chieftain called for the boy and presented him with 50 pieces of gold. |

### zh.wav

| 来源 | ITN 关 | ITN 开 |
| --- | --- | --- |
| 官方通用 INT8（2024-07-17） | 开饭时间早上九点至下午五点 | 开饭时间早上9点至下午5点。 |
| 官方粤语微调 INT8（2025-09-09） | 开放时间早上九点至下午五点 | 开饭时间早上九点至下午五点 |
| Freenote / PatchxNote 内置 | 开饭时间早上九点至下午五点 | 开饭时间早上9点至下午5点。 |
| 闪电说：官网指向的量化 ONNX | 开饭时间早上九点至下午五点 | 开饭时间早上9点至下午5点。 |

### yue.wav

| 来源 | ITN 关 | ITN 开 |
| --- | --- | --- |
| 官方通用 INT8（2024-07-17） | 呢几个字都表达唔到我想讲嘅意思 | 呢几个字都表达唔到我想讲嘅意思。 |
| 官方粤语微调 INT8（2025-09-09） | 呢几个字都表达唔到我想讲嘅意思 | 呢几个字都表达唔到我想讲嘅意思 |
| Freenote / PatchxNote 内置 | 呢几个字都表达唔到我想讲嘅意思 | 呢几个字都表达唔到我想讲嘅意思。 |
| 闪电说：官网指向的量化 ONNX | 呢几个字都表达唔到我想讲嘅意思 | 呢几个字都表达唔到，我想讲嘅意思。 |

英文样例里，通用/Freenote 输出 code，闪电说量化文件输出 gold，粤语版出现全大写和额外误识别；中文样例里 ITN 可改变数字形式及个别词，不能视为只改格式。粤语样例文字主体接近，但标点不同。这些均只描述本次样例，不推广为整体质量结论。
