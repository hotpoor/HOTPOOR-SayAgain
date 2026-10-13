# 手表 App 更新

首页底部“熄屏继续 · 检查更新”进入独立更新页，进入时检查一次；已是最新时可重新检查。新版本显示更新说明和下载大小，用户点击下载，校验通过后点击安装。Android 8 及以上第一次需要允许此 App 安装未知应用，授权返回后再点击安装，由系统确认覆盖更新。系统安装器不可用时明确提示，不卸载已有 App。

下载允许在录音中进行；录音、暂停、启动或最后保存期间均拒绝安装。进入系统安装器期间也禁止新开录音，取消安装后可以继续正常使用。更新不会自动开始录音，不会访问或删除 `sessions` 与上传回执。

## 发布源

- 版本清单：<https://api.xialiwei.com/hotpoor/sayagain/updates/android-watch/stable.json>
- APK：同目录下 `sayagain-watch-版本号.apk`。
- 清单 schema 为 `sayagain-watch-update-v1`，字段包含 `package_name`、`version_code`、`version_name`、`min_sdk`、`apk_url`、`size`、`sha256`、`notes`。
- 清单禁止缓存；版本文件名固定且不覆盖，APK 允许缓存和 Range 下载。
- App 只接受该 HTTPS 主机和目录，不跟随跳转、不绕过 TLS 证书校验。APK 最大 32 MiB，清单最大 16 KiB；核对大小、SHA-256、包名、版本、最低 SDK 和已安装 App 的签名身份。安装前重复校验。
- 下载到私有缓存，校验完成后原子替换；系统安装器仅获得单个 APK 的只读 URI。退出更新页会取消后台任务，失败后可重新下载，当前未实现断点续传。

## 签名和版本

现有手表签名密钥已原样备份至仓库外的持久密钥文件，`build.ps1` 通过 `SigningKey` 指定。密钥缺失会阻止构建，不再自动生成其他密钥。当前仍沿用原型测试签名及其测试密码；它保证现有设备可覆盖升级，不代表已建立正式发行签名管理。不要把密钥提交到 Git 或上传到公开下载目录。

默认版本为 0.4.2（versionCode 7），两处版本定义在 `app/build.gradle` 和 `build.ps1` 保持一致。`build.ps1 -VersionCode ... -VersionName ...` 可构建指定测试版本；正式发布的 versionCode 必须递增，同一 versionCode 或版本文件名不允许重新发布其他 APK 字节。

```powershell
& .\android-watch\build.ps1
& .\android-watch\tests\run-update-tests.ps1
python .\android-watch\prepare-update.py --notes '本次更新说明'
& .\android-watch\publish-update.ps1
```

发布脚本通过现有 SSH 账户上传至独立临时目录，再由服务器部署脚本验证清单和 APK；先原子发布 APK，再原子替换清单。Nginx 在现有配置上增加独立静态目录 `/var/www/sayagain-updates/android-watch`，配置修改前备份，通过 `nginx -t` 后 reload，不重启 API 容器。公开路由只允许读取，目录列表关闭。没有公共上传接口。脚本保留旧 APK、发布暂存目录和 Nginx 备份，不自动删除它们。

## 验证范围

2026-10-13：0.4.2 构建、APK 签名验证通过；25 项更新清单断言涵盖错误产品、非法版本/大小/hash、非 HTTPS、其他主机、用户名、端口、查询参数、路径穿越和非 APK 文件。原有 60 项录音核心断言、40 项统计断言通过。线上清单为 0.4.2（7），实际 APK 57,900 字节，公网下载 SHA-256 与本地一致；Range 返回 206，POST 返回 403。现有 API OpenAPI 与 Director 页面均返回 200。

本轮 ADB 未发现设备。首页更新入口、手表 TLS/网络、安装未知应用授权、实际系统覆盖升级与升级后录音数据保留尚未完成真机验证。不能把服务器下载验证说成手表升级成功。
