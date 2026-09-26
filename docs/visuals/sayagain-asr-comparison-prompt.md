# SayAgain 本地 ASR 对比图

生成方式：内置 image_gen；16:9 中文信息图。耗时来自仓库 `ios/docs/electron-asr-comparison.md`，不是通用芯片跑分。

价格口径：2026-09-27 查询到的美国二手/翻新挂牌样本范围，非国内成交均价、非全市场统计区间；容量、成色和保修有差异，iPad 上限样本已售罄。人民币约按 6.71 折算，取整且未含税运。不要将挂牌参考价用于声称精准性价比排名。

## 可复用提示词

```text
生成一张高质量中文数据可视化海报，横向16:9，目标2560×1440。用于 HOTPOOR SayAgain 的本地语音识别实测展示。风格精致简洁的科技产品发布会信息图，米白背景，黑色大字，整齐网格，宽裕留白，青绿、蓝色、琥珀三个设备强调色。中文必须清晰准确。不要制作界面截图，不要用虚构的柱长或速度计，不要生成无依据的准确率或性价比排名。
顶部品牌“SayAgain”，小标签“本地 ASR · 实机测试”。
大标题“同一段录音，速度相差多大？”
副标题“241.42 秒音频 · 相同 SenseVoice INT8 权重 · 相同 29 段”
主体三张并列设备卡片，真实感精致的设备小插画加芯片方块；电脑是2021款16英寸MacBook Pro（刘海屏），手机是iPhone 12 Pro（刘海屏而非灵动岛），平板是iPad mini 3（厚边框、圆形Home键），不能替换为新型号。芯片名称必须非常醒目，仅用文字芯片方块不要杜撰芯片内部结构。
左卡：
“MacBook Pro 16″”
“Apple M1 Max”
“64GB · Electron · CPU 4线程”
超大数字“4.44 秒”
“约 54.3× 实时速度”
“3轮中位数”
价格区明确标签“海外二手参考价”
“约 ¥8,700–10,100”
小字“US$1,300–1,500 · 64GB”
中卡：
“iPhone 12 Pro”
“Apple A14 Bionic”
“iOS · Release · CPU 1线程”
超大数字“69.15 秒”
“约 3.49× 实时速度”
“约 1分09秒”
价格区“海外二手参考价”
“约 ¥1,850–2,730”
小字“US$275–406 · 128/256GB”
右卡：
“iPad mini 3”
“Apple A7”
“iOS 12 · Debug · CPU 1线程”
超大数字“811.08 秒”
“约 0.30× 实时速度”
“约 13分31秒”
价格区“海外二手参考价”
“约 ¥270–610”
小字“US$40–91 · 16/64GB”
三卡下方横向总结带，醒目但小于主耗时数字：
“本次样例：Mac 转写速度约为 iPhone 的 15.6 倍、iPad 的 182.5 倍”
旁边或下一行小字“补充：Electron 不分段、直接整条转写为 14.34 秒”
底部脚注必须足够清晰，排成3行而不是密集小字：
“测试条件不同：桌面4线程，iOS 1线程；系统与运行库不同。iPhone 开启低电量模式，热状态 serious。”
“当前应用配置的单样例实测，非纯芯片跑分；未测识别准确率。本图为录音转文字，不是 TTS。”
“2026-09-27 查询｜美国二手/翻新挂牌样本，非国内成交均价；约按 US$1≈¥6.71 换算，未含税运。价格来源：eBay / OfferUp / Techloop / Back Market”
视觉层级：先读出三个耗时，再看芯片和倍率，再看价格。设备不成主角占据太多空间，信息图精美可分享，所有文字不越界，数字严格遵循以上给定内容。
```

## 价格与芯片来源

- [Mac M1 Max 64GB，US$1,300](https://techloop.repair/inventory)
- [Mac M1 Max 64GB，US$1,349.95](https://www.ebay.com/itm/297168061933)
- [Mac M1 Max 64GB，US$1,499](https://offerup.com/item/detail/d24634cd-c876-3d6a-b4d8-4760a493573d)
- [iPhone 12 Pro 128/256GB，US$275–405.86](https://www.backmarket.com/en-us/price-guide/iphone-12-pro)
- [iPad mini 3 16GB，US$39.99](https://www.ebay.com/itm/186199573954)
- [iPad mini 3 64GB，US$90.99（页面已售罄，仅参考挂牌）](https://www.ebay.com/itm/287124123818)
- [美元人民币汇率，2026-09-25约6.71](https://www.investing.com/currencies/usd-cny-historical-data)
- [iPhone 12 Pro芯片官方资料](https://support.apple.com/en-us/111875)
- [iPad mini 3芯片官方资料](https://support.apple.com/en-us/112018)
