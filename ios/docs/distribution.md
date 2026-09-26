# iOS 目录与发行路线

核对日期：2026-09-26（北京时间）。这些是构建路线，不代表已提交或获准上架。

## 同一仓库，独立客户端目录

保留 `HOTPOOR-SayAgain/ios/`，无需再复制一个独立仓库：

- `SayAgain/`：UIKit 客户端和原生 ASR 桥接。
- `legacy/Legacy-iOS12.xcconfig`：iPad mini 3 自用真机开发配置。
- `app-store/AppStore.xcconfig`：现代发行路线的编译配置。
- `native/`：模型指纹、依赖版本与可复现构建说明。
- `docs/milestones.md`：阶段成果索引；`docs/validation.md`：逐次验证证据。
- 根目录 `DEVELOPMENT_LOG.md`：整个 SayAgain 产品的开发记录，自动生成开发传记与图表。

共享 Swift 源码与资料结构，不重复维护两份 UI。只规划一个现代版 App Store 产品；Legacy 是旧设备开发路线，不再另建一个旧版上架条目。两种配置使用不同 Bundle ID，防止现代试验包覆盖旧 iPad 的开发包；它们不会自动共享沙盒数据。现代 ID 已用于 iPhone 12 Pro 开发签名安装，发行签名仍未验证。账号密钥不放进这些配置文件。

## 两条构建路线

| 路线 | 最低系统 | 工具链与用途 | 当前状态 |
|---|---|---|---|
| Legacy | iOS 12.0 | 旧 Mac Xcode 13.2.1 / SDK 15.2，已注册设备开发安装 | iPad mini 3 / iOS 12.5.8 真机验证；不能把这个构建当作当前 App Store 包 |
| App Store | iOS / iPadOS 15.0 | 当前合规的现代 Xcode / SDK；本次使用 Xcode 26.6 / SDK 26.5 | Release 编译、开发签名安装与 iPhone 12 Pro 本机 ASR 验证通过；尚未 Archive 验证、上传、审核或完整现代设备验收 |

现代编译验证（仓库根目录）：

```sh
xcodebuild -project ios/SayAgain.xcodeproj -scheme SayAgain \
  -configuration Release -xcconfig ios/app-store/AppStore.xcconfig \
  -destination 'generic/platform=iOS' -derivedDataPath /tmp/sayagain-modern-build \
  CODE_SIGNING_ALLOWED=NO build
```

旧 Mac 同步脚本 `ios/legacy/build-remote.py` 显式使用 Legacy 配置；直接在 Xcode 打开项目的默认配置也仍保留 iOS 12，避免破坏现有设备工作流。

## 苹果政策：SDK 与最低运行系统是两件事

Apple 的[已生效 SDK 要求](https://developer.apple.com/news/upcoming-requirements/?id=04282026a)明确：自 2026-04-28 起，上传 App Store Connect 的应用须用 Xcode 26 或更新版本及相应 26 系列 SDK 构建。旧 Mac 的 Xcode 13 构建不满足此条件，TestFlight 也不能绕过 App Store Connect 上传要求。

[Apple Xcode 支持表](https://developer.apple.com/xcode/system-requirements)列出 Xcode 26.6 的上架部署目标为 iOS/iPadOS 15–26.5。因此“用新 SDK”不意味着“只能运行于最新系统”；但我们这台 iOS 12.5.8 iPad 已不在该上架支持范围，保留开发签名测试路线。

[Apple 提交说明](https://developer.apple.com/app-store/submitting/)另外预告 2027 年 4 月起要求 iOS/iPadOS 27 SDK 或更新版本、最低部署 iOS 15。这个将来的要求不要误写为 2026 年已生效。正式发布前需重新核对。

发行版还需独立完成签名与 Archive 验证、现代设备功能/布局测试、隐私与第三方依赖/模型许可核查等。当前“现代编译成功”不是“可直接上架”的证明。旧版曾上架后的历史兼容版本下载是另一个机制，本项目没有已发布旧版本可依赖。
