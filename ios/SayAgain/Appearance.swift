import UIKit
import ObjectiveC

private var baseFontKey:UInt8 = 0
private var baseHeightKey:UInt8 = 0
enum Appearance {
    static func apply(_ view:UIView){
        if view is UINavigationBar || view.accessibilityIdentifier == "brand-wordmark" {return}
        let scale = CGFloat(Preferences.shared.value.fontScale)
        func scaled(_ font:UIFont)->UIFont {let original = (objc_getAssociatedObject(view,&baseFontKey) as? UIFont) ?? font;objc_setAssociatedObject(view,&baseFontKey,original,.OBJC_ASSOCIATION_RETAIN_NONATOMIC);return original.withSize(original.pointSize*scale)}
        if let label = view as? UILabel {label.font = scaled(label.font);label.adjustsFontSizeToFitWidth = false}
        if let text = view as? UITextView,let font = text.font {text.font = scaled(font)}
        if let text = view as? UITextField,let font = text.font {text.font = scaled(font)}
        if view is UITextView || view is UITextField {for constraint in view.constraints where constraint.firstAttribute == .height && constraint.secondItem == nil {let base = (objc_getAssociatedObject(constraint,&baseHeightKey) as? NSNumber)?.doubleValue ?? Double(constraint.constant);objc_setAssociatedObject(constraint,&baseHeightKey,NSNumber(value:base),.OBJC_ASSOCIATION_RETAIN_NONATOMIC);constraint.constant = CGFloat(base)*max(1,scale)}}
        view.subviews.forEach {apply($0)}
        view.setNeedsLayout()
    }
}
final class PreferencesVC:FormVC {
    let volume = UISlider();let size = UISlider();let sample = UILabel();let volumeValue = UILabel();let sizeValue = UILabel()
    override func viewDidLoad(){super.viewDidLoad();title = "阅读与播放"
        section("阅读字号",detail:"全局即时生效，重启后保留")
        sample.text = "Qwen generates speech that sounds like a real person.\n让每一句表达，都清晰自然。";sample.numberOfLines = 0;sample.font = .systemFont(ofSize:20,weight:.medium);stack.addArrangedSubview(sample)
        size.minimumValue = 0.85;size.maximumValue = 1.5;size.value = Float(Preferences.shared.value.fontScale);size.accessibilityIdentifier = "global-font-size";size.addTarget(self,action:#selector(updateSize),for:.valueChanged);stack.addArrangedSubview(size);stack.addArrangedSubview(sizeValue)
        section("播放音量",detail:"控制应用内语音与录音的播放音量；设备音量仍可用侧边按键调整")
        volume.minimumValue = 0;volume.maximumValue = 1;volume.value = Preferences.shared.value.volume;volume.accessibilityIdentifier = "global-volume";volume.addTarget(self,action:#selector(updateVolume),for:.valueChanged);stack.addArrangedSubview(volume);stack.addArrangedSubview(volumeValue)
        button("恢复默认字号与音量",#selector(reset));refreshLabels()
    }
    func refreshLabels(){volumeValue.text = "音量 \(Int(Preferences.shared.value.volume*100))%";sizeValue.text = "字号 \(Int(Preferences.shared.value.fontScale*100))%"}
    @objc func updateSize(){Preferences.shared.update {$0.fontScale = Double((size.value*20).rounded()/20)};size.value = Float(Preferences.shared.value.fontScale);refreshLabels()}
    @objc func updateVolume(){Preferences.shared.update {$0.volume = volume.value};refreshLabels()}
    @objc func reset(){Preferences.shared.update {$0.fontScale = 1;$0.volume = 1};size.value = 1;volume.value = 1;refreshLabels()}
}
final class SpeechModelPickerVC:UITableViewController {
    var chosen:((SpeechModel)->Void)?
    let groups = ["Qwen3-TTS","Qwen-Audio","CosyVoice","MiniMax"]
    override func viewDidLoad(){super.viewDidLoad();title = "选择语音模型";tableView.rowHeight = UITableView.automaticDimension;tableView.estimatedRowHeight = 80;tableView.backgroundColor = UIColor(white:0.97,alpha:1);tableView.tableFooterView = UIView()}
    override func numberOfSections(in tableView:UITableView)->Int {groups.count}
    override func tableView(_ tableView:UITableView,numberOfRowsInSection section:Int)->Int {SpeechModel.all.filter {$0.group == groups[section]}.count}
    override func tableView(_ tableView:UITableView,titleForHeaderInSection section:Int)->String? {groups[section]}
    override func tableView(_ tableView:UITableView,cellForRowAt indexPath:IndexPath)->UITableViewCell {let model = SpeechModel.all.filter {$0.group == groups[indexPath.section]}[indexPath.row];let cell = UITableViewCell(style:.subtitle,reuseIdentifier:nil);cell.textLabel?.text = model.title;cell.textLabel?.font = .systemFont(ofSize:17,weight:.medium);cell.textLabel?.numberOfLines = 0;cell.detailTextLabel?.text = model.id + (model.family == .minimax ? "\n新音色首次合成有解锁费用，以平台账单为准" : "");cell.detailTextLabel?.font = .systemFont(ofSize:12);cell.detailTextLabel?.textColor = .gray;cell.detailTextLabel?.numberOfLines = 0;cell.accessoryType = model.id == Preferences.shared.model.id ? .checkmark : .none;cell.accessibilityIdentifier = "speech-model-" + model.id;cell.accessibilityValue = model.id == Preferences.shared.model.id ? "当前默认模型" : "未选择"
        if model.family == .realtime {if #available(iOS 13.0,*) {}else {cell.detailTextLabel?.text = model.id + "\niOS 12 暂不支持实时连接，请选择其他模型";cell.textLabel?.textColor = .gray}}
        Appearance.apply(cell);return cell}
    override func tableView(_ tableView:UITableView,didSelectRowAt indexPath:IndexPath){let model = SpeechModel.all.filter {$0.group == groups[indexPath.section]}[indexPath.row];if model.family == .realtime {if #available(iOS 13.0,*) {}else {inform("此 iPad 使用 iOS 12，实时模型需要 iOS 13 或更新版本。其他 12 款可选择使用。");return}};Preferences.shared.update {$0.speechModelID = model.id};chosen?(model);tableView.reloadData();navigationController?.popViewController(animated:true)}
}
