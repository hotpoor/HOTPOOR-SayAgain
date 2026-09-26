# Legacy 老设备自用版

**用途：给旧 iPhone / iPad 自用、开发签名安装与实验；不用于 App Store 提交。**

当前已验证设备：iPad mini 3 / iOS 12.5.8。部署目标 iOS 12.0，签名构建环境为旧 Mac 的 Xcode 13.2.1 / SDK 15.2。其他旧设备尚未逐一验证。

- 专用配置：[Legacy-iOS12.xcconfig](Legacy-iOS12.xcconfig)
- 专用远端构建入口：[build-remote.py](build-remote.py)
- 应用标识：`com.hotpoor.sayagain.ipad`
- 共享源码：[`../SayAgain/`](../SayAgain/)
- 共享工程：[`../SayAgain.xcodeproj/`](../SayAgain.xcodeproj/)

先准备 [原生依赖](../native/README.md)，并配置自己的开发团队、已注册设备和签名环境。在旧 Mac 本机、`ios/` 目录运行：

```sh
xcodebuild -project SayAgain.xcodeproj -scheme SayAgain \
  -configuration Debug -xcconfig legacy/Legacy-iOS12.xcconfig \
  -destination 'generic/platform=iOS' -derivedDataPath build/legacy build
```

从另一台 Mac 同步到已有旧 Mac 环境（仓库根目录，替换参数）：

```sh
python3 ios/legacy/build-remote.py \
  --ssh-helper /path/to/ssh-helper \
  --keychain-service YOUR_SSH_KEYCHAIN_SERVICE --account YOUR_ACCOUNT \
  --device YOUR_REGISTERED_DEVICE_UDID
```

默认仅构建；加 `--test --only-testing SayAgainUITests/SmokeTests/指定测试方法` 才会安装并执行对应测试。测试按 [验证记录](../docs/validation.md)选择，不建议无差别运行会操作资料的全部真机用例。签名密码从本机钥匙串读取，不写入源码。

原 `ios/scripts/build-remote.py` 已移入本目录。共享工程的默认 Debug 配置仍兼容旧设备；现代上架路线请进入 **[app-store/](../app-store/README.md)**。两条路线没有复制两套 UI，修改共享源码仍应保留 iOS 12 兼容性。
