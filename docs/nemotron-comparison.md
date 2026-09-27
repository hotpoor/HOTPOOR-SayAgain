# NVIDIA Nemotron 3 独立分人对比

2026-09-27。Electron「我的音频」新增两个独立选择：CAMPPlus 原有模式、带 NVIDIA 官方 Logo 的 Nemotron 3 实验对比。默认仍为 CAMPPlus。

## 使用

- 导入文件或开始录音前选择分人模式。NVIDIA 模式自动估计最多8人，每次处理一份完整音频；连续麦克风保存块会先拼接。
- 已解析文件标题旁可点击「用 NVIDIA 对比」或「用原有模式对比」。复用该文件的原始音频，在同一会话追加独立文件分组，不覆盖已有片段、人物关联或人工修订文字。
- 文件分组显示模式、处理秒数；NVIDIA 结果还显示实际设备、PyTorch 分配的 GPU 峰值内存。旧结果没有计时时不补造数据。
- 两路均使用已登记的 SenseVoice 权重和原始转写语言，差异集中在分人、分段；A/B 等声音编号在各次任务中独立，不能当作跨运行身份对齐。
- 重叠发言通过非重叠时间区间上的多说话人列表保存，混合音频只转写一次。没有做音源分离，不能声称混合音轨上的每个词已准确归属到人。
- 失败显示原因且不回退另一模型；取消和失败不写入部分结果。

## 模型与环境

[官方模型卡](https://huggingface.co/nvidia/Nemotron-3-Diarization)。固定模型 revision：`f667ed73aee57d40cc39428eb768b4fd87a0a29e`。仅下载 config、processor 配置、safetensors 和 README；推理禁用远程代码、使用本地文件和离线模式。

`workers/nemotron_pipeline.py` 使用 Transformers 官方流式 speaker cache，以 `low_latency` 配置处理文件。这里是停止录音后的批处理入口，不宣称客户端已提供实时字幕。音频统一为16kHz单声道；自动人数不接受手工人数约束。每次最多4小时、10000个短片段；最长音频边界未作4小时实测。

新环境须具备 Python 3.10+、PyTorch、支持 Nemotron3Diarization 的 Transformers、sherpa-onnx、soundfile、librosa。Windows 本机验证使用 Python 3.10、torch 2.11.0+cu128、Transformers 5.18.0.dev0、sherpa-onnx 1.13.8、librosa 0.11.0。本次 Transformers 按官方模型卡指示从上游 main 源码安装，未来安装需重新验证版本兼容性。

在独立环境中执行：

```text
python scripts/setup-nemotron.py --user-dir <客户端数据目录> --model-dir <模型保存目录> --device cuda
```

安装器保留原模型登记并备份 runtime.json，只将新模型登记为「已下载，待推理验证」。可指定 cpu，但本次只实测 CUDA。现有轻量模式使用原 Python 环境。

## 验证与实际限制

- Node 94 项测试通过；原 Python 分人逻辑4项、新模式时间线逻辑3项通过。
- Electron 测试覆盖模式切换、Logo 加载、结果标签、对比入口、缺少模型的明确错误、原结果保留。UI 截图使用模拟数据，不能作为模型准确率证据。
- `scripts/verify-nemotron.cjs` 在隔离工作空间用已有22.808秒双人测试音频实际运行两路，验证原片段未被修改。结果：CAMPPlus 7.913秒、2人、3条；Nemotron 21.443秒、2人、5条，CUDA 分配峰值415653376字节（约396MiB）。包含启动、解码、分人、SenseVoice转写和权重指纹计算，不是纯模型吞吐量；原模式在CPU，新模式分人用GPU，不能当同硬件基准。
- 该样例没有检测出重叠区间。重叠标签的数据结构及时间扫描经过单元测试，真实抢话质量、短插话召回、长会话稳定性、CPU和iOS性能仍待评测。没有人工逐词/逐帧标注，不报告准确率提升。
- 重启应用后使用新入口。iOS 本轮未修改。

Logo 原始文件及出处见 [Logo 记录](logos/README.md)。
