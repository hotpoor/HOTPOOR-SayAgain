# App Store 现代发行版

**用途：准备面向 Apple App Store 发布的 SayAgain。最低 iOS / iPadOS 15。**

当前状态：现代 Xcode 无签名 Release 编译已通过；尚未完成发行签名、Archive 验证、上传或审核。目录名表示发行路线，不表示已上架。

- 专用配置：[AppStore.xcconfig](AppStore.xcconfig)
- 专用构建入口：[build.sh](build.sh)
- 应用标识：`com.hotpoor.sayagain.ios`（发行注册与签名仍待配置）
- 共享源码：[`../SayAgain/`](../SayAgain/)
- 共享工程：[`../SayAgain.xcodeproj/`](../SayAgain.xcodeproj/)

先按 [原生依赖说明](../native/README.md)准备模型与原生库，再从仓库根目录运行：

```sh
./ios/app-store/build.sh
```

该命令明确使用本目录配置，执行无签名编译检查；输出在 `ios/build/app-store/`，不会上传或发布。需要当前符合 Apple 要求的 Xcode / SDK，本次验证使用 Xcode 26.6 / SDK 26.5。

正式归档前应完成现代设备验证与发行准备，参考 [发行说明](../docs/distribution.md)。旧 iPad mini 3 / iOS 12 的自用安装请进入 **[legacy/](../legacy/README.md)**。
