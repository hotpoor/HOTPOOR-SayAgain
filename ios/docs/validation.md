# iPad 移植验证记录

日期：2026-09-26。设备：iPad mini 3 / iOS 12.5.8；构建机：macOS 11.7.11 / Xcode 13.2.1。

## 已验证

- 前一轮真机测试成功：表达新增、保存、重启恢复、归档以及五个标签页切换。旧 Mac 结果包：`~/Developer/SayAgain-iPad/build/test-20260926-093822.xcresult`。
- 本轮 Node companion 自动测试通过，覆盖鉴权、输入验证、缺少服务时不回退云端、单任务与取消。
- Swift 资料模型测试通过：持久化、备份去重、桌面表达导入、路径越界拒绝、损坏资料保护。
- Python/Pillow 从官方 LOGO 重新导出 13 个图标尺寸；逐项核对 AppIcon Contents.json，所有尺寸正确、全部 RGB 无透明通道。已查看 152px 导出图，白底无黑边；最终桌面显示仍需真机确认。
- 通过旧 Mac 的 `192.168.100.101:8765` 入口调用实际转写模型：HTTP 200，约 5.1 秒，返回 1 个带时间与候选说话人 A 的片段。使用 macOS Samantha 合成的英文测试语音，无用户录音上传。模型为 SenseVoice INT8 + CAMPPlus + Silero，运行在新电脑 CPU。
- 测试语音为 “Hello. This is a SayAgain test. I practice English every day.”，识别结果为 “This is a say again test,I practice English every day.”。开头 Hello 未被识别，标点与专名存在差异；本次仅证明服务可以运行，不代表转写准确率或多说话人效果已充分验证。

## 待验证与功能限制

- 本轮修正版已安装到真机；解锁后，表达保存、重启恢复、归档、页面切换测试通过。结果包为 `test-20260926-104243.xcresult`。新增的 `testConfiguredCompanionConnection` 未通过：截图显示系统返回 “The Internet connection appears to be offline.”。待设备网络恢复后重测，不能把电脑端转写成功当作 iPad 端连接成功。
- 已增加中文网络错误提示，并将能力检查超时缩短至 15 秒；音频处理仍保留 600 秒。此修订已通过 Xcode 构建并由 ios-deploy 确认安装成功；网络恢复后的 API 真机验证仍待完成。
- 表达优化未配置文本 API；声音克隆未安装 Qwen3-TTS，均不宣称可用。
- 麦克风录音、用户实际录音转写、多说话人分离质量和长音频性能仍需后续真机验收。
- 当前 API 依赖新电脑 companion 服务、SSH 反向隧道和旧 Mac LAN relay 进程同时运行；未配置为开机自启动。两台电脑睡眠或隧道中断时 iPad API 功能不可用，离线资料不受影响。

## Electron 风格界面适配

- 复用桌面 CSS 中的白底、浅灰侧栏、黑色文字与主按钮、细边框和圆角。新增 iPad 侧栏、“记录一句话”入口和自适应原句/建议双栏。
- `test-20260926-110526.xcresult` 真机离线测试通过，覆盖表达保存、重启恢复、归档、侧栏页面切换及发出旋转请求；最终留白修订已在 `test-20260926-110650.xcresult` 通过同一离线测试。
- API 集成测试在本轮仍返回离线错误，与界面测试分开记录。界面对应现有 iPad 功能，不代表桌面功能全部移植。

- 最终截图已导出到 `screenshots/` 并查看。设备状态栏显示旋转锁定，名为 landscape 的附件仍是 1536×2048 竖屏，故不将旋转请求成功当作横屏布局已验证；横屏实际显示需关闭旋转锁定后确认。

## 独立音色录制

新增 VoiceRecorderVC：约 30 秒中文原创朗读稿、10–60 秒参考音频、试听、重录、原文校对和直接保存音色。Xcode 编译与真机安装成功，`test-20260926-111929.xcresult` 中 `testVoiceReadingSetup` 通过，覆盖入口、默认名称与稿件、没有音频时阻止保存和返回。未在自动测试中开启麦克风；实际采音、试听音质及满 60 秒停止仍待用户实录验收。

## 两端大模型 API 配置

- Node 9 项相关测试通过：服务 Key 隔离、旧配置迁移、地址变更保护、模型列表读取、Responses 解析及既有工作流。
- Electron `smoke-workflow-completion.cjs` 与 `smoke-text-models.cjs` 均通过。使用独立临时数据目录与本机模拟服务，验证真实设置界面、Key 遮蔽、模型读取、Responses 请求及表达优化，不调用付费服务。
- iPad Xcode 构建、安装成功，`test-20260926-113549.xcresult` 的 `testTextModelConfiguration` 通过：入口、服务切换、地址预填、安全 Key 输入。
- 真实账号的 `/models`、付费生成与 iPad 外网直连尚未验证；未自动复制其他项目 Key 或激活云服务。截图见 `screenshots/Electron-text-models.png` 和 `screenshots/SayAgain-iPad-text-models.png`。

## service-inference 双 AK 修正

- 按 Director 的 `backend/management.py`、`backend/inference.py` 和管理界面实现多管理 AK、多使用 AK、手动匹配、组织验证、模型查询、停用、删除保护和按绑定组织查询费用。
- 13 项相关 Node 测试通过，覆盖生成/管理凭据路由、Key 类型错误、缺少绑定、停用调用阻止、绑定中的组织变更拒绝、改绑删除、旧 Key 迁移、通用提供商及原工作流。
- Electron `smoke-inference-keys.cjs` 通过完整真实 UI 流程，使用独立测试数据及模拟服务：新增管理 AK、验证组织、新增使用 AK并绑定、费用查询、删除保护、实际 IPC 生成请求使用使用 AK。`smoke-text-models.cjs` 回归通过。
- 尚未使用真实双 AK 访问平台；测试中的组织、费用和模型均为模拟数据。

- iPad 修正版已安装，`test-20260926-120813.xcresult` 两项真机测试通过：双 AK 管理入口、添加管理/使用 AK、管理 Key 格式拒绝、无管理 AK 时禁止选择绑定，以及千问配置回归。未在真机填写真实 AK，远端组织验证和模型权限仍需实测。

### 多组千问配置（2026-09-26）
- 增加独立命名、创建、编辑、选择及删除；旧单组配置原位保留，不复制密钥。
- Node 针对两个不同 Key 验证重启后的当前选择、生成及模型列表的 Key 路由、改名、删除隔离、状态不泄漏密钥。相关测试合计 14 项通过。
- Electron UI 验证新增第二组、保存重开、切回首组、删除第二组仍保留首组；测试使用模拟 Key，无真实付费请求。
- iPad mini 3 / iOS 12.5.8 真机通过 2 项测试：新增两组千问配置、保存并重启恢复第二组、切换读取第一组、独立删除清理，以及服务入口回归。已安装本次更新。结果：`test-20260926-123034.xcresult`，0 failures。未使用真实千问 Key 联调。

### 范围纠正：账号归账号配置（2026-09-26）
上节多组千问文本配置属于需求理解偏差，入口已移除。当前 iPad 新增独立千问账号管理，只保存名称、Key 和当前账号，不调用任何平台接口。原 TTS 仍走电脑 API；未交付 iPad 千问直连合成。Electron 沿用原有 TTS 多 Key 设置，并阻止旧误配的千问文本账号继续调用表达优化。
- 真机 `testQwenAccounts` 与 `testTextModelConfiguration` 通过：两个账号独立保存、当前账号重启保留、编辑留空保留 Key、切换和删除，以及账号页不含模型字段、文本页移除千问。结果 `test-20260926-124337.xcresult`，2 项通过，iPad 已安装更新。
- Electron 文本入口检查通过；语音、AK 绑定与文本隔离回归共 34 项通过。未使用真实账号发起请求。

### 回顾 → 千问语音 → 本地文件（2026-09-26）
- 新增 QwenTTS.swift，复用 Electron 默认模型 qwen3-tts-vc-2026-01-22 的音色注册和生成接口。账号仍单独管理；从回顾读取当前账号、所选音色和优化文字。
- 合成结果检查可播放后原子写入本地音频文件并关联回顾，成功自动播放；播放和导出入口常驻。按参考音频、模型和 Key 指纹缓存远端音色；相同输入有本地结果时直接播放。Key 不发送给音频下载地址。
- Swift 模拟接口验证：音色注册→合成→下载、请求凭据隔离、音色复用、文件保存/重开/可解码、错误、取消、下载地址检查、保存失败回滚。原有 Model 持久化测试通过。
- iPad iOS12 真机测试 `testFirstReviewSpeechEntry` 通过，结果 `test-20260926-153424.xcresult`。实际已有回顾已进入正确账号/音色/原文的确认页；取消确认，未发起真实付费合成。新版已安装。当前只移植默认 VC 模型。

### iOS 阅读、语音控制与模型对齐（2026-09-26）
- 安装 TypeSafe skill，应用过程和边界记录在 `typesafe-review.md`。本次控件与显式选择无需语义推断，没有调用 TypeSafe API。
- 新增强类型 SpeechModel / SpeechFamily 与持久化 Preferences。全局字体缩放、播放音量和当前模型统一存储与通知更新；账号仍在 Keychain。
- 新增阅读卡片、SpeechPanel、模型勾选页、阅读播放偏好页；设置按账号、语言、电脑连接、备份分组。修复字体滑块取整后显示位置不同步以及字号放大后导航品牌被裁切。
- `python3 ios/scripts/test-tts.py` 通过：12 款 HTTP 模型路由、上传凭据/OSS multipart、目标克隆模型、MiniMax 十六进制音频、缓存隔离、音量/字号/模型持久化和边界，沿用文件保存、取消与错误测试。网络均为 URLProtocol 模拟。
- 真实 iPad iOS12 的 `testReadingPlaybackAndModels` 通过（最终 UI 版本：`test-20260926-223855.xcresult`）：字号/音量设置重启保留、模型勾选传入回顾页及确认框、播放控件存在。取消付费确认，未进行真实模型合成。
- Realtime 路径使用 iOS13+ URLSession WebSocket；iOS12 显示限制并阻止选择，其他12款可选。本轮未实际验证实时网络连接。横向自适应已实现；设备旋转锁定下未完成横屏实机验证。
- 本地播放真机测试 `testPlaybackControls` 通过，结果 `test-20260926-224049.xcresult`：打开已有4秒本地语音、操作播放/进度拖动/音量滑块，最后恢复字号与音量100%。新版已安装，未再次合成音频。

## 2026-09-26 — Review composition and real audio waveform

Compared the running Electron review screen, `docs/screenshots/review-desktop.png`, and the prior iPad speech-panel screenshot visually. Replaced fixed-height bordered expression fields with intrinsic-height reading text, a responsive original/improved/translation column and explanation/pattern/audio column. Speech configuration and secondary editing actions are expandable. Review rows now play existing local speech without opening the editor.

`AudioWaveform` decodes all channels of the local audio file in 4096-frame chunks off the main thread, reduces to 96 peak bins, and draws actual amplitude with played/unplayed portions and a playback cursor. Tapping/dragging seeks; VoiceOver adjustment is supported. Silent files stay flat and unreadable files do not get synthetic waveforms. Playback is paused when leaving its screen.

`python3 ios/scripts/test-waveform.py` passed: stereo channel peak, temporal bin positions, normalization, silence and missing-file failure. `testReviewWaveformLayout` passed on the iOS 12 iPad using an existing saved audio file: inline playback, waveform loaded state, seeking, detail playback, collapsed controls and model picker navigation. No paid synthesis was performed for this UI change.

Final device installation and screenshot inspection: `build/test-20260926-230414.xcresult`, `testReviewWaveformLayout`, 1 test / 0 failures. Prior combined regression bundles `test-20260926-230043.xcresult` (playback controls + review, 2/0) and `test-20260926-230214.xcresult` (font/volume persistence/model selection + review, 2/0) also passed. TTS mock regression passed all 12 HTTP routes. Captured final portrait screenshots in `screenshots/SayAgain-iPad-review-redesign.png`, `SayAgain-iPad-review-detail-redesign.png`, and `SayAgain-iPad-waveform-playing.png`; visually inspected the two-column layout, corrected table row-height whitespace, and verified real waveform progress. Physical landscape rotation was not tested.

## 2026-09-26 — First actual iPad-native SenseVoice run

Physical device: iPad mini 3 / iOS 12.5.8, reported physical memory 970 MiB. Built sherpa-onnx v1.10.30 for iOS 12 with CPU/one thread and `native/sherpa-ios12-memory.patch`. Microsoft official ONNX Runtime C 1.17.1 was linked with a current linker into an iOS 12 framework, then embedded and signed by Xcode 13.2.1 on the older Mac. This resolves newer ObjC selector-stub linker requirements without raising the app's deployment target. The first static-link attempt failed at link time and was not installed.

`SmokeTests/testLocalASRProbe` passed on device: `build/test-20260926-234658.xcresult`, 1 test / 0 failures. The test opened the user's existing recording, processed the first 10 seconds locally, waited for completion, attached measured text, and verified the original transcript field was unchanged. This is an actual native inference run, not an API mock or desktop worker call. The native processing path makes no network request; airplane mode was not toggled.

Measured result (one cold-start trial, not a statistical benchmark):

- Audio processed: 10.00 seconds.
- Model loading: 22.55 seconds.
- Recognition: 15.66 seconds.
- Total including audio preparation: 40.50 seconds.
- Sampled whole-process physical memory footprint peak: 301.3 MiB (100 ms sampling; not a kernel exact high-water mark).
- Text: “Hello, everybody. This time, I'm glad to be here to introduce my applications.”

The exact desktop model and token SHA256s are in `native/model-manifest.json`; model size is 239,233,841 bytes. The installed experimental entry is 「我的音频 → 录音详情 → 本机离线试转写 · 前10秒」. Results are displayed separately and saved as a diagnostic report; existing recording and transcript are preserved. Full-recording segmentation, speaker identification, cancellation within a native decode, and voice-cloning TTS on this hardware have not been implemented or benchmarked. The XCTest screenshot is retained as `screenshots/SayAgain-iPad-local-asr-probe.png`; its capture has an orientation/frame artifact and is not a clean layout acceptance screenshot.


## 2026-09-27 · 整条录音本机转写

真机：iPad mini 3 / iOS 12.5.8，Xcode 13.2.1 Debug 开发包，SenseVoice INT8 / CPU 单线程。`testLocalASRFullRecording` 通过（1 项、0 失败）；测试共 855.166 秒，包括 UI 操作与重启验证，不能混写成模型耗时。

| 指标 | 实测 |
|---|---:|
| 已处理 / 原录音 | 241.42 / 241.42 秒 |
| 连续输入片段数 | 29 |
| 模型加载 | 25.03 秒 |
| 推理累计 | 640.31 秒 |
| App 内总耗时（含读取、转换、落盘等） | 811.08 秒 |
| 每 100ms 采样的进程物理内存峰值 | 311.6 MiB |

获得非空英文转写，结果作为独立草稿落盘。测试断言生成前后原文字一致，终止并重新启动 App 后草稿显示内容完整一致、原文字仍一致。测试没有点击采用或保存来覆盖用户原文。

结果 bundle（旧签名 Mac）：`/Users/xialiwei/Developer/SayAgain-iPad/build/test-20260926-235930.xcresult`，包含 `Local-ASR-measurements` 文本附件及 `SayAgain-iPad-local-asr-full` 截图。源 WAV 与对应 `.wav.asr.json` 均在设备 Documents 中。本文不复制用户整段私人录音的全文。

实际总耗时约音频时长的 3.36 倍：证明整条录音可运行和内存受控，不代表达到实时或最终用户体验要求。数据来自带 XCTest 自动化的 Debug 构建，不是无干扰纯推理基准；未量化自动化、Debug 转换循环与其他开销各自影响。未做逐字准确率、飞行模式、最长 10 分钟、低电量、后台/系统强杀恢复或学习型 VAD 验证。跨段词语仍可能受切分影响，结果应校对。

现代路线另用 Xcode 26.6 / SDK 26.5、iOS 15 部署目标无签名 Release 编译成功。检查构建产物 Info.plist：`com.hotpoor.sayagain.ios`、`MinimumOSVersion=15.0`、`DTSDKName=iphoneos26.5`；Legacy App/UI test Bundle ID 仍分别是原 `com.hotpoor.sayagain.ipad` / `.uitests`，部署目标 12.0。现代真机运行、发行签名与 App Store 上传未验证。


### 模型加载阶段取消保护

`testLocalASRCancelKeepsDraft` 在同一 iPad 上通过（1 项、0 失败，92.069 秒）。新任务加载模型时点击停止，确认“尚未生成新段落”、原完整草稿仍在、原文未变；再次终止/启动 App 后完整草稿一致。Bundle：`/Users/xialiwei/Developer/SayAgain-iPad/build/test-20260927-001459.xcresult`。

这项测试针对首段生成前的取消，不扩张为任意时刻取消、后台切换或系统杀进程均已验证。新一轮识别完成首段后，会以当前轮草稿替换同名 ASR 草稿；此版本不保留多轮转写历史，用户原文字始终独立。识别中间步骤停止会保留当轮已完成段落，这一路径目前为代码实现，未做单独真机自动化验收。

此次还验证了显式 Legacy xcconfig 的远端构建/安装，以及 SHA-256 相同的 8 个原生资源文件跳过重复传输。最新安装包包含前台临时防止自动锁屏和后台请求停止代码；生命周期行为本身尚未进行独立场景测试。
