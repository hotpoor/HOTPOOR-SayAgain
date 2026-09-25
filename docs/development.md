# 本地开发与验证

## 当前录音文件开发入口

截至 2026-09-25：录音文件当前走导入 / 停止录音 → VAD → CAMPPlus 与整批 KMeans → 拆条 → SenseVoice 自动转写 → 人工校对。无需先确认候选说话人；重新转写前须保存边界编辑。文件导入使用原生 FFmpeg，单文件上限 2 GiB、单任务最多 4 小时；不要将音色参考样本限制套用于录音文件。代码入口是 `desktop/speaker-pipeline.cjs` 和 `workers/speaker_pipeline.py`。

详细流程见 [录音策略](speaker-pipeline.md)，与 Freenote / PatchxNote 的主要区别和证据边界见 [README 对比章节](../README.md#与-freenote--patchxnote-的录音处理策略对比)。下文早期桌面或音色功能说明不能用来替代当前录音文件策略。

## 启动

```sh
npm ci
npm start
```

基础桌面客户端使用 Electron、原生 HTML/CSS/JavaScript 和 Node 内置 SQLite，不需要 Python。Node 版本要求见 package.json；部分 Node 版本会为 node:sqlite 显示 ExperimentalWarning。依赖版本由 package-lock.json 固定，Electron 运行组件首次使用时可能联网下载。

应用没有在线服务依赖，也不预装模型。macOS 是当前已验证平台；尚未验证 Windows / Linux、制作安装包或做应用签名。

## 已可使用的流程

1. 选择母语和目标语言。支持输入标准语言代码，不将文本练习范围绑定到 TTS 支持列表。
2. 手动录入原句、建议表达、母语译文、原因和句型；搜索、收藏、归档或恢复。当前还没有自动评估、批量导入或表达正文编辑。
3. 新建多个音色，编辑名称与备注；为一个音色录制或导入多个参考样本，试听并选择默认样本。
4. 参考录音支持波形、进度拖动和 0.75× 慢放；未接入合成前，表达页面明确显示合成功能开发中。
5. 归档音色保留录音并清空默认音色选择，恢复后可以继续使用。录音日期与导入日期分开处理，不把导入时刻冒充原始录制时间。
6. 设置页可保存新语言对和导出数据备份。当前是一套活动语言配置；历史表达保留各自语言对，可切换显示所有语言，尚无多配置管理器。

每段录音最多 25 MB / 10 分钟。浏览器解码音频并提取波形；本地服务校验格式、大小与元数据，生成独立文件，JSON 保存引用。音色资料和参考样本不等于已经训练或生成了克隆声音。

## 数据位置与备份

应用将 SayAgain、SayAgain1、SayAgain2 及 assets 放在 Electron 用户目录的 data 子目录内。设置页显示准确路径。SAYAGAIN_DATA_DIR 必须为绝对路径，它覆盖用户目录，数据库仍位于其 data 子目录。

备份通过设置页选择父目录，新建带时间戳的备份文件夹，包含三个数据库、assets 和 manifest.json。存储写入和文件提交在主进程串行执行，备份期间持有跨库写锁，避免多个时点混合。

当前没有图形恢复按钮。如需验证恢复，复制备份到一个新的独立用户目录的 data 子目录，用 SAYAGAIN_DATA_DIR 指向该用户目录启动，不覆盖原始数据。测试已验证备份可重新打开及录音字节一致，未完成系统断电或磁盘故障验证。

## 代码入口

| 目录 / 文件 | 内容 |
| --- | --- |
| desktop/main.cjs | Electron 生命周期、限定 IPC、权限与本地音频协议 |
| desktop/preload.cjs | 页面可调用的业务接口，不暴露通用执行能力 |
| desktop/service.cjs | 语言、表达、音色、录音与备份业务 |
| storage/store.cjs | 三庫路由、实体与索引事务、修订检查与重建 |
| renderer/ | 页面、布局、表单、录音与播放 |
| tests/storage.test.cjs | 隔离 SQLite 与业务测试 |
| scripts/smoke-desktop.cjs | 使用真实 Electron、模拟麦克风的端到端检查 |

每个分库严格只有一张 entities 应用表。所有业务写入在一个连接的 ATTACH 事务中更新实体和索引，使用 DELETE 日志与 synchronous=FULL。主进程单实例和修订号检查避免重复窗口及过时写入。

## 验证

```sh
npm test
npm run test:desktop
npm run docs:check
```

桌面检查使用临时用户目录、虚构表达与模拟麦克风，不接触真实用户目录，不调用云模型。截图输出到被 Git 忽略的 test-results；README 的截图是经过检查的虚构示例。测试会真实打开窗口，期间不要操作该测试窗口。

麦克风链路已在模拟设备下验证，真实设备权限、环境噪声、听感和跨平台行为仍需分别检查。合成、模型安装和逐轮客户端接入尚未实现，不在通过的测试范围内。
