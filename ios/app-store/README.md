# App Store 现代发行版

**用途：准备面向 Apple App Store 发布的 SayAgain。最低 iOS / iPadOS 15。**

当前状态：现代 Xcode Release 编译及开发签名安装已通过，iPhone 12 Pro 真机已完成四分钟录音的本机 ASR 测试；尚未完成发行签名、Archive 验证、上传或审核。目录名表示发行路线，不表示已上架。

- 专用配置：[AppStore.xcconfig](AppStore.xcconfig)
- 专用构建入口：[build.sh](build.sh)
- 应用标识：`com.hotpoor.sayagain.ios`（开发签名已验证，发行签名仍待配置）
- 共享源码：[`../SayAgain/`](../SayAgain/)
- 共享工程：[`../SayAgain.xcodeproj/`](../SayAgain.xcodeproj/)

先按 [原生依赖说明](../native/README.md)准备模型与原生库，再从仓库根目录运行：

```sh
./ios/app-store/build.sh
```

该命令明确使用本目录配置，执行无签名编译检查；输出在 `ios/build/app-store/`，不会上传或发布。需要当前符合 Apple 要求的 Xcode / SDK，本次验证使用 Xcode 26.6 / SDK 26.5。

正式归档前应完成现代设备验证与发行准备，参考 [发行说明](../docs/distribution.md)。旧 iPad mini 3 / iOS 12 的自用安装请进入 **[legacy/](../legacy/README.md)**。


## 性能对照配置

[Benchmark-Debug.xcconfig](Benchmark-Debug.xcconfig) 继承现代版应用标识和最低系统，但显式设为 Swift `-Onone`，仅用于关闭 Swift 优化的性能对照。正式用户版本仍使用 `AppStore.xcconfig` 的 `-O`。仅传 `-configuration Debug` 不足以证明关闭了优化，必须检查实际编译参数。

同音频测速见 [iPhone 12 Pro 性能记录](../docs/iphone12pro-benchmark.md)。
