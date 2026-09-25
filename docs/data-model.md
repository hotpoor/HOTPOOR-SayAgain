# 本地三库与数据协议 v0.1

本文件描述完整目标协议。当前已实现建表、三库事务读写、索引投影/重建、修订检查与一致备份；基础客户端已使用 profile、learning_config、expression、voice、voice_sample、asset。其余自动评估、任务与合成实体尚待实现。

## ID 与路由

实体 ID 采用 32 位小写十六进制格式。生成使用 UUID v4 去连字符的小写十六进制编码，格式 `[0-9a-f]{32}`，例如 `9f17a84073d24c3d82e21f0cd758a106`。SQL 按此格式校验。

- 标准 UUID 是 128 位标识，常规展示含连字符，去掉连字符为 32 个十六进制字符。
- MD5 是 128 位摘要，通常也显示为 32 个十六进制字符；外形相似，但不是 UUID 生成方式。不要用原句的 MD5 作为实体 ID：同一句话可对应不同会话、语言配置及练习记录。
- `0-9a-z` 可以定义为 Base36 自定义 ID，但需要另定生成方式、大小写与长度规则，不与十六进制 UUID 混用。
- 生成建议：Python `uuid.uuid4().hex`。保存为 TEXT/JSON string，不转成 JavaScript Number，也不存 SQLite INTEGER。
- `shard = int(block_id, 16) % 2 + 1`。结果 1 → SayAgain1；2 → SayAgain2。
- 因除数是 2，可精确地只解析最后一个十六进制字符：JS `parseInt(blockId.slice(-1), 16) % 2 + 1`，先严格校验整个 ID。
- ID 创建后不随语言、归档、音色或类型变化而改变。不得依赖整数尾数以外的随机 hash 实现。

## 文件结构

```text
<user-data>/
  SayAgain             # 索引 SQLite 文件
  SayAgain1            # entities 分库
  SayAgain2            # entities 分库
  assets/              # 参考录音、生成音频、波形、克隆提示
  models/              # 权重或可配置外部路径
  backups/
```

数据库文件使用上述名称，不带扩展名。代码仓库与用户数据目录分开。音频、模型与克隆提示存文件，不以 Base64 塞进 JSON；body 存 asset ID、相对路径、hash、格式、时长和状态。当前参考录音的 64 点波形摘要直接放在 voice_sample.body.waveform，避免为小型摘要创建文件；未来生成音频的大型波形资产仍可独立保存。路径解析须限制在配置的本地数据目录，外部导入先复制为受管资产。

## 数据库

SayAgain1 和 SayAgain2 各自只存在一张应用表：

```sql
entities(block_id TEXT PRIMARY KEY, body TEXT, createtime INTEGER, updatetime INTEGER)
```

`body` 必须是 JSON 对象。`createtime` / `updatetime` 是 UTC Unix 毫秒整数，创建时间不可覆盖，更新用 `max(now_ms, prior_updatetime)` 避免时钟回拨。用户界面按所选时区展示。

DDL 见 `storage/entities.sql`。采用 JSON1 的 json_valid/json_type 约束；应用启动时检查 SQLite 能力。SQLite 没有这里所需的专门 JSON 列类型，用 TEXT 存合法 JSON。

SayAgain 只存可重建投影：

| 表 | 用途 |
| --- | --- |
| entity_index | 定位分库、类型、所属 profile、状态、语言、发生时间、修订号 |
| dedupe_index | 对话评估幂等键、合成缓存键、资产 hash 定位 |
| relation_index | expression→evaluation、voice→sample、synthesis→asset 等关系与反向引用 |

DDL 见 `storage/index.sql`。设置和任务本体也放在 entities，不另建设置事实表；索引不是另一份事实来源。初期搜索通过筛选后的实体文本完成，数据规模要求时再在主库增加可重建的全文索引。

## body 公共字段

`schema_version`、`type`、`revision`、`profile_id`、`status`、`archived_at`、`deleted_at`、`links`、`dedupe_keys`。

`links` 为 `{relation, target_id}` 数组，供关系投影重建。`dedupe_keys` 为 `{scope, key}` 数组，供唯一性校验与重建。`status` 按实体类型取值，不用统一的 active/archived 代替任务状态；归档信息另存时间。不同类型字段由应用层/后续 JSON Schema 校验。`block_id` 与行时间不在 body 重复存储。

## 业务实体

| type | 关键字段 |
| --- | --- |
| profile | display_name、native_language、ui_language、timezone |
| learning_config | native_language、target_language、explanation_language、level、register、review_policy、default_voice_ids、auto_synthesize、playback_rate、waveform_expanded |
| integration | client、adapter_version、enabled_scopes、trigger_mode、last_event_at、last_ack_at；凭据仅用 keychain 引用 |
| conversation | client、external_conversation_id、title、learning_config_id |
| turn | conversation_id、external_turn_id、message_revision、source_text/片段、occurred_at、source_hash、role、ASR 来源/置信度 |
| evaluation | turn_id、learning_config_snapshot、input_hash、policy_version、evaluator/model、decision、reason、confidence、expression_ids、completed_at |
| expression | evaluation_id、source_span、original、improved、translation、explanation、pattern、language_pair、category、acceptance、source_occurred_at、content_revision |
| voice | name、note、default_sample_id、voice_revision、archived_at；可有多个关联样本 |
| voice_sample | voice_id、asset_id、recorded_at、language、transcript、transcript_verified、quality、duration_ms |
| voice_prompt | voice_id、sample_id、voice_revision、model_id/revision、prompt_asset_id、status |
| synthesis | expression_id/content_revision、text_snapshot、text_hash、voice_id/voice_revision、sample_id、model revision、language、parameters、asset_id、waveform_asset_id、duration_ms、cache_key、status |
| asset | relative_path、sha256、media_type、byte_size、duration_ms、sample_rate、channels、status |
| model_installation | provider、model_id、revision、local_path、checksum、backend、device、dtype、supported_languages、status |
| job | kind、target_id、idempotency_key、attempts、status、lease_owner、lease_expires_at、next_retry_at、error、result_id |
| practice_event | expression_id、synthesis_id、action、position_ms、speed、occurred_at |

时间语义必须分开：turn.occurred_at 是原消息时间；entities.createtime 是记录入库时间；voice_sample.recorded_at 是录制时间（导入无法确定则 null）；archived_at 是归档时间。不要把创建记录时间冒充原录音时间。

建议类别 category 为开放文字标签：去除首尾空白后 1–64 个 Unicode code point，不含控制或格式字符。Skill 按具体问题推理类别，优先用母语命名新类别；grammar / word_choice / naturalness / register / translation_practice 仅为兼容的常用示例，不是白名单。多语言用 BCP 47 标签；本地模型另有标签映射，不能拿 `en-US` 直接假定所有引擎都接受。source_span 统一为 Unicode code point 的半开区间，避免 JS UTF-16 与 Python 字符索引混淆。

## 关系与不变量

一个 profile 可有多组学习配置；一个 turn 可因多种目标语言/显式重评估产生多个 evaluation；一个 evaluation 可没有 expression 或产生多个 expression。一个 expression 可对应多个音色和合成版本。历史文本、语言和模型配置用快照保留。

音色备注变更增加 body.revision，不增加 voice_revision；替换默认参考样本或影响声线的配置才增加 voice_revision。归档不删除文件，不破坏历史 synthesis；新任务在执行前再次检查音色可用性。删除资产前查询反向引用并检查队列任务。

合成缓存键为稳定序列化后的 SHA-256，覆盖文本、目标语言、voice_revision、参考样本 hash、模型/权重 revision、影响音频的参数。不把播放速度、音色备注、展示字号放入生成缓存键。`synthesis` 保存当时文本，修改表达后不复用旧音频。

## 跨库写入

建议本地单一存储进程串行写入，宿主 Skill/客户端通过该服务或 CLI 提交结构化操作，不直接随意拼 SQL。

同一连接以磁盘上的 SayAgain 为 main，ATTACH 两个分库。使用 rollback journal（如 DELETE）、synchronous=FULL、busy_timeout；初始化时核验三库 journal_mode。一次 `BEGIN IMMEDIATE` 内写实体、主库投影和幂等键，全部成功再 COMMIT。修改采用 revision 比较，避免多客户端覆盖；解析/模型调用/音频生成在事务外执行。

SQLite 的 ATTACH 多库崩溃原子性要求 main 不为内存库且不使用 WAL；不能开启三个 WAL 库后声称跨库提交仍然原子。依据：https://www.sqlite.org/lang_attach.html 。文件系统仍需提供可靠锁与刷盘语义，不把活动库放在网盘同步目录。

运行时用主库 dedupe_index 唯一约束防重复事件，冲突返回已有结果。投影重建时对两个分库检查路由、body 协议、唯一键及引用，重复 key 是需处理的冲突，不静默覆盖。

文件写入流程：生成至临时文件 → 校验 hash/时长 → 原子重命名到最终路径 → 短事务提交 asset 与 synthesis。DB 回滚可能留下无引用文件，可延迟清理；成功 DB 不应指向尚未落盘的文件。文件与 SQLite 不是同一事务，恢复时检测缺失文件并标记 asset unavailable，而非伪造成功。

备份时暂停写入/任务落盘，复制三库与受管资产，保存 schema/routing version 清单后恢复写入。不能分别在线备份三个不同时间点而声称一致；恢复后跑路由、索引、引用与文件校验。


## 人物库与会话声音标签

`recording_person` 是本地 profile 下可跨会话引用的人物实体，保存 `name`、`note`、默认 `avatar` 和去重的 `avatars` 集合（最多100张经客户端缩放的图片）。人物与合成音色库分开，不存跨任务声纹身份推断。

会话 `speaker_profiles` 中的每个机器标签可显式指定 `person_id`，可选 `avatar_override` 表示仅此 Speaker 的头像。读取 state 时解析人物姓名、备注、默认头像和人物 revision；不把姓名复制到各段识别结果。修改人物姓名/备注对所有引用生效；上传或选择头像更新当前覆盖值并收入人物头像集合，不修改其他引用或人物默认头像。解除关联时保留当时的显示资料为本地备注。关联与资料更新使用版本检查和事务；不按同名或模型标签自动合并人物。

头像以内容哈希命名保存到 `assets/avatar-<sha256>.<ext>`，人物及 Speaker 字段存 `avatar:<sha256>.<ext>` 引用；默认图、图库和本次覆盖共用同一文件。读取 state 时解析为可显示图片，兼容旧版内嵌 data URL；相关记录保存时转换为文件引用。保留单条实体256 KiB限制，备份连同 assets 一起复制，不再把重复的 Base64 图像累计在人物或会话 JSON 中。

### 人物默认波形颜色与本次覆盖

`recording_person.color` 保存人物默认六位十六进制颜色（可为空）；`speaker_profiles.color_override` 是已关联 Speaker 的本次覆盖，未关联 Speaker 使用 `color`。返回 UI 的 `color` 为覆盖色或人物默认色，均无设置时按人物 ID / Speaker 标签稳定配色。修改默认颜色不会覆盖本次颜色。关联与解除关联保留显式本地颜色。人物页面通过带 revision 的 `saveRecordingPerson` 更新默认资料、颜色和头像集合，头像仍独立去重保存。
