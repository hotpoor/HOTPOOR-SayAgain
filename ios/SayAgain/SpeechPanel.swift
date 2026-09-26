import UIKit

final class PanelButton:UIButton {
    var run:(()->Void)?
    init(_ title:String,primary:Bool = false){super.init(frame:.zero);setTitle(title,for:.normal);setTitleColor(primary ? .white : brand,for:.normal);backgroundColor = primary ? brand : .white;layer.cornerRadius = 10;layer.borderWidth = primary ? 0 : 1;layer.borderColor = UIColor(white:0.87,alpha:1).cgColor;titleLabel?.font = .systemFont(ofSize:15,weight:.semibold);titleLabel?.numberOfLines = 0;contentEdgeInsets = UIEdgeInsets(top:12,left:16,bottom:12,right:16);heightAnchor.constraint(greaterThanOrEqualToConstant:46).isActive = true;addTarget(self,action:#selector(tapped),for:.touchUpInside)}
    required init?(coder:NSCoder){fatalError()}
    @objc func tapped(){run?()}
}
final class SpeechPanel:UIView {
    let stack = UIStackView();let model = PanelButton("选择模型");let voice = PanelButton("选择音色");let account = PanelButton("选择账号");let generate = PanelButton("生成语音");let play = PanelButton("▶",primary:true);let export = PanelButton("导出音频");let stop = PanelButton("取消生成");let volume = UISlider();let seek = UISlider();let clock = UILabel();let volumeText = UILabel();let status = UILabel();let waveform = AudioWaveform();let configuration = UIStackView();let settings = PanelButton("音色与模型  ▾");let summary = UILabel();let playback = UIStackView()
    var volumeChanged:((Float)->Void)?;var seekChanged:((Float)->Void)?
    override init(frame:CGRect){super.init(frame:frame);backgroundColor = .white
        stack.axis = .vertical;stack.spacing = 10;stack.translatesAutoresizingMaskIntoConstraints = false;addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo:leadingAnchor),stack.trailingAnchor.constraint(equalTo:trailingAnchor),stack.topAnchor.constraint(equalTo:topAnchor),stack.bottomAnchor.constraint(equalTo:bottomAnchor)])
        let rule = UIView();rule.backgroundColor = UIColor(white:0.9,alpha:1);rule.heightAnchor.constraint(equalToConstant:1).isActive = true;stack.addArrangedSubview(rule)
        let title = UILabel();title.text = "用我的声音听与练";title.font = .systemFont(ofSize:14,weight:.medium);title.textColor = .darkGray
        let heading = UIStackView(arrangedSubviews:[title,generate]);heading.alignment = .center;heading.spacing = 8;stack.addArrangedSubview(heading)
        for button in [generate,export,settings] {button.layer.borderWidth = 0;button.contentEdgeInsets = UIEdgeInsets(top:8,left:0,bottom:8,right:0);button.titleLabel?.font = .systemFont(ofSize:13);button.setContentHuggingPriority(.required,for:.horizontal)}
        generate.accessibilityIdentifier = "generate-speech";play.accessibilityIdentifier = "play-local-audio";play.accessibilityLabel = "播放本地语音";export.accessibilityIdentifier = "export-local-audio"
        summary.font = .systemFont(ofSize:12);summary.textColor = .gray;summary.numberOfLines = 0;stack.addArrangedSubview(summary)
        playback.axis = .horizontal;playback.spacing = 12;playback.alignment = .center;playback.addArrangedSubview(play);playback.addArrangedSubview(waveform);play.widthAnchor.constraint(equalToConstant:44).isActive = true;play.contentEdgeInsets = .zero;play.layer.cornerRadius = 22;stack.addArrangedSubview(playback)
        waveform.seek = {[weak self] value in self?.seekChanged?(value)}
        seek.minimumValue = 0;seek.maximumValue = 1;seek.accessibilityIdentifier = "audio-seek";seek.addTarget(self,action:#selector(scrub),for:.valueChanged)
        // The waveform is the visible scrubber; this accessible slider also supports automation.
        seek.isHidden = true;stack.addArrangedSubview(seek)
        clock.font = .monospacedDigitSystemFont(ofSize:11,weight:.regular);clock.textColor = .gray;clock.text = "00:00 / 00:00"
        let footer = UIStackView(arrangedSubviews:[clock,export]);footer.alignment = .center;footer.spacing = 8;stack.addArrangedSubview(footer)
        volume.minimumValue = 0;volume.maximumValue = 1;volume.value = Preferences.shared.value.volume;volume.accessibilityIdentifier = "playback-volume";volume.addTarget(self,action:#selector(changeVolume),for:.valueChanged)
        let row = UIStackView(arrangedSubviews:[volumeText,volume]);row.spacing = 12;volumeText.font = .systemFont(ofSize:11);volumeText.setContentHuggingPriority(.required,for:.horizontal);stack.addArrangedSubview(row);refreshVolume()
        settings.contentHorizontalAlignment = .left;settings.accessibilityIdentifier = "speech-settings-toggle";settings.run = {[weak self] in guard let self = self else{return};self.configuration.isHidden.toggle();self.settings.setTitle(self.configuration.isHidden ? "音色与模型  ▾" : "收起语音设置  ▴",for:.normal)};stack.addArrangedSubview(settings)
        configuration.axis = .vertical;configuration.spacing = 8;for button in [account,voice,model] {button.contentHorizontalAlignment = .left;button.titleLabel?.font = .systemFont(ofSize:13);configuration.addArrangedSubview(button)};configuration.isHidden = true;stack.addArrangedSubview(configuration)
        model.accessibilityIdentifier = "choose-speech-model";voice.accessibilityIdentifier = "choose-speech-voice";account.accessibilityIdentifier = "choose-speech-account"
        status.numberOfLines = 0;status.font = .systemFont(ofSize:12);status.textColor = .gray;stack.addArrangedSubview(status);stack.addArrangedSubview(stop);stop.isHidden = true
    }
    required init?(coder:NSCoder){fatalError()}
    func refreshVolume(){volume.value = Preferences.shared.value.volume;volumeText.text = "音量 \(Int(volume.value*100))%"}
    @objc func changeVolume(){volumeChanged?(volume.value);refreshVolume()}
    @objc func scrub(){seekChanged?(seek.value)}
    func working(_ value:Bool){generate.isEnabled = !value;generate.alpha = value ? 0.45 : 1;[account,voice,model].forEach {$0.isEnabled = !value};stop.isHidden = !value}
    func audioAvailable(_ ready:Bool){play.isEnabled = ready;export.isEnabled = ready;seek.isEnabled = ready;play.alpha = ready ? 1 : 0.3;export.isHidden = !ready;playback.isHidden = !ready;clock.isHidden = !ready}
    func playing(_ active:Bool){play.setTitle(active ? "Ⅱ" : "▶",for:.normal);play.accessibilityLabel = active ? "暂停本地语音" : "播放本地语音"}
    func time(_ elapsed:Double,_ duration:Double){func stamp(_ n:Double)->String {guard n.isFinite else {return "00:00"};let t = max(0,Int(n));return String(format:"%02d:%02d",t/60,t%60)};clock.text = stamp(elapsed) + " / " + stamp(duration);if !seek.isTracking {seek.value = duration>0 ? Float(elapsed/duration) : 0};if !waveform.isTracking {waveform.progress = duration>0 ? elapsed/duration : 0}}
}

final class ReadingColumns:UIStackView {
    var breakpoint:CGFloat = 500
    func arrange(width:CGFloat){let next:NSLayoutConstraint.Axis = width/CGFloat(Preferences.shared.value.fontScale)>=breakpoint ? .horizontal : .vertical;if axis != next {axis = next};let desired:UIStackView.Distribution = next == .horizontal ? .fillEqually : .fill;if distribution != desired {distribution = desired};alignment = next == .horizontal ? .top : .fill}
    override func layoutSubviews(){super.layoutSubviews();arrange(width:bounds.width)}
}
extension FormVC {
    func readingField(_ key:String,_ caption:String,_ value:String,_ size:CGFloat = 16,_ weight:UIFont.Weight = .regular)->UIStackView {
        let section = UIStackView();section.axis = .vertical;section.spacing = 8
        let label = UILabel();label.text = caption;label.font = .systemFont(ofSize:12);label.textColor = .gray;section.addArrangedSubview(label)
        let text = UITextView();text.text = value;text.font = .systemFont(ofSize:size,weight:weight);text.textColor = key == "original" ? .gray : brand;text.isScrollEnabled = false;text.backgroundColor = .clear;text.textContainerInset = .zero;text.textContainer.lineFragmentPadding = 0;text.accessibilityIdentifier = key;text.heightAnchor.constraint(greaterThanOrEqualToConstant:24).isActive = true;inputs[key] = text;section.addArrangedSubview(text);return section
    }
    func expressionReview(_ entry:Entry,panel:SpeechPanel){
        label("YOUR WORDS, A LITTLE BETTER")
        section("表达回顾",detail:"回到说过的话，找到更自然的表达。")
        let meta = UILabel();meta.text = (entry["category"].isEmpty ? "日常表达" : entry["category"]) + "    ·    " + (UserDefaults.standard.string(forKey:"targetLanguage") ?? "en-US");meta.font = .systemFont(ofSize:11);meta.textColor = .gray;stack.addArrangedSubview(meta)
        let columns = ReadingColumns();columns.axis = .vertical;columns.spacing = 28;columns.distribution = .fill;columns.alignment = .fill
        let words = UIStackView();words.axis = .vertical;words.spacing = 20
        words.addArrangedSubview(readingField("original","当时的表达",entry["original"],17))
        words.addArrangedSubview(readingField("improved","可以这样说",entry["improved"],22,.semibold))
        words.addArrangedSubview(readingField("translation","母语译文",entry["translation"]))
        let notes = UIStackView();notes.axis = .vertical;notes.spacing = 20
        notes.addArrangedSubview(readingField("explanation","修改原因",entry["explanation"],15))
        notes.addArrangedSubview(readingField("pattern","可复用句型",entry["pattern"],15))
        notes.addArrangedSubview(panel)
        columns.addArrangedSubview(words);columns.addArrangedSubview(notes);stack.addArrangedSubview(columns)
    }
}
