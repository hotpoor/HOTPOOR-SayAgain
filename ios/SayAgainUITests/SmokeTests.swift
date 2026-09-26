import XCTest
final class SmokeTests: XCTestCase {
    func testLocalASRFullRecording() {
        continueAfterFailure = false
        let app = XCUIApplication();app.launch();app.buttons["workspace-1"].tap()
        XCTAssertTrue(app.tables.cells.firstMatch.waitForExistence(timeout:5));app.tables.cells.firstMatch.tap()
        let original = app.textViews["text"].value as? String
        for _ in 0..<6 {if app.buttons["本机离线转写 · 整条录音"].isHittable {break};app.swipeUp()}
        app.buttons["本机离线转写 · 整条录音"].tap()
        let result = app.staticTexts["local-asr-result"]
        let ready = NSPredicate(format:"label BEGINSWITH %@ OR label BEGINSWITH %@","本机整段转写完成","本机转写停止或失败")
        expectation(for:ready,evaluatedWith:result,handler:nil);waitForExpectations(timeout:1800,handler:nil)
        let shot = XCTAttachment(screenshot:app.screenshot());shot.name = "SayAgain-iPad-local-asr-full";shot.lifetime = .keepAlways;add(shot)
        let report = XCTAttachment(string:result.label);report.name = "Local-ASR-measurements";report.lifetime = .keepAlways;add(report)
        XCTAssertTrue(result.label.hasPrefix("本机整段转写完成"),result.label)
        XCTAssertEqual(app.textViews["text"].value as? String,original)
        let saved = result.label
        app.terminate();app.launch();app.buttons["workspace-1"].tap();app.tables.cells.firstMatch.tap()
        XCTAssertEqual(app.staticTexts["local-asr-result"].label,saved)
        XCTAssertEqual(app.textViews["text"].value as? String,original)
    }
    func testLocalASRCancelKeepsDraft() {
        continueAfterFailure = false
        let app = XCUIApplication();app.launch();app.buttons["workspace-1"].tap()
        XCTAssertTrue(app.tables.cells.firstMatch.waitForExistence(timeout:5));app.tables.cells.firstMatch.tap()
        let original = app.textViews["text"].value as? String
        let saved = app.staticTexts["local-asr-result"].label
        XCTAssertTrue(saved.hasPrefix("本机整段转写完成"),"Run full-recording verification first")
        for _ in 0..<6 {if app.buttons["停止本机转写"].isHittable {break};app.swipeUp()}
        app.buttons["本机离线转写 · 整条录音"].tap();app.buttons["停止本机转写"].tap()
        let result = app.staticTexts["local-asr-result"]
        expectation(for:NSPredicate(format:"label BEGINSWITH %@","本机转写停止或失败"),evaluatedWith:result,handler:nil)
        waitForExpectations(timeout:180,handler:nil)
        XCTAssertTrue(result.label.contains("尚未生成新段落"),result.label)
        XCTAssertTrue(result.label.hasSuffix(saved))
        XCTAssertEqual(app.textViews["text"].value as? String,original)
        app.terminate();app.launch();app.buttons["workspace-1"].tap();app.tables.cells.firstMatch.tap()
        XCTAssertEqual(app.staticTexts["local-asr-result"].label,saved)
    }
    func testReviewWaveformLayout() {
        continueAfterFailure = false
        let app = XCUIApplication();app.launch();app.buttons["workspace-0"].tap()
        XCTAssertTrue(app.tables.cells.firstMatch.waitForExistence(timeout:5))
        let list = XCTAttachment(screenshot:app.screenshot());list.name = "SayAgain-iPad-review-redesign";list.lifetime = .keepAlways;add(list)
        let inline = app.buttons.matching(NSPredicate(format:"identifier BEGINSWITH %@","review-play-")).firstMatch
        XCTAssertTrue(inline.isHittable);inline.tap()
        let wave = app.otherElements["audio-waveform"].firstMatch
        XCTAssertTrue(wave.waitForExistence(timeout:5));XCTAssertEqual(wave.label,"音频波形，已加载")
        wave.coordinate(withNormalizedOffset:CGVector(dx:0.45,dy:0.5)).tap()
        inline.tap()
        app.buttons["查看与编辑  ›"].firstMatch.tap()
        XCTAssertTrue(app.textViews["original"].waitForExistence(timeout:5))
        for _ in 0..<4 {if app.buttons["play-local-audio"].isHittable {break};app.swipeUp()}
        XCTAssertTrue(app.buttons["play-local-audio"].isEnabled)
        XCTAssertFalse(app.buttons["choose-speech-model"].isHittable)
        let detail = XCTAttachment(screenshot:app.screenshot());detail.name = "SayAgain-iPad-review-detail-redesign";detail.lifetime = .keepAlways;add(detail)
        app.buttons["play-local-audio"].tap()
        let detailWave = app.otherElements["audio-waveform"].firstMatch
        XCTAssertEqual(detailWave.label,"音频波形，已加载")
        detailWave.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).tap()
        let playing = XCTAttachment(screenshot:app.screenshot());playing.name = "SayAgain-iPad-waveform-playing";playing.lifetime = .keepAlways;add(playing)
        app.buttons["speech-settings-toggle"].tap()
        for _ in 0..<3 {if app.buttons["choose-speech-model"].isHittable {break};app.swipeUp()}
        XCTAssertTrue(app.buttons["choose-speech-model"].isHittable)
        app.buttons["choose-speech-model"].tap()
        XCTAssertTrue(app.tables.cells["speech-model-qwen3-tts-vc-2026-01-22"].waitForExistence(timeout:5))
        app.navigationBars.buttons.element(boundBy:0).tap()
        app.buttons["speech-settings-toggle"].tap()
    }
    func testInferenceBindingSetup() {
        continueAfterFailure = false
        let app = XCUIApplication();app.launch();app.buttons["workspace-4"].tap();app.buttons["大模型 API 配置"].tap()
        app.segmentedControls.buttons["inference"].tap()
        XCTAssertFalse(app.secureTextFields["model-key"].isHittable)
        app.buttons["管理 AK / 使用 AK 配置"].tap()
        XCTAssertTrue(app.buttons["＋ 添加管理 AK"].waitForExistence(timeout:5))
        XCTAssertTrue(app.buttons["＋ 添加使用 AK"].exists)
        app.buttons["＋ 添加管理 AK"].tap()
        XCTAssertTrue(app.secureTextFields["inference-ak-secret"].waitForExistence(timeout:5))
        app.textViews["ak-name"].tap();app.textViews["ak-name"].typeText("Test manager")
        app.buttons["验证并保存 AK"].tap()
        XCTAssertTrue(app.alerts.staticTexts["请填写管理 AK（sk-mgmt-v1-…）"].waitForExistence(timeout:5))
        app.alerts.buttons["好"].tap()
        app.navigationBars.buttons.element(boundBy:0).tap()
        app.buttons["＋ 添加使用 AK"].tap()
        app.buttons["选择匹配的管理 AK"].tap()
        XCTAssertTrue(app.alerts.staticTexts["请先添加并启用管理 AK"].waitForExistence(timeout:5))
        app.alerts.buttons["好"].tap()
        let shot = XCTAttachment(screenshot:app.screenshot());shot.name = "SayAgain-iPad-inference-binding";shot.lifetime = .keepAlways;add(shot)
    }
    func testPlaybackControls() {
        continueAfterFailure = false
        let app = XCUIApplication();app.launch();app.buttons["workspace-4"].tap();app.buttons["阅读与播放 · 字号和音量"].tap();app.buttons["恢复默认字号与音量"].tap()
        XCTAssertTrue(app.staticTexts["音量 100%"].exists);XCTAssertTrue(app.staticTexts["字号 100%"].exists)
        app.buttons["workspace-0"].tap();if !app.textViews["original"].exists {app.tables.cells.firstMatch.tap()}
        for _ in 0..<6 {if app.buttons["play-local-audio"].isHittable {break};app.swipeUp()}
        XCTAssertTrue(app.buttons["play-local-audio"].isEnabled)
        app.buttons["play-local-audio"].tap();app.otherElements["audio-waveform"].firstMatch.coordinate(withNormalizedOffset:CGVector(dx:0.4,dy:0.5)).tap();app.sliders["playback-volume"].adjust(toNormalizedSliderPosition:0.3)
        XCTAssertTrue(app.otherElements["audio-waveform"].firstMatch.isEnabled)
        let shot = XCTAttachment(screenshot:app.screenshot());shot.name = "SayAgain-iPad-local-playback";shot.lifetime = .keepAlways;add(shot)
        app.buttons["workspace-4"].tap();app.buttons["恢复默认字号与音量"].tap()
        XCTAssertTrue(app.staticTexts["音量 100%"].exists)
    }
    func testReadingPlaybackAndModels() {
        continueAfterFailure = false
        let app = XCUIApplication();app.launch();app.buttons["workspace-4"].tap()
        app.buttons["阅读与播放 · 字号和音量"].tap()
        let font = app.sliders["global-font-size"],volume = app.sliders["global-volume"]
        func position(_ slider:XCUIElement)->CGFloat {CGFloat(Float((slider.value as? String ?? "100%").replacingOccurrences(of:"%",with:"")) ?? 100)/100}
        app.buttons["恢复默认字号与音量"].tap()
        font.adjust(toNormalizedSliderPosition:0.8);volume.adjust(toNormalizedSliderPosition:0.4)
        let appliedFont = font.value as? String,appliedVolume = volume.value as? String
        let prefs = XCTAttachment(screenshot:app.screenshot());prefs.name = "SayAgain-iPad-reading-preferences";prefs.lifetime = .keepAlways;add(prefs)
        app.terminate();app.launch();app.buttons["workspace-4"].tap();app.buttons["阅读与播放 · 字号和音量"].tap()
        XCTAssertEqual(font.value as? String,appliedFont);XCTAssertEqual(volume.value as? String,appliedVolume)
        app.buttons["恢复默认字号与音量"].tap()
        app.navigationBars.buttons.element(boundBy:0).tap();app.buttons["默认语音模型"].tap()
        let old = app.tables.cells.matching(NSPredicate(format:"value == %@","当前默认模型")).firstMatch.identifier
        let models = XCTAttachment(screenshot:app.screenshot());models.name = "SayAgain-iPad-model-picker";models.lifetime = .keepAlways;add(models)
        let selected = "speech-model-qwen-audio-3.1-tts-flash";app.tables.cells[selected].tap()
        app.buttons["workspace-0"].tap();if !app.textViews["original"].exists {app.tables.cells.firstMatch.tap()}
        for _ in 0..<5 {if app.buttons["speech-settings-toggle"].isHittable {break};app.swipeUp()};app.buttons["speech-settings-toggle"].tap()
        for _ in 0..<5 {if app.buttons["choose-speech-model"].isHittable {break};app.swipeUp()}
        XCTAssertTrue(app.buttons["choose-speech-model"].label.contains("3.1"));XCTAssertTrue(app.sliders["playback-volume"].exists)
        let review = XCTAttachment(screenshot:app.screenshot());review.name = "SayAgain-iPad-speech-panel";review.lifetime = .keepAlways;add(review)
        app.buttons["generate-speech"].tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout:5))
        if app.alerts.buttons["继续"].exists {XCTAssertTrue(app.alerts.staticTexts.matching(NSPredicate(format:"label CONTAINS %@","Qwen-Audio 3.1")).firstMatch.exists);app.alerts.buttons["取消"].tap()}else if app.alerts.buttons["好"].exists {app.alerts.buttons["好"].tap()}
        app.buttons["choose-speech-model"].tap();if !old.isEmpty {for _ in 0..<6 {if app.tables.cells[old].isHittable {break};app.swipeUp()};app.tables.cells[old].tap()}
    }
    func testFirstReviewSpeechEntry() {
        continueAfterFailure = false
        let app = XCUIApplication();app.launch();app.buttons["workspace-0"].tap()
        XCTAssertTrue(app.tables.cells.firstMatch.waitForExistence(timeout:5),"Expected the user's first review")
        if !app.textViews["original"].exists {app.tables.cells.firstMatch.tap()}
        let first = XCTAttachment(screenshot:app.screenshot());first.name = "SayAgain-iPad-first-review";first.lifetime = .keepAlways;add(first)
        for _ in 0..<8 {if app.buttons["generate-speech"].isHittable {break};app.swipeUp()}
        XCTAssertTrue(app.buttons["generate-speech"].isHittable)
        XCTAssertTrue(app.buttons["play-local-audio"].exists)
        XCTAssertTrue(app.buttons["export-local-audio"].exists)
        app.buttons["generate-speech"].tap()
        let state = XCTAttachment(screenshot:app.screenshot());state.name = "SayAgain-iPad-first-review-speech";state.lifetime = .keepAlways;add(state)
        // Inspect prerequisites / confirmation without automatically purchasing synthesis.
        if app.alerts.buttons["取消"].exists {app.alerts.buttons["取消"].tap()}else if app.alerts.buttons["好"].exists {app.alerts.buttons["好"].tap()}
    }
    func testQwenAccounts() {
        continueAfterFailure = false
        let app = XCUIApplication();app.launch();app.buttons["workspace-4"].tap();app.buttons["千问账号配置"].tap()
        func addAccount(_ name:String,_ secret:String) {
            app.buttons["＋ 添加千问账号"].tap()
            XCTAssertFalse(app.textViews["model-url"].exists);XCTAssertFalse(app.textViews["model-id"].exists)
            app.textViews["qwen-account-name"].tap();app.textViews["qwen-account-name"].typeText(name)
            app.secureTextFields["qwen-account-key"].tap();app.secureTextFields["qwen-account-key"].typeText(secret)
            app.buttons["保存账号"].tap();XCTAssertTrue(app.buttons["＋ 添加千问账号"].waitForExistence(timeout:5))
        }
        addAccount("Account Test A","account-test-a");addAccount("Account Test B","account-test-b")
        app.buttons["设为当前：Account Test B"].tap()
        app.terminate();app.launch();app.buttons["workspace-4"].tap();app.buttons["千问账号配置"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format:"label CONTAINS %@","Account Test B · 当前账号")).firstMatch.exists)
        app.buttons["编辑：Account Test A"].tap();XCTAssertEqual(app.secureTextFields["qwen-account-key"].value as? String,"")
        app.buttons["保存账号"].tap();XCTAssertTrue(app.buttons["设为当前：Account Test A"].waitForExistence(timeout:5));app.buttons["设为当前：Account Test A"].tap()
        let shot = XCTAttachment(screenshot:app.screenshot());shot.name = "SayAgain-iPad-qwen-accounts";shot.lifetime = .keepAlways;add(shot)
        for name in ["Account Test A","Account Test B"] {
            app.buttons["删除：" + name].tap();app.alerts.buttons["删除"].tap()
        }
        XCTAssertFalse(app.buttons["编辑：Account Test B"].exists)
    }
    func testTextModelConfiguration() {
        continueAfterFailure = false
        let app = XCUIApplication();app.launch();app.buttons["workspace-4"].tap()
        app.buttons["大模型 API 配置"].tap()
        XCTAssertTrue(app.textViews["model-url"].waitForExistence(timeout:5))
        app.segmentedControls.buttons["inference"].tap()
        XCTAssertTrue((app.textViews["model-url"].value as? String ?? "").contains("model.service-inference.ai"))
        XCTAssertFalse(app.segmentedControls.buttons["千问"].exists)
        app.segmentedControls.buttons["自定义"].tap()
        XCTAssertTrue(app.secureTextFields["model-key"].exists)
        let shot = XCTAttachment(screenshot:app.screenshot());shot.name = "SayAgain-iPad-text-models";shot.lifetime = .keepAlways;add(shot)
    }
    func testVoiceReadingSetup() {
        continueAfterFailure = false
        let app = XCUIApplication();app.launch()
        app.buttons["workspace-3"].tap()
        app.navigationBars.buttons["add-entry"].tap()
        app.buttons["独立录制 · 中文朗读约30秒"].tap()
        XCTAssertTrue(app.textViews["voice-script"].waitForExistence(timeout:5))
        XCTAssertTrue((app.textViews["voice-script"].value as? String ?? "").contains("承认不知道"))
        XCTAssertEqual(app.textViews["voice-name"].value as? String,"我的声音")
        let picture = XCTAttachment(screenshot:app.screenshot());picture.name = "SayAgain-iPad-voice-reading";picture.lifetime = .keepAlways;add(picture)
        for _ in 0..<5 {if app.buttons["保存为我的音色"].isHittable {break};app.swipeUp()}
        app.buttons["保存为我的音色"].tap()
        XCTAssertTrue(app.alerts.staticTexts["请录制 10–60 秒的声音后保存"].waitForExistence(timeout:5))
        app.alerts.buttons["好"].tap()
        app.navigationBars.buttons["返回"].tap()
        XCTAssertTrue(app.navigationBars.buttons["add-entry"].waitForExistence(timeout:5))
    }
    func testConfiguredCompanionConnection() {
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        app.buttons["workspace-4"].tap()
        XCTAssertTrue(app.textViews["base"].waitForExistence(timeout:10))
        XCTAssertFalse((app.textViews["base"].value as? String ?? "").isEmpty, "This device must have the companion bootstrap configuration installed.")
        app.buttons["检查 API 能力"].tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout:20))
        XCTAssertTrue(app.alerts.staticTexts.matching(NSPredicate(format:"label CONTAINS %@", "转写")).firstMatch.exists, "Expected companion capabilities rather than a transport error.")
        let screenshot = XCTAttachment(screenshot:app.screenshot())
        screenshot.name = "SayAgain-iPad-companion-capabilities"; screenshot.lifetime = .keepAlways; add(screenshot)
        app.alerts.buttons["好"].tap()
    }
    func testOfflineExpressionAndPersistence() {
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        app.navigationBars.buttons["add-entry"].tap()
        let original = app.textViews["original"]
        XCTAssertTrue(original.waitForExistence(timeout:10)); original.tap(); original.typeText("SayAgain iPad smoke test")
        app.textViews["improved"].tap(); app.textViews["improved"].typeText("SayAgain runs on this iPad.")
        app.navigationBars.buttons["保存"].tap(); XCTAssertTrue(app.alerts.staticTexts["已保存到这台 iPad"].waitForExistence(timeout:5)); app.alerts.buttons["好"].tap()
        app.navigationBars.buttons["返回"].tap()
        XCTAssertTrue(app.tables.cells.containing(.staticText,identifier:"SayAgain runs on this iPad.").firstMatch.waitForExistence(timeout:5))
        app.terminate(); app.launch()
        let row = app.tables.cells.containing(.staticText,identifier:"SayAgain runs on this iPad.").firstMatch
        XCTAssertTrue(row.waitForExistence(timeout:10))
        let screenshot = XCTAttachment(screenshot:app.screenshot()); screenshot.name = "SayAgain-iPad-expressions"; screenshot.lifetime = .keepAlways; add(screenshot)
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(app.buttons["workspace-4"].waitForExistence(timeout:5))
        let landscape = XCTAttachment(screenshot:app.screenshot());landscape.name = "SayAgain-iPad-landscape";landscape.lifetime = .keepAlways;add(landscape)
        XCUIDevice.shared.orientation = .portrait
        row.tap()
        if app.buttons["编辑分类与更多操作  ▾"].exists {for _ in 0..<8 {if app.buttons["编辑分类与更多操作  ▾"].isHittable {break};app.swipeUp()};app.buttons["编辑分类与更多操作  ▾"].tap()}
        for _ in 0..<8 {if app.buttons["归档此条"].isHittable {break};app.swipeUp()}
        app.buttons["归档此条"].tap()
        app.navigationBars.buttons["归档"].tap(); XCTAssertTrue(app.tables.cells.containing(.staticText,identifier:"SayAgain runs on this iPad.").firstMatch.waitForExistence(timeout:5))
        app.buttons["workspace-1"].tap()
        app.buttons["workspace-2"].tap()
        app.buttons["workspace-3"].tap()
        app.buttons["workspace-4"].tap()
        XCTAssertTrue(app.textViews["base"].waitForExistence(timeout:5))
        let settings = XCTAttachment(screenshot:app.screenshot());settings.name = "SayAgain-iPad-settings";settings.lifetime = .keepAlways;add(settings)
    }
}
