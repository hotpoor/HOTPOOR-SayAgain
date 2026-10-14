# SayAgain 安卓手表录音 · 第一阶段

原生 Java App，最低 Android 8（API 26），第一阶段在 WWS_Watch / Android 9 真机验证。它建立完整录音基线：单个 `AudioRecord` 持续采集，熄屏前台服务，独立写入线程，每 60 秒封口一份 WAV。停止后保存最后一段。界面关闭不停止录音，通知和 App 内均有停止入口。

手表原型 v0.4.2 使用无滚动的一屏首页：本地录音次数、累计已保存时长、待上传文件数。录音时大字切换为本次时长，下方保留累计时长；录音时提供暂停/继续与结束保存，另有锁屏和浮窗快捷入口。设计借鉴 [Android 手表设计原则](https://developer.android.com/design/ui/wear/guides/foundations/design-principles)，保留旧系统可运行的原生 Java 控件。

**当前交付范围**：完整录音、精确采样分片、异常恢复、ADB 导出、SayAgain 桌面会话导入。**蓝牙同步、AAC 压缩、VAD 自动丢弃静音、iOS 接收还没有实现**。当前桌面入口为“导入手表录音”；实现 BLE 后新增用户指定名称“蓝牙链接导入”，不能把本地清单导入当成蓝牙实测。

## 使用

1. 打开手表中的“SayAgain 录音”，点击“开始录音”，首次允许麦克风访问。
2. 正常熄屏；采集与文件切换由前台服务处理。通知会显示正在录音。
3. 点击“结束保存”，等按钮恢复为“开始录音”。关闭应用或切到桌面不会结束录音。
4. 第一阶段通过 ADB 导出。保留每个会话文件夹中的 `manifest.json` 和 WAV，不修改其中的文件名或清单。

“锁屏”首次使用需在系统中启用本 App 的锁屏授权，策略仅包含 `force-lock`；锁屏后录音继续。已启用时长按“锁屏”可撤销本 App 授权，取消授权界面不会自动锁屏。

“浮窗”首次使用需允许显示在其他应用上层；录音期间切到其他应用会显示红点闪烁的计时浮窗，暂停时红点变灰并停止闪烁。浮窗内“暂停/继续”控制当前会话，“■”返回录音首页并结束保存，点时长回到录音页。浮窗任意部位都可拖动到屏幕四周，松手记住位置；拖动不会触发按钮，边界约束保证整个浮窗仍能被操作。主界面可见时隐藏浮窗，避免遮挡数字；停止/服务销毁/权限撤销后移除。启用浮窗或从权限页返回本身不会启动录音。浮窗使用 `TYPE_APPLICATION_OVERLAY`，不要求无障碍服务，不覆盖系统锁屏；新系统或厂商可能限制其显示。

暂停会停止麦克风并冻结有效录音计时，继续时使用同一会话和同一个 `AudioRecord`，暂停期间不保存音频，也不填充静音。播放时前后有效音频直接接续；这是用户主动暂停，正常 60 秒分段仍保持采集不中断。通知、首页和浮窗都可以暂停/继续，暂停时也能结束保存。

## WWS_Watch 后台保护

这款手表的厂商任务管理器具有自动清理功能，可能通过 `forceStopPackage` 终止前台录音服务。2026-10-14 对设备尾号3344的检查中，14次已有录音有8次异常结束，均与系统强制停止日志匹配；被停止前的采样时长和经过时间相差约0.2秒。日志没有保留强停调用者，厂商自动清理为重点嫌疑，不能仅凭相关配置断言具体调用者。

已验证可配置的两项保护：

1. **电池优化豁免**：将 `world.hotpoor.sayagain.watch` 加入 Android 用户白名单。当前本机可使用 `adb -s 手表序列号 shell dumpsys deviceidle whitelist +world.hotpoor.sayagain.watch`；通过 `dumpsys deviceidle whitelist` 核对该包。此设置只针对 SayAgain。
2. **厂商任务锁定**：进入手表的最近任务页（本机双击电源键对应 `com.dw.recents/.presentation.view.activity.TaskListActivity`），在 SayAgain 卡片上向左滑，点击上方锁头。卡片出现闭合锁头 `ivLock` 表示已锁定。下方红色叉为清除任务，底部“全部清除”为批量清理，不用于启用保护。任务锁定用于保留后台任务；SayAgain 首页的“锁屏”用于关闭屏幕。

普通后台运行权限允许、前台服务和唤醒锁，都不保证能抵御厂商强停。电池优化白名单针对 Android Doze，厂商任务锁定针对清理；配置后需要进行实际熄屏录音验证。已丢失的声音无法通过重新启动录音补回。

同日对尾号3344开启上述两项保护后，完成840.1秒（约14分钟）真机连续录音，含至少346秒已观测深度休眠；进程PID始终相同，退出深度休眠及正常充电熄屏阶段均持续采集。15份WAV、13,441,600样本的采样区间、帧数和SHA全部通过校验，每份都有非零音频；最终状态为`completed`且无`gaps`。周期检查点相对经过时间最大延迟1.32秒，此为检查点刷新延迟，最终采集与保存计数相同。测试音频已备份到忽略的测试目录，仅删除该次临时录音；原14次录音的123份文件SHA全部保持一致。厂商任务锁定在重新打开任务页后仍显示闭合锁头，电池优化用户白名单仍包含SayAgain。模拟未充电和强制休眠状态已还原，结束时未录音。此次USB仍连接，尚未验证拔线连续数小时或整夜录音，不能据此保证以后绝不中断。

```powershell
& .\android-watch\export-recordings.ps1 -Destination 'J:\recording-export'
```

在 SayAgain 桌面的“我的音频”选择“导入手表录音”，打开对应会话文件夹中的 `manifest.json`。导入会校验完整批次，保存为同一个会话；重复导入和重开数据库后再次导入均去重。会话页首的“完整录音”使用一份由原 PCM 生成的 WAV，可整体播放、暂停和拖动进度，保留原静音；一分钟保存边界不会切换播放器。原始保存分片放在折叠区，不再当成发言条显示。

点击页首“识别整次录音”，进入现有本地 VAD / 分人 / 转写流程；显示未识别、识别中、已识别的状态和取消操作。没有检测到语音时也记录识别完成，显示“已识别，未检测到语音”，原音频仍可整体播放。识别只处理尚未解析的原片，不重复识别已完成部分。已有会话中导入会添加到当前会话，同一手表录音不能被重复移动到另一会话。

完整播放缓存从所有原始分片读取，包括识别后归档的原片；缓存损坏可按原片校验重建，不改原文件或人工笔记。已知内部缺失区间使用明确标注的静音占位，未知时长的内部中断不拼成假连续音频；末端缺失不补成原音。常见的一分钟连续保存片直接精确拼接，未结束的录音只提供已保存前缀。

当前推荐停止后再导出。协议能够描述录制中已封口的前缀，但 ADB 正在复制文件时，清单与新封口文件可能处于不同快照，不能作为自动同步协议使用。

用户约定：每次发出同步指令算一个合集，包含本次新同步的各次录音与其原始分段；之前已同步的内容去重，不重复放入新合集。`desktop/watch-sync.cjs` 的 `createWatchSyncCollection(service,{recording_ids,title,id})` 在事务内创建合集并关联手表会话，保留各次录音的身份、时间、原音频、播放和回执。固定 `id` 的相同请求可重试，不能悄悄把录音移到另一合集。桌面“我的音频”按合集折叠显示，支持按合集名称搜索；单份清单导入仍然是一份手表会话，不自动代表批量同步。合集采用客户端同步时间命名，不能依赖未校准的手表日期。

## 待上传文件的确认

待上传统计只包含已封口 WAV；正在写的片段和诊断文件不计入。仅设备、会话、分片 ID 和 SHA-256 都匹配的客户端 `STORED` 回执才减少该数字，复制到电脑或识别成功本身不算确认。回执缺失时文件仍待上传，回执损坏时显示未知；已同步音频继续留在手表，不自动删除。

当前 ADB 流程：导出录音 → 在 SayAgain 导入 → 回传真实保存回执。确认脚本只读客户端 SQLite、校验每份原 WAV，含识别后归档的原片，并与手表已有回执合并：

```powershell
& .\android-watch\confirm-import.ps1 -DataDirectory 'C:\Users\your-name\AppData\Roaming\HOTPOOR SayAgain\data'
```

可显式提供 `-Serial`、`-Adb`、`-Node`；需要 Node >=22.13。脚本写入 `getExternalFilesDir(null)/sync-receipts.json`，统计在几秒内刷新。回执协议为 `sayagain-watch-sync-v1`，保留真实导入时间，SHA 冲突或坏历史回执会拒绝覆盖；不会改变客户端记录。后续 BLE 直接复用回执持久层，当前不是蓝牙上传实现。

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

## 应用内更新

首页底部点击“检查更新”。更新清单和APK已发布到 `api.xialiwei.com`，完整发布流程、签名约束及验证范围见 [UPDATES.md](UPDATES.md)。

## 构建

无 AndroidX 或第三方运行依赖。可用 Android Studio / Gradle 8.9 + AGP 8.7.3 / JDK 17 构建 `app`；SDK 35，Build Tools 35.0.0。也提供独立 Windows PowerShell 构建脚本，避免必须安装完整 Android Studio：

```powershell
& .\android-watch\build.ps1 -JavaHome 'J:\codex_projects\.tools\android-watch\jdk\jdk-17.0.20.1+1' -SdkRoot 'J:\codex_projects\.tools\android-watch\sdk'
# 输出 android-watch/build/sayagain-watch-debug.apk
```

默认在工作区 `.tools/android-watch` 查找 portable 工具；也支持 `JAVA_HOME` / `ANDROID_SDK_ROOT`。工具链来自 [Google SDK repository](https://dl.google.com/android/repository/repository2-1.xml) 和 [Adoptium](https://adoptium.net/)，下载包需按官方发布值校验。脚本清理仅限自身 build 子目录，APK 忽略、不提交。当前沿用原型测试签名，密钥已保存在仓库外；通过 `SigningKey` 指定，密钥缺失会阻止构建。Android Studio/Gradle 的默认调试密钥可能不同，不能直接用于现有手表覆盖升级。正式发行签名管理需另行配置。

```powershell
adb -s <device> install -r .\android-watch\build\sayagain-watch-debug.apk
```

## 验证与边界

```powershell
& .\android-watch\tests\run-core-tests.ps1
& .\android-watch\tests\run-summary-tests.ps1
node --test tests/watch-import.test.cjs tests/recordings.test.cjs tests/speaker-pipeline.test.cjs
node scripts/smoke-watch-import.cjs '<导出的会话目录>\manifest.json'
```

桌面需要 Node >=22.13（本次用 bundled Node 24），系统 Node 18 不支持当前 SQLite 存储。

2026-10-12 至 2026-10-13 已完成：核心 JVM 60 项断言；两次 60 秒精确分片与 1,921,277 样本逐样本回读；异常恢复、队列溢出和低存储检测；桌面协议与现有管线回归；真实手表熄屏录音 78.4 秒、1,254,400 样本，两片首尾连续且采集/保存数量一致；进程强制退出后恢复最后一片并标记中断；真实音频后端与 Electron 按钮导入，重复导入新增零片。

没有据此声称全场景零丢音：强制退出尾部未知，通话抢麦、整晚脱离充电录音、真实功耗、其他 Android 版本仍需验证。手表系统日期实测不准确，导入保留原时间并标为 `device_unverified`，不把它冒充电脑时间。

2026-10-13 的 v0.2.0 验证：412×502 真机首页无滚动，滑动前后控件位置与统计一致；原有6次录音保留、24份真实回执使待上传为0；锁屏权限仅声明锁屏且取消不锁，录音中锁屏后继续采集；浮窗跨应用显示、可拖动及返回、主页隐藏、停止后移除均通过。UI联调录音207.36秒、3,317,760样本、4份文件的采样覆盖与SHA均通过；该临时测试录音已备份到忽略的测试目录并从手表清理，测试授权也已撤销。40项统计断言、60项核心录音断言和178项Node回归通过。

后续按既定顺序：先测压缩与编码边界，再接 BLE 广播/GATT、续传和持久保存回执，之后用完整录音对照 VAD 的误删与预录补齐。iOS 接收需要增加会话/分片模型，长录音处理需要按批次绕开现有单次 4 小时上限。

2026-10-13 的 v0.3.0 在新手表 `0260401103344` 验证：红点截图像素在亮红和暗红之间交替；拖到左下 `[0,443][241,502]` 和右上均保持可操作；暂停期间两次清单的采样数同为255,200，反复暂停/继续仍是同一会话。暂停后结束正常退出服务；80秒、1,280,000样本、2份WAV的采样区间、PCM帧数和SHA均通过核对，无丢样记录。联调音频已备份到忽略的测试目录；原有数据不变。60项核心断言与40项统计断言通过。
