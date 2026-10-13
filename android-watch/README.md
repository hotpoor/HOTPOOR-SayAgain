# SayAgain 安卓手表录音 · 第一阶段

原生 Java App，最低 Android 8（API 26），第一阶段在 WWS_Watch / Android 9 真机验证。它建立完整录音基线：单个 `AudioRecord` 持续采集，熄屏前台服务，独立写入线程，每 60 秒封口一份 WAV。停止后保存最后一段。界面关闭不停止录音，通知和 App 内均有停止入口。

**当前交付范围**：完整录音、精确采样分片、异常恢复、ADB 导出、SayAgain 桌面会话导入。**蓝牙同步、AAC 压缩、VAD 自动丢弃静音、iOS 接收还没有实现**。当前桌面入口为“导入手表录音”；实现 BLE 后新增用户指定名称“蓝牙链接导入”，不能把本地清单导入当成蓝牙实测。

## 使用

1. 打开手表中的“SayAgain 录音”，点击“开始录音”，首次允许麦克风访问。
2. 正常熄屏；采集与文件切换由前台服务处理。通知会显示正在录音。
3. 点击“停止并保存”，等按钮恢复为“开始录音”。关闭应用或切到桌面不会结束录音。
4. 第一阶段通过 ADB 导出。保留每个会话文件夹中的 `manifest.json` 和 WAV，不修改其中的文件名或清单。

```powershell
& .\android-watch\export-recordings.ps1 -Destination 'J:\recording-export'
```

在 SayAgain 桌面的“我的音频”选择“导入手表录音”，打开对应会话文件夹中的 `manifest.json`。导入会校验完整批次，保存为同一个会话；重复导入和重开数据库后再次导入均去重。会话页首的“完整录音”使用一份由原 PCM 生成的 WAV，可整体播放、暂停和拖动进度，保留原静音；一分钟保存边界不会切换播放器。原始保存分片放在折叠区，不再当成发言条显示。

点击页首“识别整次录音”，进入现有本地 VAD / 分人 / 转写流程；显示未识别、识别中、已识别的状态和取消操作。没有检测到语音时也记录识别完成，显示“已识别，未检测到语音”，原音频仍可整体播放。识别只处理尚未解析的原片，不重复识别已完成部分。已有会话中导入会添加到当前会话，同一手表录音不能被重复移动到另一会话。

完整播放缓存从所有原始分片读取，包括识别后归档的原片；缓存损坏可按原片校验重建，不改原文件或人工笔记。已知内部缺失区间使用明确标注的静音占位，未知时长的内部中断不拼成假连续音频；末端缺失不补成原音。常见的一分钟连续保存片直接精确拼接，未结束的录音只提供已保存前缀。

当前推荐停止后再导出。协议能够描述录制中已封口的前缀，但 ADB 正在复制文件时，清单与新封口文件可能处于不同快照，不能作为自动同步协议使用。

## 保存与恢复

- 16 kHz、单声道、16 bit PCM WAV；约 115.2 MB/小时，每分钟约 1.92 MB。此阶段不以 VAD 删除原音。
- 每 50 ms 读取一次，有界队列最多容纳 6.4 秒。文件写入、封口、hash 和 fsync 不在麦克风读线程中执行。
- 每秒同步检查点，封口后校验 SHA-256，清单采用临时文件、fsync 和原子改名。
- 存储不足、设备音频错误、队列溢出会停止并记录错误，不静默丢帧。
- 进程中断后重新打开，恢复 `.wav.partial` 中完整的 PCM 样本并封口，标记 `interrupted`；不自动重新开麦。无法测量的最后尾部记录为中断事件，不能声称没有损失。
- 空 WAV 头保留为诊断文件，不作为音频分片导入。半初始化目录和真正空的旧目录保留为诊断，不阻断新录音；含音频但缺失/损坏清单，或 hash 不符时保留数据并明确报错。
- 文件位于 `getExternalFilesDir(null)/sessions/<session_id>`。卸载会清除应用数据，卸载前应导出；当前没有自动删除已同步录音的逻辑。

## 清单协议 `sayagain-watch-v1`

文件清单不是发言边界。每片使用绝对采样位置，客户端只把同设备、同会话、采样连续且没有中断的音频合为连续来源。

| 字段 | 含义 |
| --- | --- |
| `device_id` / `session_id` | 安装级 UUID / 录音级 UUID |
| `started_at_ms` | 手表墙上时钟，仅标为未经对时的设备时间 |
| `started_elapsed_ns` | 单调起始时间，以十进制字符串输出，避免 JS 精度损失；兼容旧安全整数 |
| `samples_captured` | 已从 AudioRecord 读取的样本 |
| `durable_samples` | 已同步到存储的样本，可包含活动 `.partial` |
| `sealed_samples` | `chunks` 里可校验、可导入的封口样本总量 |
| `chunks` | `id/index/file/sample_start/sample_count/byte_size/sha256/status/recovered` |
| `gaps` | `{sample_start,sample_count,reason}`；正数量为已知未保存区间，零数量为未知长度的中断事件 |

正常停止时三种计数一致。录制中只导入已封口的前缀，不能为 `.partial` 返回保存确认。后端 `STORED` 只表示文件 fsync、数据库保存以及校验完成，与转写完成无关。未来蓝牙协议将复用这层应用确认，不能用蓝牙发送回调代替落盘确认。

## 构建

无 AndroidX 或第三方运行依赖。可用 Android Studio / Gradle 8.9 + AGP 8.7.3 / JDK 17 构建 `app`；SDK 35，Build Tools 35.0.0。也提供独立 Windows PowerShell 构建脚本，避免必须安装完整 Android Studio：

```powershell
& .\android-watch\build.ps1 -JavaHome 'J:\codex_projects\.tools\android-watch\jdk\jdk-17.0.20.1+1' -SdkRoot 'J:\codex_projects\.tools\android-watch\sdk'
# 输出 android-watch/build/sayagain-watch-debug.apk
```

默认在工作区 `.tools/android-watch` 查找 portable 工具；也支持 `JAVA_HOME` / `ANDROID_SDK_ROOT`。工具链来自 [Google SDK repository](https://dl.google.com/android/repository/repository2-1.xml) 和 [Adoptium](https://adoptium.net/)，下载包需按官方发布值校验。脚本清理仅限自身 build 子目录，生成的调试密钥和 APK 均忽略，不提交。APK 使用 Android 标准调试签名，仅供当前原型；发布版签名需另行配置。

```powershell
adb -s <device> install -r .\android-watch\build\sayagain-watch-debug.apk
```

## 验证与边界

```powershell
& .\android-watch\tests\run-core-tests.ps1
node --test tests/watch-import.test.cjs tests/recordings.test.cjs tests/speaker-pipeline.test.cjs
node scripts/smoke-watch-import.cjs '<导出的会话目录>\manifest.json'
```

桌面需要 Node >=22.13（本次用 bundled Node 24），系统 Node 18 不支持当前 SQLite 存储。

2026-10-12 至 2026-10-13 已完成：核心 JVM 60 项断言；两次 60 秒精确分片与 1,921,277 样本逐样本回读；异常恢复、队列溢出和低存储检测；桌面协议与现有管线回归；真实手表熄屏录音 78.4 秒、1,254,400 样本，两片首尾连续且采集/保存数量一致；进程强制退出后恢复最后一片并标记中断；真实音频后端与 Electron 按钮导入，重复导入新增零片。

没有据此声称全场景零丢音：强制退出尾部未知，通话抢麦、整晚脱离充电录音、真实功耗、其他 Android 版本仍需验证。手表系统日期实测不准确，导入保留原时间并标为 `device_unverified`，不把它冒充电脑时间。

后续按既定顺序：先测压缩与编码边界，再接 BLE 广播/GATT、续传和持久保存回执，之后用完整录音对照 VAD 的误删与预录补齐。iOS 接收需要增加会话/分片模型，长录音处理需要按批次绕开现有单次 4 小时上限。
