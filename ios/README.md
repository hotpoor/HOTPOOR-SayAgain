# SayAgain for iOS / iPadOS

## 先选择版本

| 目录 | 给谁用 | 当前状态 |
|---|---|---|
| **[app-store/](app-store/README.md)** | 面向 Apple App Store 的现代发行版，iOS / iPadOS 15+ | 编译通过，尚未提交上架 |
| **[legacy/](legacy/README.md)** | 老机器自用与开发安装，iOS 12，已验证 iPad mini 3 | 真机可用，不用于 App Store 提交 |

```text
ios/
├── app-store/          # App Store 发行入口、配置与构建脚本
├── legacy/             # 老设备自用入口、配置与远端安装测试脚本
├── SayAgain/           # 两条路线共享的 Swift / UIKit 源码
├── SayAgain.xcodeproj/ # 共享 Xcode 工程
├── SayAgainUITests/    # 测试
├── native/             # 原生模型依赖与构建说明
└── docs/               # 阶段成果与验证证据
```

原生 UIKit 客户端。两条路线共享源码，但构建入口、配置和用途说明分别存放。客户端不嵌入 Electron、Node 或 Python；本机整条录音转写使用原生 SenseVoice，候选说话人处理仍可调用电脑 API。

开发记录：[阶段成果](docs/milestones.md) · [验证证据](docs/validation.md) · [旧设备与 App Store 发行路线](docs/distribution.md)。旧 iPad 测试与现代发行配置共用源码，分别从 [`app-store/`](app-store/README.md) 和 [`legacy/`](legacy/README.md) 进入。

## 目前移植范围

| 功能 | iPad 本地 | API / 限制 |
|---|---|---|
| 表达库 | 新建、编辑、搜索、收藏、归档/恢复、文本分享 | 优化表达需要文本模型 API |
| 资料迁移 | 导入桌面 expressions.json；完整 iPad JSON 备份与合并恢复 | 不直接复制或改写桌面 SQLite；尚无双向自动同步 |
| 录音与音频 | 原生 24kHz 单声道 WAV 录音、文件导入、播放、人工文字校对、音频原文加入表达 | 单文件 25MB、最长 10 分钟；录音离开前台自动停止保存 |
| 转写与说话人 | 显示、保存带时间与候选说话人的原文 | 电脑端 SenseVoice + CAMPPlus + Silero；候选标签不是身份识别 |
| 人物资料 | 姓名、备注、搜索、归档/恢复 | 人物头像、多头像和会话人物关联尚未移植 |
| 音色资料 | 独立录制、约 30 秒中文朗读稿、计时、试听与重录；也可从已有录音选择 10–60 秒参考样本 | 克隆需要电脑 Qwen3-TTS；此电脑尚未安装该模型 |
| 听练 | iOS 系统朗读；播放已保存的克隆结果 | 系统朗读不是用户的克隆声音 |
| 长音频编辑 | 此版本不提供复杂波形/片段边界编辑 | 保留桌面端完成，不宣称移动端已达功能等价 |
| Skill | 可导入桌面积累的表达 | iPad 无桌面宿主 Skill bridge；不持续监听其他 App |

## 界面

沿用 Electron 的白色内容区、浅灰侧栏、黑色主操作按钮与细边框表单。iPad 使用侧栏，宽屏表达列表并排显示原句和建议；内容区域窄于 500pt 时上下排列。窄屏设备保留底部标签导航。原生录音、文件导入和资料存储继续保留。

## 构建

现代发行路线使用 `./ios/app-store/build.sh`，完整说明见 [App Store 入口](app-store/README.md)。以下为 [Legacy 老设备路线](legacy/README.md)。

使用 Xcode 13.2.1，在 macOS 11.7.11 编译；部署目标 iOS 12.0，arm64。打开 `SayAgain.xcodeproj`，选择自己的 Development Team 和连接的 iPad，运行 SayAgain scheme。

项目生成器：`python3 ios/scripts/make-project.py`。生成文件已包含在源码中，无需 XcodeGen 或 CocoaPods；本机 ASR 需按 [native/README.md](native/README.md) 准备原生库与模型。当前工程 Team 是本次用户设备的团队；其他开发者应改为自己的团队。

图标导出：在有 Pillow 的 Python 环境运行 `python3 ios/scripts/export-icons.py`。脚本复用 `renderer/assets/sayagain-icon.png`，将透明区域合成到白底并导出 13 个尺寸的 RGB PNG，避免 iOS 桌面显示透明黑边。简单图片处理在本地完成。

远程构建（在仓库根目录运行）：

```sh
python3 ios/legacy/build-remote.py \
  --ssh-helper "$HOME/.ssh/lan-101-connect" \
  --keychain-service ssh:192.168.100.101:22 --account xialiwei \
  --device YOUR_IPAD_UDID --test
```

脚本只同步 `ios` 工程到旧 Mac 的 `~/Developer/SayAgain-iPad`。密码从当前 Mac 的钥匙串读取，通过 SSH 标准输入传送；仅在同一构建会话解锁旧 Mac 登录钥匙串，不写入源码或日志。不把系统密码当作可在其他机器通用的凭据。

## 局域网 API

在有模型的现代电脑运行（仓库根目录，Node 22+）：

```sh
SAYAGAIN_HOST=192.168.1.10 node ios/companion/server.cjs
```

默认只监听 `127.0.0.1:8765`；显式指定电脑局域网地址才能供 iPad 访问。令牌自动保存在电脑的 `~/Library/Application Support/SayAgain-iPad-Companion/connection.secret`，权限 0600。iPad 设置填写根地址和令牌，令牌放在 iOS 钥匙串。请求禁用重定向，每次发送文字/录音前确认目的地址。HTTP 只允许可信私有局域网 / `.local` 地址；公网用 HTTPS。HTTP 传输本身不加密，不用于公共 Wi-Fi。

服务只读已有 `recording-models/runtime.json` 与 `tts/runtime.json`，不打开桌面数据库，不复用桌面云端 Key。音频处理用临时目录，结束/失败后清理；同时仅运行一个任务，断开连接会取消 worker。可以设置 `SAYAGAIN_DESKTOP_DIR` 指向已有模型描述文件目录。

端点：

- `GET /v1/capabilities`：各模型是否已登记及未就绪原因。
- `POST /v1/improve`：`text, native_language` → `improved, translation, explanation, category, pattern`。
- `POST /v1/transcribe`：`audio`（Base64）, `format` → `text, segments, engine`。
- `POST /v1/clone`：参考 `audio, format, reference_text` 和 `text, language` → WAV Base64 `audio, format, engine`。

所有请求要求 `Authorization: Bearer <token>`，拒绝浏览器 Origin；请求上限 35MB，音频上限 25MB。接口不接受任意文件路径或 shell 命令。

文字优化可显式设置 `SAYAGAIN_TEXT_URL`（完整 Chat Completions URL）、`SAYAGAIN_TEXT_MODEL` 和 `SAYAGAIN_TEXT_KEY`。默认不配置、不发送到云端。不要把 Key 写在仓库文件或提交到 Git。声音克隆目前只接本地 Qwen worker；云端克隆适配仍待选定服务后添加。

部署时可通过本机 USB 工具向 App 的 Documents 上传一次性的 `connection-bootstrap.json`，格式为 `{"base":"http://PRIVATE_IP:8765","token":"..."}`；App 启动将令牌移入钥匙串并删除文件。不要把这个文件加入仓库或完整资料备份。

## 数据与测试

iPad Documents 中 `library.json` 原子写入，音频单独保存；读取失败时阻止覆盖原文件。导入备份合并 ID，不覆盖已有条目；导出备份包括音频（总音频最大 40MB）。大资料可用 Finder/iTunes 文件共享备份 Documents。凭据不在资料备份内。

```sh
node --test ios/companion/server.test.cjs
cat ios/SayAgain/Model.swift ios/scripts/model-tests.swift > /tmp/sayagain-model-tests.swift
swift /tmp/sayagain-model-tests.swift
```

`SayAgainUITests` 验证真机表达录入、保存、重启恢复、归档、页面切换，并保留截图。UI 测试产生的英文测试记录放在归档内，不使用真实聊天或上传真实录音。真实模型验证用系统合成的测试语音，结果与设备验证状态见 `docs/validation.md`。

其中 `testConfiguredCompanionConnection` 是设备集成测试，要求先部署上述连接配置，并启动电脑端服务和所需的局域网转接。只验证离线功能时，可给 xcodebuild 加 `-only-testing:SayAgainUITests/SmokeTests/testOfflineExpressionAndPersistence`。

## 参考

- [Apple：Xcode 13.2.1](https://developer.apple.com/documentation/xcode-release-notes/xcode-13_2_1-release-notes)
- [Apple：iPad mini 3 技术规格](https://support.apple.com/en-mt/112018)
- [ios-deploy](https://github.com/ios-control/ios-deploy)，本次旧系统兼容部署工具版本 1.12.2。

## 独立录制音色

打开“我的音色” → ＋ → “独立录制 · 中文朗读约30秒”。填写名称，按默认中文稿朗读，停止后试听并保存。默认稿是受苏格拉底自省思想启发的原创文字，不作为历史名言引用；时长随语速变化。10 秒以下不能保存，接近 60 秒自动停止。可校对原文，确保它与实际读出的内容一致。录音先留在临时草稿中，保存时复制到本地音色库，不创建“我的音频”记录、不自动调用 API。切到后台或离开页面会停止录音；退出未保存草稿会丢弃该草稿。

## 大模型 API 配置（Electron 与 iPad）

两端均从“设置 → 大模型 API 配置”进入。service-inference 的入口沿用 Director：`https://model.service-inference.ai/v1`。千问用于语音，账号在独立入口配置。

自定义文本服务保存 Base URL、模型名称、Chat Completions / Responses 协议和 API Key。service-inference 使用下述管理 AK / 使用 AK 匹配模式，生成配置只引用使用 AK ID。可填 Base URL 或完整生成地址。模型需从实际账号列表选择或手工填写；不预设账号一定有权限的模型。服务切换时不会借用另一服务的 Key；更换地址需要重新填写 Key。

“读取模型 / 测试连接”请求所填服务的 `/models`，不发送业务文字、不生成内容、不自动保存当前输入。成功仅证明模型列表可访问。个别服务不提供 `/models` 时仍可手工填写；真实生成权限与返回格式需要另行验证。

Electron 保存到独立的 `text-review.secret`（0600），读取状态不会返回 Key，原有单服务配置自动兼容；iPad 将每个服务配置放在本机钥匙串。二者不自动同步 Key，不包含在资料备份中。“清除此服务配置”可删除保存的 Key。

iPad 保存直连配置后，“优化表达”会在确认目标地址后直接调用该服务，不经过旧 Mac；选择“电脑 API”并保存可恢复原路径。音频转写仍走原来的电脑 API；回顾语音改为千问直连。Electron 的所选录音文字优化使用当前保存的服务；语音设置中的千问 TTS 配置保持独立。

service-inference 依据仓库 `hotpoor_director/backend/inference.py` 与 `scripts/service-inference-cli.py` 的既有接入。

## service-inference：管理 AK + 使用 AK 匹配

与 Director 相同，将凭据分成两组，每组最多 30 个命名配置：

1. 添加管理 AK（`sk-mgmt-v1-…`），保存时调用 `/manage/whoami` 验证并记录组织 ID。
2. 添加使用 AK，选择一个已启用的管理 AK 进行匹配；保存时用使用 AK 请求 `/v1/models`。使用 AK 不能填写管理 AK。
3. 在大模型配置中选择已匹配且已启用的使用 AK，填写模型与接口类型并保存。生成只携带使用 AK，固定发送到 `model.service-inference.ai`。
4. 使用 AK 列表可查询其绑定管理 AK 的最近 30 天组织费用。查询用管理 AK 调用 `/manage/cost/summary`；显示组织汇总，不冒充单个使用 AK 的费用。

可编辑、改绑、启停、删除多组 AK。管理 AK 被使用 AK 引用时不能删除，也不能改到另一个组织；先新增管理 AK 并改绑。停用任一绑定端会阻止后续生成。默认使用项用于新配置的预选，已保存的大模型配置继续引用明确选中的使用 AK。

匹配关系由用户选择，与 Director 一致；`whoami` 和 `models` 分别验证两种凭据有效，不宣称远端自动证明使用 AK 属于该组织。旧版单 Key 保留成“旧使用 AK · 待绑定”，默认停用，完成匹配后再使用。Electron 用独立 `service-inference-keys.secret` 保存，状态接口不返回凭据；iPad 在独立钥匙串条目保存两组凭据。清除大模型配置只清除模型选择，AK 请到 AK 管理页面单独删除。

### 千问账号配置（当前范围）
iPad 在「设置 → 千问账号配置」管理多个账号，只填写账号名称和 API Key。支持新增、编辑（Key 留空保留）、删除和选择当前账号，Key 存放在本机钥匙串，不写入资料备份。此前误放在文本配置中的千问平台 Key 首次进入时迁入账号列表，原始记录保留。

账号配置与语音合成功能分开。回顾详情的「生成语音」使用当前千问账号和所选音色，直连平台克隆并合成，成功后保存到 Documents 本地音频文件、关联回顾并自动播放。播放与导出按钮直接使用本地文件；同一文字、音色和 Key 已有本地结果时复用，不重复生成。可在展开的语音设置或全局设置中选择模型，默认沿用 Electron 的 `qwen3-tts-vc-2026-01-22`。Electron 原有「Qwen 云端 · 音色克隆与语音生成」已支持多个 Key，并沿用原合成流程。两端文本配置界面已移除错误的千问文本入口，service-inference 管理 AK／使用 AK 功能保留。

### 阅读、播放与模型选择
- 「设置 → 阅读与播放」统一管理 85%–150% 字号和应用内 0%–100% 播放音量，即时生效并在重启后保留；音量仍受设备硬件音量限制。
- 「默认语音模型」与回顾语音设置共享同一份设置，列表显示勾选项。Qwen3-TTS、Qwen-Audio、CosyVoice、MiniMax 共 12 款 HTTP 模型已接入对应上传、克隆与合成路径。Realtime 使用 iOS 13+ WebSocket；iOS 12 显示不可用说明，不能误选。
- 回顾列表和详情使用 Electron 的阅读结构：左侧原句、改写、译文，右侧修改原因、句型与语音。窄屏或大字号自动改为单栏。账号、音色、模型和次要编辑操作可展开，不挤占阅读区。
- 已生成音频显示由真实 PCM 采样提取的波形，支持播放/暂停、已播放区域着色、游标、点击/拖动定位和 VoiceOver 调节；列表可直接播放本地语音，详情另有音量与导出。波形在后台分块读取，静音音频呈平线，不伪造随机动画。
- 账号 Key、全局偏好、回顾资料分别存储。`Preferences` 通过明确类型和变更通知统一更新界面与播放器；音色与合成缓存包含模型身份，换模型不会播放旧模型结果冒充新结果。

### 本机离线转写

「我的音频 → 录音详情 → 本机离线转写 · 整条录音」使用内置 SenseVoice INT8 与原生 sherpa-onnx/ONNX Runtime，在 iPad CPU 上运行。约 7–10 秒分段，模型只加载一次，每段完成后单独保存草稿；可停止、重开查看，再选择采用并校对保存。保持 App 前台运行。无需电脑服务或云端请求，原文字不会自动被改写。

首次前 10 秒真机试验：加载 22.55 秒、识别 15.66 秒、总耗时 40.50 秒，采样内存峰值约 301 MiB。整段测试的独立结果见 [验证记录](docs/validation.md)。VAD 模型、说话人处理和本机克隆 TTS 尚未接入；不要将 ASR 成功等同于这些功能已完成。构建方法见 [native/README.md](native/README.md)。
