# SayAgain 产品效果图 v2：音频项目

![音频项目效果图 v2](sayagain-product-overview-audio-v2.png)

2026-10-11 使用内置 `image_gen`，在[第一版](sayagain-product-overview-16x9.md)上修订电脑端音频界面。用户已明确本次调整对象是产品效果图；**未修改运行中的客户端代码**。成图 1672 × 941 px。

## 调整

- 收紧电脑端标题、头像、按钮、行距与波形区域，提升可见片段数量。
- 明确三层关系：原音频文件 → 同一人的连续发言 → 独立片段。示例包含小夏三段、小林两段、小陈一段，人物头像姓名按连续发言分组展示；每段仍保留序号、起止时间及播放、校对入口。
- 显示第二个可折叠文件，保留多文件会话结构。
- 展示独立备注交互提案：备注属于当前句子/片段，与识别原文分开展示；选中一段时在其下方展开编辑和保存操作。已有备注显示摘要与数量，未备注的段落保留添加入口。

## 与现有功能的关系

文件分组、片段时间、独立试听、候选人物、连续同一人物共享身份栏均已有实现，其中共享身份栏目前只在紧凑视图展示。

**独立逐句备注属于设计提案。** 当前「编辑 → 修改文字与笔记」实际更新该录音片段的 `transcript`，尚无独立句级备注字段；保存人工修订后优先显示人工全文。后续实现图中交互时，需要单独保存备注并关联具体句子/片段，保留转写原文；不能用修改转写全文来假装独立备注已保存。示意里每个片段用一句短话展示，不代表当前模型已经完成语义逐句断句。

人物、文字、时长、文件数量、波形与备注均为演示内容，本图不作为真实推理证据。手机界面沿用第一版的表达回顾与已保存音频播放。

## 依据

- [录音界面与连续分组](../../renderer/recordings.js)
- [录音呈现规则](../../renderer/recording-view.js)
- [录音文字保存](../../desktop/recordings.cjs)
- [第一版效果图及素材](sayagain-product-overview-16x9.md)

## 编辑提示词

```text
Use case: ui-mockup / precise-object-edit.
Edit the supplied SayAgain product poster. Keep the whole poster, existing SayAgain two-bubble logo and creator credit, pale silver background, laptop and phone geometry, headline, feature list, footer, phone screen, shadows and lighting unchanged. Redesign ONLY the UI inside the laptop screen to address the user's feedback: oversized UI, missing audio segmentation, missing same-speaker consecutive-segment grouping, missing sentence-by-sentence annotation workflow. Treat this laptop UI as a design proposal grounded in SayAgain's existing audio project workflow.

Critical visual goal: a compact, readable desktop application. Reduce laptop title, header buttons, avatars, paddings and line spacing by about 25%. A subtle 12–14px-equivalent UI text system, 20px-equivalent page title, 26–30px header buttons, 24px speaker avatars, and 8–12px spacings. Do not scale all content into unreadably tiny text. Show materially MORE segmented content and fewer giant open spaces. Keep thin gray separators, open white content, muted slate-purple and blue accents, black main controls. Avoid balloon cards and repeated massive avatars.

Laptop page:
Keep a slim real navigation sidebar "SayAgain", "表达回顾", "我的音色", "我的音频" selected, "归档列表", "人物形象", "设置", "本地工作空间".
Compact page header "产品合作沟通", metadata "3 位说话人 · 2 个音频文件". Three SMALL buttons at top right: "开始录音", "导入音频", "导出文字".
One compact view/filter row: "紧凑视图" selected; "对话视图"; "全部说话人"; "时间正序".
The broad middle column must visibly contain segmented original audio. File group header "01  产品合作沟通.wav" with chevron, "18:26 · 14 个片段", small "整体播放" button. A shallow 35–45px waveform with real-looking distinct speaker-colored sections and a fine playback cursor. Time display "00:16 / 18:26".
Below waveform, show six independently visible consecutive audio SEGMENT ROWS, organized into THREE speaker runs. Each speaker run displays ONE small avatar and NAME in its left rail; a subtle colored vertical line connects the multiple independent row boundaries for that person. For the first run, label "小夏" once, with THREE rows (01,02,03). For next run, label "小林" once, with TWO rows (04,05). Last run label "小陈" once, with ONE row (06). DO NOT repeat a giant avatar for every row. DO NOT merge segments into one long paragraph. Every row keeps its own segment number, start/end timestamp, transcript and tiny playback + annotation controls. Thin horizontal separators preserve independent segments within the same person's run.

Exact segment content and time ranges (legible correct Chinese, compact):
Small label "01  00:00–00:08   已校对"
Transcript "先把表达练习做好。"
Action at row right: tiny play icon, pencil icon, "备注 1".
Under that transcript show a small distinct muted annotation line "备注：先完成表达练习闭环。"
Small label "02  00:08–00:16   已校对"
Transcript "再把能力共享给合作产品。"
Action at row right: tiny play icon, pencil icon, "备注 1".
Expand ONLY this row's annotation editor beneath it: small label "第 02 段备注", a shallow input/textarea holding "不同合作方按业务组织页面。", tiny "保存" and "取消". Annotation text must be visually separated from recognized spoken transcript. Row highlight a very light pale blue to indicate selected segment.
Small label "03  00:16–00:24   待校对"
Transcript "页面入口需要灵活组织。"
Action at row right: play icon, pencil icon, "添加备注".
Then start next speaker run:
Small label "04  00:24–00:33   已校对"
Transcript "保留分段，每一段都能独立试听。"
Action: play icon, pencil icon, "添加备注".
Small label "05  00:33–00:44   待校对"
Transcript "同一个人的连续发言放在一起。"
Action: play icon, pencil icon, "备注 1".
Small annotation beneath: "备注：只合并展示，保留片段边界。"
Then start third speaker:
Small label "06  00:44–00:52   待校对"
Transcript "备注跟着这句话保存，之后方便回看。"
Action: play icon, pencil icon, "添加备注".

A slim right sidebar labelled "说话人" with only three small avatar rows "小夏", "小林", "小陈", subtitle "人工关联". Below a delicate divider a small unobtrusive explanatory note "分段独立 · 连续发言分组 · 每句备注". Do not create a huge reserved empty right card.
At bottom of middle content, show another collapsed file header "02  补充录音.wav   03:12 · 6 个片段" with right-facing chevron. This makes the multiple-audio project structure explicit.
No giant buttons on each sentence. No speech bubbles taking half the display. Compact content, consistent per-row tiny actions, clear three levels: audio FILE → same-SPEAKER run → independent SEGMENT. Notes belong to the selected individual sentence/segment; source transcript stays intact. Long lists scroll vertically.
Preserve the existing poster composition exactly. No unrelated UI feature changes, no cloud/sync/meeting summaries/action items/automatic identity claims, no new logos. Avoid random repeated words and malformed Chinese. Generate the final complete landscape poster in high resolution.
```
