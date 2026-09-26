import UIKit
import AVFoundation
import MobileCoreServices

let brand = UIColor(white:0.14, alpha:1)
let paper = UIColor.white
func tabIcon(_ index: Int) -> UIImage? {
    UIGraphicsBeginImageContextWithOptions(CGSize(width:26,height:26),false,0); defer { UIGraphicsEndImageContext() }
    UIColor.black.setStroke()
    let p = UIBezierPath(); p.lineWidth = 1.8; p.lineCapStyle = .round; p.lineJoinStyle = .round
    switch index {
    case 0: p.append(UIBezierPath(roundedRect:CGRect(x:3,y:4,width:20,height:18),cornerRadius:2));p.move(to:CGPoint(x:13,y:4));p.addLine(to:CGPoint(x:13,y:22))
    case 1: p.append(UIBezierPath(roundedRect:CGRect(x:9,y:2,width:8,height:14),cornerRadius:4));p.move(to:CGPoint(x:5,y:11));p.addCurve(to:CGPoint(x:21,y:11),controlPoint1:CGPoint(x:5,y:24),controlPoint2:CGPoint(x:21,y:24));p.move(to:CGPoint(x:13,y:20));p.addLine(to:CGPoint(x:13,y:25))
    case 2: p.append(UIBezierPath(ovalIn:CGRect(x:9,y:2,width:8,height:8)));p.move(to:CGPoint(x:3,y:24));p.addCurve(to:CGPoint(x:23,y:24),controlPoint1:CGPoint(x:3,y:8),controlPoint2:CGPoint(x:23,y:8))
    case 3: for (x,h) in [(4,7),(10,18),(16,24),(22,12)] {p.move(to:CGPoint(x:x,y:(26-h)/2));p.addLine(to:CGPoint(x:x,y:(26+h)/2))}
    default: p.append(UIBezierPath(ovalIn:CGRect(x:4,y:4,width:18,height:18)));p.append(UIBezierPath(ovalIn:CGRect(x:10,y:10,width:6,height:6)));for i in 0..<8 {let a=CGFloat(i)*CGFloat.pi/4;p.move(to:CGPoint(x:13+9*cos(a),y:13+9*sin(a)));p.addLine(to:CGPoint(x:13+12*cos(a),y:13+12*sin(a)))}
    }
    p.stroke();return UIGraphicsGetImageFromCurrentImageContext()?.withRenderingMode(.alwaysTemplate)
}
// Desktop visual language, with native navigation and audio on iOS 12.
final class WorkspaceVC: UIViewController {
    let tabs: UITabBarController
    let sidebar = UIView(); let menu = UIStackView(); var buttons: [UIButton] = []
    let names = ["表达回顾", "我的音频", "人物形象", "我的音色", "设置"]
    init(tabs: UITabBarController) {self.tabs = tabs; super.init(nibName:nil,bundle:nil)}
    required init?(coder:NSCoder) {fatalError()}
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .white
        addChild(tabs); view.addSubview(tabs.view); tabs.didMove(toParent:self)
        sidebar.backgroundColor = UIColor(white:0.973,alpha:1); view.addSubview(sidebar)
        menu.axis = .vertical; menu.spacing = 8; sidebar.addSubview(menu)
        let logo = UIImageView(image:UIImage(named:"BrandIcon"));logo.contentMode = .scaleAspectFit
        logo.widthAnchor.constraint(equalToConstant:40).isActive = true;logo.heightAnchor.constraint(equalToConstant:40).isActive = true
        let name = UILabel();name.accessibilityIdentifier = "brand-wordmark";name.text = "SayAgain";name.font = .systemFont(ofSize:21,weight:.semibold)
        let row = UIStackView(arrangedSubviews:[logo,name]);row.spacing = 10;row.alignment = .center;row.heightAnchor.constraint(equalToConstant:40).isActive = true
        menu.addArrangedSubview(row);menu.setCustomSpacing(28,after:row)
        let add = UIButton(type:.system);add.setTitle("＋  记录一句话",for:.normal);add.backgroundColor = .white;add.layer.cornerRadius = 8;add.layer.borderWidth = 1;add.layer.borderColor = UIColor(white:0.87,alpha:1).cgColor;add.heightAnchor.constraint(equalToConstant:46).isActive = true;add.addTarget(self,action:#selector(newEntry),for:.touchUpInside);menu.addArrangedSubview(add);menu.setCustomSpacing(20,after:add)
        for (i,title) in names.enumerated() {
            let button = UIButton(type:.system);button.tag = i;button.setTitle(title,for:.normal);button.setImage(tabIcon(i),for:.normal);button.contentHorizontalAlignment = .left;button.contentEdgeInsets = UIEdgeInsets(top:10,left:12,bottom:10,right:8);button.titleEdgeInsets = UIEdgeInsets(top:0,left:10,bottom:0,right:0);button.titleLabel?.font = .systemFont(ofSize:14);button.layer.cornerRadius = 8;button.heightAnchor.constraint(equalToConstant:48).isActive = true;button.accessibilityIdentifier = "workspace-" + String(i);button.addTarget(self,action:#selector(selectPage(_:)),for:.touchUpInside);buttons.append(button);menu.addArrangedSubview(button)
        }
        let note = UILabel();note.numberOfLines = 0;note.text = "SAY IT YOUR WAY\n\n从你说过的话，\n到更自然的表达。\n\n本地工作空间";note.font = .systemFont(ofSize:13);note.textColor = .gray;menu.addArrangedSubview(note);menu.setCustomSpacing(32,after:buttons.last!)
        refresh()
    }
    @objc func newEntry() {tabs.selectedIndex = 0;refresh();if let nav = tabs.viewControllers?.first as? UINavigationController {nav.popToRootViewController(animated:false);(nav.viewControllers.first as? EntriesVC)?.add()}}
    @objc func selectPage(_ sender:UIButton) {tabs.selectedIndex = sender.tag;refresh()}
    func refresh() {for b in buttons {b.backgroundColor = b.tag == tabs.selectedIndex ? UIColor(white:0.918,alpha:1) : .clear;b.tintColor = b.tag == tabs.selectedIndex ? brand : .darkGray}}
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews();let wide = view.bounds.width >= 700;let width:CGFloat = wide ? (view.bounds.width >= 1000 ? 236 : 200) : 0
        sidebar.isHidden = !wide;sidebar.frame = CGRect(x:0,y:0,width:width,height:view.bounds.height)
        let menuWidth = max(0,width-32)
        let menuHeight = menu.systemLayoutSizeFitting(CGSize(width:menuWidth,height:0),withHorizontalFittingPriority:.required,verticalFittingPriority:.fittingSizeLevel).height
        menu.frame = CGRect(x:16,y:view.safeAreaInsets.top+28,width:menuWidth,height:menuHeight)
        tabs.view.frame = CGRect(x:width,y:0,width:view.bounds.width-width,height:view.bounds.height);tabs.tabBar.isHidden = wide
        // UITabBarController continues to manage compact-screen navigation.
        tabs.additionalSafeAreaInsets.bottom = wide ? -tabs.tabBar.bounds.height : 0
    }
}

let store = LibraryStore(root:FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0])
let speaker = AVSpeechSynthesizer()
extension UIViewController {
    func inform(_ text: String, title: String = "SayAgain") {
        let a = UIAlertController(title:title,message:text,preferredStyle:.alert); a.addAction(UIAlertAction(title:"好",style:.default)); present(a,animated:true)
    }
    func confirm(_ text: String, run: @escaping ()->Void) {
        let a = UIAlertController(title:"确认发送",message:text,preferredStyle:.alert)
        a.addAction(UIAlertAction(title:"取消",style:.cancel)); a.addAction(UIAlertAction(title:"继续",style:.default){_ in run()}); present(a,animated:true)
    }
    func share(_ value: Any) {
        let vc = UIActivityViewController(activityItems:[value],applicationActivities:nil)
        vc.popoverPresentationController?.sourceView = view; vc.popoverPresentationController?.sourceRect = CGRect(x:view.bounds.midX,y:view.bounds.midY,width:1,height:1)
        present(vc,animated:true)
    }
}
@UIApplicationMain class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication,didFinishLaunchingWithOptions options:[UIApplication.LaunchOptionsKey:Any]?)->Bool {
        
        let bootstrap = store.root.appendingPathComponent("connection-bootstrap.json")
        if let data = try? Data(contentsOf: bootstrap), let object = try? JSONSerialization.jsonObject(with: data), let config = object as? [String: String], let base = config["base"], let token = config["token"] {
            do { try API.shared.configure(base: base, token: token); try FileManager.default.removeItem(at: bootstrap) }
            catch { NSLog("SayAgain: connection bootstrap failed; use Settings to configure") }
        }
        window = UIWindow(frame:UIScreen.main.bounds); window?.tintColor = brand
        let tabs = UITabBarController()
        tabs.viewControllers = [("表达","expression"),("我的音频","recording"),("人物","person"),("音色","voice")].enumerated().map {index,pair in
            let vc = EntriesVC(kind:pair.1,title:pair.0); let nav = UINavigationController(rootViewController:vc)
            nav.tabBarItem = UITabBarItem(title:pair.0,image:tabIcon(index),tag:index); return nav
        }
        let settings = UINavigationController(rootViewController:SettingsVC())
        settings.tabBarItem = UITabBarItem(title:"设置",image:tabIcon(4),tag:4)
        tabs.viewControllers?.append(settings)
        UINavigationBar.appearance().tintColor = brand
        UINavigationBar.appearance().barTintColor = .white
        UINavigationBar.appearance().isTranslucent = false
        window?.rootViewController = WorkspaceVC(tabs:tabs); window?.makeKeyAndVisible()
        NotificationCenter.default.addObserver(self,selector:#selector(preferencesChanged),name:Preferences.changed,object:nil)
        Appearance.apply(window!)
        if let error = store.loadError {DispatchQueue.main.async {tabs.inform(error.localizedDescription)}}
        return true
    }
    @objc func preferencesChanged(){if let window = window {Appearance.apply(window)}}
}
final class ExpressionCell: UITableViewCell {
    let columns = ReadingColumns();let wave = AudioWaveform();let play = PanelButton("▶",primary:true);let clock = UILabel();var player:AVAudioPlayer?;var timer:Timer?;var willPlay:(()->Void)?;var open:(()->Void)?
    init(entry:Entry) {
        super.init(style:.default,reuseIdentifier:nil);selectionStyle = .none;backgroundColor = .white
        columns.axis = .vertical;columns.breakpoint = 500;columns.spacing = 24;columns.distribution = .fill;columns.alignment = .fill;columns.translatesAutoresizingMaskIntoConstraints = false
        func text(_ value:String,_ size:CGFloat,_ weight:UIFont.Weight = .regular,_ color:UIColor = .gray)->UILabel {let l = UILabel();l.text = value;l.font = .systemFont(ofSize:size,weight:weight);l.textColor = color;l.numberOfLines = 0;return l}
        let words = UIStackView();words.axis = .vertical;words.spacing = 14
        words.addArrangedSubview(text(entry["category"].isEmpty ? "日常表达" : entry["category"],11))
        words.addArrangedSubview(text("当时的表达",12));words.addArrangedSubview(text(entry["original"],17))
        words.addArrangedSubview(text("可以这样说",12));words.addArrangedSubview(text(entry["improved"].isEmpty ? entry["original"] : entry["improved"],21,.semibold,brand))
        if !entry["translation"].isEmpty {words.addArrangedSubview(text(entry["translation"],15))}
        let edit = PanelButton("查看与编辑  ›");edit.layer.borderWidth = 0;edit.contentHorizontalAlignment = .left;edit.contentEdgeInsets = .zero;edit.run = {[weak self] in self?.open?()};words.addArrangedSubview(edit)
        let notes = UIStackView();notes.axis = .vertical;notes.spacing = 12
        if !entry["explanation"].isEmpty {notes.addArrangedSubview(text("修改原因",13,.semibold,brand));notes.addArrangedSubview(text(entry["explanation"],15,.regular,.darkGray))}
        if !entry["pattern"].isEmpty {notes.addArrangedSubview(text("可复用句型",12));notes.addArrangedSubview(text(entry["pattern"],15,.regular,.darkGray))}
        let line = UIView();line.backgroundColor = UIColor(white:0.9,alpha:1);line.heightAnchor.constraint(equalToConstant:1).isActive = true;notes.addArrangedSubview(line)
        notes.addArrangedSubview(text("用我的声音听与练",12))
        if let name = entry.audio,let url = try? store.audioURL(name) {
            wave.load(url);play.accessibilityIdentifier = "review-play-" + entry.id;play.accessibilityLabel = "播放本地语音";play.widthAnchor.constraint(equalToConstant:44).isActive = true;play.contentEdgeInsets = .zero;play.layer.cornerRadius = 22
            let row = UIStackView(arrangedSubviews:[play,wave]);row.alignment = .center;row.spacing = 12;notes.addArrangedSubview(row)
            clock.font = .monospacedDigitSystemFont(ofSize:11,weight:.regular);clock.textColor = .gray;clock.text = "已保存本地语音";notes.addArrangedSubview(clock)
            play.run = {[weak self] in guard let self = self else{return};do {if self.player?.isPlaying == true {self.player?.pause();self.update();return};self.willPlay?();try AVAudioSession.sharedInstance().setCategory(.playback,mode:.default);try AVAudioSession.sharedInstance().setActive(true);if self.player == nil {self.player = try AVAudioPlayer(contentsOf:url)};self.player?.volume = Preferences.shared.value.volume;guard self.player?.play() == true else {throw failure("无法播放")};self.update();self.timer?.invalidate();self.timer = Timer.scheduledTimer(withTimeInterval:0.05,repeats:true){[weak self] _ in self?.update()}}catch{self.clock.text = "音频无法播放，请打开详情检查"}}
            wave.seek = {[weak self] value in guard let self = self else{return};if self.player == nil {self.player = try? AVAudioPlayer(contentsOf:url)};if let player = self.player {player.currentTime = Double(value)*player.duration;self.update()}}
        }else {let generate = PanelButton("生成语音  ›");generate.run = {[weak self] in self?.open?()};notes.addArrangedSubview(generate)}
        columns.addArrangedSubview(words);columns.addArrangedSubview(notes);contentView.addSubview(columns)
        NSLayoutConstraint.activate([columns.leadingAnchor.constraint(equalTo:contentView.leadingAnchor,constant:28),columns.trailingAnchor.constraint(equalTo:contentView.trailingAnchor,constant:-28),columns.topAnchor.constraint(equalTo:contentView.topAnchor,constant:28),columns.bottomAnchor.constraint(equalTo:contentView.bottomAnchor,constant:-28)])
    }
    func update(){guard let player = player else{return};player.volume = Preferences.shared.value.volume;wave.progress = player.duration>0 ? player.currentTime/player.duration : 0;play.setTitle(player.isPlaying ? "Ⅱ" : "▶",for:.normal);play.accessibilityLabel = player.isPlaying ? "暂停本地语音" : "播放本地语音";clock.text = String(format:"%02d:%02d / %02d:%02d",Int(player.currentTime)/60,Int(player.currentTime)%60,Int(player.duration)/60,Int(player.duration)%60);if !player.isPlaying {timer?.invalidate()}}
    func stop(){player?.pause();timer?.invalidate();update()}
    deinit {timer?.invalidate();player?.stop()}
    required init?(coder:NSCoder) {fatalError()}
}
final class EntriesVC: UITableViewController, UISearchResultsUpdating, UIDocumentPickerDelegate {
    let kind: String; var rows: [Entry] = []; var showArchived = false
    let search = UISearchController(searchResultsController:nil)
    init(kind: String,title: String) {self.kind = kind; super.init(style:.plain); self.title = title}
    required init?(coder:NSCoder){fatalError()}
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = paper; tableView.rowHeight = UITableView.automaticDimension; tableView.estimatedRowHeight = 95
        search.searchResultsUpdater = self; search.obscuresBackgroundDuringPresentation = false; search.searchBar.placeholder = "搜索"; navigationItem.searchController = search; definesPresentationContext = true
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem:.add,target:self,action:#selector(add))
        navigationItem.rightBarButtonItem?.accessibilityIdentifier = "add-entry"
        navigationItem.leftBarButtonItem = UIBarButtonItem(title:"归档",style:.plain,target:self,action:#selector(toggleArchive))
        tableView.separatorColor = UIColor(white:0.91,alpha:1)
        tableView.cellLayoutMarginsFollowReadableWidth = true;tableView.tableFooterView = UIView()
        let header = UIView(frame:CGRect(x:0,y:0,width:600,height:145))
        let heading = UILabel(frame:CGRect(x:28,y:26,width:544,height:38));heading.autoresizingMask = [.flexibleWidth];heading.font = .systemFont(ofSize:28,weight:.semibold)
        heading.text = kind == "expression" ? "表达回顾" : kind == "recording" ? "我的音频" : kind == "voice" ? "我的音色" : "人物形象"
        let intro = UILabel(frame:CGRect(x:28,y:72,width:544,height:52));intro.autoresizingMask = [.flexibleWidth];intro.numberOfLines = 0;intro.font = .systemFont(ofSize:14);intro.textColor = .gray
        intro.text = kind == "expression" ? "从你说过的话，到更自然的表达。" : kind == "recording" ? "收集录音，回顾对话，留住值得练习的表达。" : kind == "voice" ? "你的表达，你的声音。" : "记录与你交流的人物。"
        header.addSubview(heading);header.addSubview(intro);tableView.tableHeaderView = header

    }
    override func viewWillAppear(_ animated:Bool) {super.viewWillAppear(animated); reload()}
    override func viewWillTransition(to size:CGSize,with coordinator:UIViewControllerTransitionCoordinator){super.viewWillTransition(to:size,with:coordinator);coordinator.animate(alongsideTransition:nil){[weak self] _ in self?.tableView.reloadData()}}
    override func viewWillDisappear(_ animated:Bool){super.viewWillDisappear(animated);tableView.visibleCells.compactMap {$0 as? ExpressionCell}.forEach {$0.stop()}}
    override func tableView(_ tableView:UITableView,didEndDisplaying cell:UITableViewCell,forRowAt indexPath:IndexPath){(cell as? ExpressionCell)?.stop()}
    func reload() {
        tableView.visibleCells.compactMap {$0 as? ExpressionCell}.forEach {$0.stop()}
        let query = search.searchBar.text ?? ""
        rows = store.library.entries.filter {$0.kind == kind && $0.archived == showArchived && (query.isEmpty || $0.fields.values.joined(separator:" ").localizedCaseInsensitiveContains(query))}
        tableView.reloadData()
        let label = UILabel(); label.text = "还没有记录，点击 ＋ 开始"; label.textAlignment = .center; label.textColor = .gray
        tableView.backgroundView = rows.isEmpty ? label : nil
    }
    func updateSearchResults(for searchController:UISearchController) {reload()}
    @objc func toggleArchive() {showArchived.toggle(); navigationItem.leftBarButtonItem?.title = showArchived ? "返回列表" : "归档"; reload()}
    @objc func add() {
        if kind == "voice" {
            let sheet = UIAlertController(title:"添加我的音色",message:nil,preferredStyle:.actionSheet)
            sheet.addAction(UIAlertAction(title:"独立录制 · 中文朗读约30秒",style:.default){_ in self.navigationController?.pushViewController(VoiceRecorderVC(),animated:true)})
            sheet.addAction(UIAlertAction(title:"从已有录音建立音色",style:.default){_ in self.navigationController?.pushViewController(EditorVC(entry:Entry(kind:"voice",fields:[:])),animated:true)})
            sheet.addAction(UIAlertAction(title:"取消",style:.cancel));sheet.popoverPresentationController?.barButtonItem = navigationItem.rightBarButtonItem;present(sheet,animated:true)
        } else if kind == "recording" {
            let a = UIAlertController(title:"添加音频",message:nil,preferredStyle:.actionSheet)
            a.addAction(UIAlertAction(title:"录音",style:.default){_ in self.navigationController?.pushViewController(RecorderVC(),animated:true)})
            a.addAction(UIAlertAction(title:"导入音频文件",style:.default){_ in let p = UIDocumentPickerViewController(documentTypes:[kUTTypeAudio as String],in:.import); p.delegate = self; self.present(p,animated:true)})
            a.addAction(UIAlertAction(title:"取消",style:.cancel)); a.popoverPresentationController?.barButtonItem = navigationItem.rightBarButtonItem; present(a,animated:true)
        } else {navigationController?.pushViewController(EditorVC(entry:Entry(kind:kind,fields:[:])),animated:true)}
    }
    func documentPicker(_ controller:UIDocumentPickerViewController,didPickDocumentsAt urls:[URL]) {
        guard let url = urls.first else {return}
        do {
            let size = try url.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 0
            guard size > 0, size <= 25 * 1024 * 1024 else {throw failure("请选择 25MB 以内的音频")}
            let duration = AVURLAsset(url:url).duration.seconds
            guard duration.isFinite, duration > 0, duration <= 600 else {throw failure("此版本支持最长 10 分钟的音频，长录音请在桌面端处理")}
            let ext = url.pathExtension.lowercased(); guard ["wav","m4a","mp3","aac","caf"].contains(ext) else {throw failure("支持 WAV、M4A、MP3、AAC、CAF")}
            let name = UUID().uuidString + "." + ext; let target = try store.audioURL(name)
            try FileManager.default.copyItem(at:url,to:target)
            var e = Entry(kind:"recording",fields:["title":url.deletingPathExtension().lastPathComponent,"duration":String(Int(duration))]); e.audio = name
            do {try store.save(e)} catch {try? FileManager.default.removeItem(at:target); throw error}; reload()
        } catch {inform(error.localizedDescription)}
    }
    override func tableView(_ tableView:UITableView,numberOfRowsInSection section:Int)->Int {rows.count}
    override func tableView(_ tableView:UITableView,cellForRowAt indexPath:IndexPath)->UITableViewCell {
        let e = rows[indexPath.row]; if kind == "expression" {let cell = ExpressionCell(entry:e);cell.columns.arrange(width:tableView.bounds.width-56);cell.open = {[weak self] in self?.navigationController?.pushViewController(EditorVC(entry:e),animated:true)};cell.willPlay = {[weak self,weak cell] in self?.tableView.visibleCells.compactMap {$0 as? ExpressionCell}.filter {$0 !== cell}.forEach {$0.stop()}};Appearance.apply(cell);return cell}; let c = UITableViewCell(style:.subtitle,reuseIdentifier:nil); c.backgroundColor = paper
        c.textLabel?.text = (e.favorite ? "★  " : "") + (kind == "expression" ? e["improved"].isEmpty ? e["original"] : e["improved"] : e["title"])
        c.textLabel?.font = .systemFont(ofSize:20,weight:.medium); c.textLabel?.numberOfLines = 2
        c.detailTextLabel?.text = kind == "expression" ? e["original"] + "\n" + e["explanation"] : e["text"].isEmpty ? e["note"] : e["text"]
        c.detailTextLabel?.numberOfLines = 3; c.detailTextLabel?.font = .systemFont(ofSize:14); c.detailTextLabel?.textColor = .darkGray; c.accessoryType = .disclosureIndicator;Appearance.apply(c); return c
    }
    override func tableView(_ tableView:UITableView,didSelectRowAt indexPath:IndexPath) {navigationController?.pushViewController(EditorVC(entry:rows[indexPath.row]),animated:true)}
}
class FormVC: UIViewController {
    let stack = UIStackView(); let scroll = UIScrollView(); var inputs: [String:UITextView] = [:]
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = paper; scroll.translatesAutoresizingMaskIntoConstraints = false; stack.translatesAutoresizingMaskIntoConstraints = false; stack.axis = .vertical; stack.spacing = 15
        view.addSubview(scroll); scroll.addSubview(stack)
        NSLayoutConstraint.activate([scroll.leadingAnchor.constraint(equalTo:view.safeAreaLayoutGuide.leadingAnchor),scroll.trailingAnchor.constraint(equalTo:view.safeAreaLayoutGuide.trailingAnchor),scroll.topAnchor.constraint(equalTo:view.safeAreaLayoutGuide.topAnchor),scroll.bottomAnchor.constraint(equalTo:view.safeAreaLayoutGuide.bottomAnchor),stack.topAnchor.constraint(equalTo:scroll.topAnchor,constant:24),stack.bottomAnchor.constraint(equalTo:scroll.bottomAnchor,constant:-40),stack.leadingAnchor.constraint(equalTo:scroll.leadingAnchor,constant:24),stack.trailingAnchor.constraint(equalTo:scroll.trailingAnchor,constant:-24),stack.widthAnchor.constraint(equalTo:scroll.widthAnchor,constant:-48)])
        scroll.keyboardDismissMode = .interactive
        NotificationCenter.default.addObserver(self,selector:#selector(keyboard),name:UIResponder.keyboardWillChangeFrameNotification,object:nil)
    }
    override func viewWillAppear(_ animated:Bool){super.viewWillAppear(animated);Appearance.apply(view)}
    func section(_ title:String,detail:String = ""){let header = UILabel();header.text = title;header.font = .systemFont(ofSize:21,weight:.semibold);header.numberOfLines = 0;stack.addArrangedSubview(header);if !detail.isEmpty {label(detail)}}
    @objc func keyboard(_ n:Notification) {if let r = n.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect {let frame = view.convert(r,from:nil); scroll.contentInset.bottom = max(0,view.bounds.maxY-frame.minY); scroll.scrollIndicatorInsets = scroll.contentInset}}
    func label(_ text:String) {let v = UILabel(); v.text = text; v.numberOfLines = 0; v.font = .systemFont(ofSize:13,weight:.medium); v.textColor = .darkGray; stack.addArrangedSubview(v)}
    func field(_ key:String,_ name:String,_ value:String = "",height:CGFloat = 85) {label(name); let t = UITextView(); t.text = value; t.font = .systemFont(ofSize:16); t.layer.cornerRadius = 8; t.backgroundColor = UIColor(white:0.975,alpha:1); t.layer.borderWidth = 1; t.layer.borderColor = UIColor(white:0.90,alpha:1).cgColor; t.textContainerInset = UIEdgeInsets(top:12,left:12,bottom:12,right:12); t.accessibilityIdentifier = key; t.heightAnchor.constraint(equalToConstant:height).isActive = true; inputs[key] = t; stack.addArrangedSubview(t)}
    func button(_ text:String,_ action:Selector) {let b = UIButton(type:.system); b.setTitle(text,for:.normal); b.titleLabel?.font = .systemFont(ofSize:15,weight:.medium); b.layer.cornerRadius = 8; b.layer.borderWidth = 1; b.layer.borderColor = UIColor(white:0.87,alpha:1).cgColor; b.backgroundColor = text.contains("优化表达") || text == "保存设置" || text == "生成语音 · 千问" ? brand : .white; b.setTitleColor(b.backgroundColor == brand ? .white : brand,for:.normal); b.contentEdgeInsets = UIEdgeInsets(top:12,left:16,bottom:12,right:16); b.titleLabel?.numberOfLines = 0; b.heightAnchor.constraint(greaterThanOrEqualToConstant:48).isActive = true; b.addTarget(self,action:action,for:.touchUpInside); stack.addArrangedSubview(b)}
    func value(_ key:String)->String {inputs[key]?.text.trimmingCharacters(in:.whitespacesAndNewlines) ?? ""}
}
final class EditorVC: FormVC {
    let localASRState = UILabel();var localASRReport:LocalASRReport?
    var qwenJob:QwenTTSJob?;var leaving = false;let speechPanel = SpeechPanel();var speechState:UILabel {speechPanel.status};var playbackTimer:Timer?;var entry: Entry; var player:AVAudioPlayer?; var task:URLSessionDataTask?; var busy = false; var initial: [String:String] = [:]
    init(entry:Entry){self.entry = entry; super.init(nibName:nil,bundle:nil)}
    required init?(coder:NSCoder){fatalError()}
    override func viewDidLoad() {
        super.viewDidLoad(); title = entry.kind == "expression" ? "表达详情" : entry.kind == "recording" ? "音频详情" : entry.kind == "voice" ? "音色详情" : "人物详情"
        navigationItem.rightBarButtonItem = UIBarButtonItem(title:"保存",style:.done,target:self,action:#selector(save))
        navigationItem.leftBarButtonItem = UIBarButtonItem(title:"返回",style:.plain,target:self,action:#selector(back))
        navigationController?.interactivePopGestureRecognizer?.isEnabled = false
        if entry.kind == "expression" {
            expressionReview(entry,panel:speechPanel);configureSpeechPanel()
            field("category","类别",entry["category"],height:44)
            button("优化表达 · API",#selector(improve)); button("系统朗读",#selector(speak));  button(entry.favorite ? "取消收藏" : "收藏",#selector(favorite))
        } else {
            field("title",entry.kind == "person" ? "姓名" : "名称",entry["title"],height:60)
            if entry.kind != "person" {field("text",entry.kind == "voice" ? "参考录音原文" : "原文 · 可人工校对",entry["text"],height:180)}
            field("note","备注",entry["note"])
            if entry.kind == "recording" {
                button("本机离线转写 · 整条录音",#selector(testLocalASR))
                button("停止本机转写",#selector(stopLocalASR));button("采用本机转写草稿",#selector(applyLocalASR))
                localASRState.numberOfLines = 0;localASRState.font = .systemFont(ofSize:14);localASRState.accessibilityIdentifier = "local-asr-result";localASRState.text = UserDefaults.standard.bool(forKey:"localASRProbeInterrupted") ? "上次本机试运行未完成，可能被系统终止。原录音与文字均已保留。" : "实验功能 · SenseVoice INT8 · 在此 iPad 上运行，不上传录音。结果单独显示，原文字保持不变。";stack.addArrangedSubview(localASRState)
                if let name = entry.audio,let url = try? store.audioURL(name),let draft = LocalASR.saved(for:url) {localASRReport = draft;localASRState.text = draft.display}
                button("转写与候选说话人 · API",#selector(transcribe));button("把原文加入表达库",#selector(toExpression))
            }
            if entry.kind == "voice" {button("从我的音频选择参考录音",#selector(selectReference)); label("请使用本人或已获授权的 10–60 秒单人清晰录音。克隆只在点击并确认后发送。")}
        }
        if entry.kind != "expression",entry.audio != nil {button("播放录音 / 停止",#selector(play))}
        button("导出此条文字",#selector(exportText)); button(entry.archived ? "恢复到列表" : "归档此条",#selector(archive))
        button("取消 API 请求",#selector(cancel)); label("修改后点击保存。数据保存在 iPad；调用 API 前会显示接收地址。")
        if entry.kind == "expression",let start = stack.arrangedSubviews.firstIndex(where:{$0 === inputs["category"]}) {
            let extras = UIStackView();extras.axis = .vertical;extras.spacing = 12
            let views = Array(stack.arrangedSubviews[max(0,start-1)...]);for child in views {stack.removeArrangedSubview(child);child.removeFromSuperview();extras.addArrangedSubview(child)}
            let toggle = PanelButton("编辑分类与更多操作  ▾");toggle.layer.borderWidth = 0;toggle.contentHorizontalAlignment = .left;toggle.run = {[weak extras,weak toggle] in guard let extras = extras else{return};extras.isHidden.toggle();toggle?.setTitle(extras.isHidden ? "编辑分类与更多操作  ▾" : "收起更多操作  ▴",for:.normal)};stack.addArrangedSubview(toggle);extras.isHidden = true;stack.addArrangedSubview(extras)
        }
        initial = inputs.mapValues {$0.text ?? ""}
        NotificationCenter.default.addObserver(self,selector:#selector(preferenceUpdate),name:Preferences.changed,object:nil)
    }
    func collected()->Entry {var e = entry; for (k,v) in inputs {e[k] = v.text}; return e}
    func persist()->Bool {
        let e = collected(); let required = e.kind == "expression" ? "original" : "title"
        guard !e[required].trimmingCharacters(in:.whitespacesAndNewlines).isEmpty else {inform("请填写" + (required == "original" ? "原句" : "名称")); return false}
        do {try store.save(e); entry = e; initial = inputs.mapValues {$0.text ?? ""}; return true} catch {inform(error.localizedDescription); return false}
    }
    @objc func save(){if persist(){inform("已保存到这台 iPad")}}
    @objc func back() {
        if inputs.mapValues({$0.text ?? ""}) != initial {let a = UIAlertController(title:"还有未保存的修改",message:nil,preferredStyle:.alert); a.addAction(UIAlertAction(title:"继续编辑",style:.cancel)); a.addAction(UIAlertAction(title:"保存并返回",style:.default){_ in if self.persist(){self.leave()}}); a.addAction(UIAlertAction(title:"放弃修改",style:.destructive){_ in self.leave()}); present(a,animated:true)} else {leave()}
    }
    func leave(){if entry.kind == "recording",busy {LocalASR.cancel()};playbackTimer?.invalidate();leaving = true;qwenJob?.cancel();task?.cancel(); player?.stop(); speaker.stopSpeaking(at:.immediate); navigationController?.interactivePopGestureRecognizer?.isEnabled = true; navigationController?.popViewController(animated:true)}
    @objc func favorite(){entry.favorite.toggle(); if persist(){inform(entry.favorite ? "已收藏" : "已取消收藏")}}
    @objc func archive(){entry.archived.toggle(); if persist(){leave()}}
    @objc func exportText(){share(collected().fields.sorted(by:{$0.key<$1.key}).map {"\($0.key)\n\($0.value)"}.joined(separator:"\n\n"))}
    @objc func speak() {if speaker.isSpeaking {speaker.stopSpeaking(at:.immediate);return}; let text = value("improved").isEmpty ? value("original") : value("improved"); let u = AVSpeechUtterance(string:text);u.volume = Preferences.shared.value.volume;u.voice = AVSpeechSynthesisVoice(language:UserDefaults.standard.string(forKey:"targetLanguage") ?? "en-US");speaker.speak(u)}
    @objc func play(){do{if let player = player,player.isPlaying {player.pause();speechPanel.playing(false);return};guard let name = entry.audio else {throw failure("请先生成语音或选择录音")};try AVAudioSession.sharedInstance().setCategory(.playback,mode:.default);try AVAudioSession.sharedInstance().setActive(true);if player == nil {player = try AVAudioPlayer(contentsOf:store.audioURL(name))};player?.volume = Preferences.shared.value.volume;guard player?.play() == true else {throw failure("音频暂时无法播放")};speechPanel.playing(true);startPlaybackTimer()}catch{inform(error.localizedDescription)}}
    func startPlaybackTimer(){playbackTimer?.invalidate();playbackTimer = Timer.scheduledTimer(withTimeInterval:0.05,repeats:true){[weak self] _ in guard let self = self,let player = self.player else {return};self.speechPanel.time(player.currentTime,player.duration);self.speechPanel.playing(player.isPlaying)}}
    func configureSpeechPanel(){
        speechPanel.generate.run = {[weak self] in self?.clone()};speechPanel.voice.run = {[weak self] in self?.chooseSpeechVoice()};speechPanel.model.run = {[weak self] in self?.chooseModel()};speechPanel.account.run = {[weak self] in self?.navigationController?.pushViewController(QwenAccountSettingsVC(),animated:true)}
        speechPanel.play.run = {[weak self] in self?.play()};speechPanel.export.run = {[weak self] in self?.exportAudio()};speechPanel.stop.run = {[weak self] in self?.cancel()}
        speechPanel.volumeChanged = {value in Preferences.shared.update {$0.volume = value}};speechPanel.seekChanged = {[weak self] value in guard let self = self else {return};if self.player == nil,let name = self.entry.audio,let url = try? store.audioURL(name){self.player = try? AVAudioPlayer(contentsOf:url)};if let player = self.player {player.currentTime = Double(value)*player.duration;self.speechPanel.time(player.currentTime,player.duration);self.speechPanel.playing(player.isPlaying)}}
        speechState.text = entry.audio == nil ? "尚未生成。账号配置保留在设置中。" : "已保存本地语音，可离线播放。";refreshSpeechPanel()
    }
    func refreshSpeechPanel(){
        speechPanel.model.setTitle("模型  ·  " + Preferences.shared.model.title + "  ›",for:.normal)
        let voice = store.library.entries.first {$0.id == entry["tts_selected_voice"]};speechPanel.voice.setTitle("音色  ·  " + (voice?["title"] ?? "选择我的音色") + "  ›",for:.normal)
        let accounts = try? QwenAccounts.shared.read();let account = accounts?.keys.first {$0.id == accounts?.active};speechPanel.account.setTitle("账号  ·  " + (account?.name ?? "选择千问账号") + "  ›",for:.normal)
        speechPanel.summary.text = (voice?["title"] ?? "选择我的音色") + " · " + Preferences.shared.model.title
        speechPanel.waveform.load(entry.audio.flatMap {try? store.audioURL($0)})
        speechPanel.refreshVolume();speechPanel.audioAvailable(entry.audio != nil);speechPanel.working(busy)
        if player == nil,let name = entry.audio,let url = try? store.audioURL(name),let audio = try? AVAudioPlayer(contentsOf:url) {speechPanel.time(0,audio.duration)}
    }
    override func viewWillDisappear(_ animated:Bool){super.viewWillDisappear(animated);player?.pause();playbackTimer?.invalidate();speechPanel.playing(false)}
    deinit {playbackTimer?.invalidate();player?.stop()}
    @objc func preferenceUpdate(){player?.volume = Preferences.shared.value.volume;refreshSpeechPanel()}
    @objc func chooseModel(){guard !busy else {return};let picker = SpeechModelPickerVC(style:.grouped);picker.chosen = {[weak self] _ in self?.refreshSpeechPanel()};navigationController?.pushViewController(picker,animated:true)}
    override func viewWillAppear(_ animated:Bool){super.viewWillAppear(animated);leaving = false;if entry.kind == "expression" {refreshSpeechPanel()}}
    @objc func cancel(){qwenJob?.cancel();task?.cancel()}
    func request(_ path:String,body:[String:Any],completion:@escaping ([String:Any])->Void) {
        guard !busy else {inform("已有任务进行中"); return}
        if path == "improve", TextModelAPI.shared.active != "companion" {
            let destination = TextModelAPI.shared.config(TextModelAPI.shared.active)["url"] ?? ""
            confirm("将此处原句发送到：\n" + destination + "\n可能产生服务费用。") {
                self.busy = true;self.task = TextModelAPI.shared.improve(body["text"] as? String ?? "") {result in self.busy = false;switch result {case .success(let data):completion(data);case .failure(let error):self.inform(error.localizedDescription)}}
            };return
        }
        guard !API.shared.base.isEmpty else {inform("先到设置填写 API 地址和令牌。本地资料可以继续使用。");return}
        confirm("将选定的" + (path == "improve" ? "文字" : "录音与相关文字") + "发送至：\n\(API.shared.base)\n服务端可能需要较长时间。") {
            self.busy = true;self.title = "处理中…"
            self.task = API.shared.call(path,body:body){result in self.busy = false;self.title = "详情";switch result {case .success(let data):completion(data);case .failure(let error):self.inform(error.localizedDescription)}}
        }
    }
    @objc func improve(){let text = value("original"); guard !text.isEmpty else {inform("先填写原句");return}; request("improve",body:["text":text,"native_language":UserDefaults.standard.string(forKey:"nativeLanguage") ?? "zh-CN"]){data in for key in ["improved","translation","explanation","category","pattern"] {self.inputs[key]?.text = data[key] as? String ?? ""};self.inform("建议已填入，请校对后保存")}}
    func audioBody(_ e:Entry)throws->[String:Any] {guard let name = e.audio else {throw failure("请先选择参考录音")};let url = try store.audioURL(name);let data = try Data(contentsOf:url);guard data.count <= 25*1024*1024 else {throw failure("音频超过 25MB")};return ["audio":data.base64EncodedString(),"format":url.pathExtension,"language":"auto"]}
    @objc func testLocalASR(){
        guard !busy,!LocalASR.running else {inform("已有任务正在运行");return}
        do {guard let audio = entry.audio else {throw failure("没有可读取的录音")};let url = try store.audioURL(audio)
            busy = true;localASRState.text = "准备在 iPad 上离线识别…"
            LocalASR.run(url:url,progress:{[weak self] text in self?.localASRState.text = text}){[weak self] result in
                guard let self = self else{return};self.busy = false
                switch result {
                case .success(let report):
                    self.localASRReport = report
                    self.localASRState.text = report.display
                case .failure(let error):
                    self.localASRReport = LocalASR.saved(for:url)
                    self.localASRState.text = "本机转写停止或失败：" + error.localizedDescription + "\n" + (self.localASRReport?.display ?? "原录音与文字均保留。")
                }
            }
        }catch{inform(error.localizedDescription)}
    }
    @objc func stopLocalASR(){guard LocalASR.running else{return};LocalASR.cancel();localASRState.text = "正在停止，当前段完成后保存草稿…"}
    @objc func applyLocalASR(){
        guard !busy,!LocalASR.running,let draft = localASRReport,!draft.text.isEmpty else {inform("请先完成本机转写或停止任务");return}
        confirm("将本机转写草稿填入编辑框，替换当前框内文字。请校对后再保存。") {self.inputs["text"]?.text = draft.text}
    }
    @objc func transcribe(){do {let body = try audioBody(entry); request("transcribe",body:body){data in
        guard let text = data["text"] as? String else {self.inform("转写响应缺少文字");return};self.inputs["text"]?.text = text
        if let segments = data["segments"], let json = try? JSONSerialization.data(withJSONObject:segments), let str = String(data:json,encoding:.utf8) {self.entry["segments"] = str}
        self.inform("机器转写已填入，请校对后保存。候选说话人不代表真实身份。")
    }}catch{inform(error.localizedDescription)}}
    @objc func toExpression(){navigationController?.pushViewController(EditorVC(entry:Entry(kind:"expression",fields:["original":value("text"),"sourceRecording":entry.id])),animated:true)}
    @objc func selectReference(){choose(kind:"recording",title:"选择参考录音"){e in do{guard let old = e.audio else {throw failure("录音文件不存在")};let source = try store.audioURL(old);let duration = AVURLAsset(url:source).duration.seconds;guard duration.isFinite,duration>=10,duration<=60 else {throw failure("参考录音需为 10–60 秒")};let name = UUID().uuidString + "." + source.pathExtension;try FileManager.default.copyItem(at:source,to:store.audioURL(name));self.entry.audio = name;self.inputs["text"]?.text = e["text"];if self.persist(){self.inform("参考录音已保存")}}catch{self.inform(error.localizedDescription)}}}
    func choose(kind:String,title:String,selection:@escaping (Entry)->Void){let rows = store.library.entries.filter {$0.kind == kind && !$0.archived && $0.audio != nil};guard !rows.isEmpty else {inform("请先在相应列表添加录音");return};let a = UIAlertController(title:title,message:nil,preferredStyle:.actionSheet);for e in rows {a.addAction(UIAlertAction(title:e["title"],style:.default){_ in selection(e)})};a.addAction(UIAlertAction(title:"取消",style:.cancel));a.popoverPresentationController?.sourceView = view;a.popoverPresentationController?.sourceRect = CGRect(x:view.bounds.midX,y:view.bounds.midY,width:1,height:1);present(a,animated:true)}
    @objc func exportAudio(){do{guard let name = entry.audio else {throw failure("请先生成语音")};share(try store.audioURL(name))}catch{inform(error.localizedDescription)}}
    @objc func chooseSpeechVoice(){guard !busy else {inform("请先等待或取消当前任务");return};choose(kind:"voice",title:"选择合成音色"){voice in self.entry["tts_selected_voice"] = voice.id;if self.persist(){self.speechState.text = "合成音色：" + voice["title"];self.refreshSpeechPanel()}}}
    @objc func clone(){
        guard !busy else {inform("已有任务进行中");return}
        do {try QwenAccounts.shared.migratePreviousKeys();let accounts = try QwenAccounts.shared.read();guard let account = accounts.keys.first(where:{$0.id == accounts.active}) else {inform("请先到设置 → 千问账号配置，添加并选择当前账号");return}
            let voices = store.library.entries.filter {$0.kind == "voice" && !$0.archived && $0.audio != nil}
            guard !voices.isEmpty else {inform("请先在我的音色中独立录制 10–60 秒参考声音");return}
            if let voice = voices.first(where:{$0.id == entry["tts_selected_voice"]}) ?? (voices.count == 1 ? voices.first : nil){generateSpeech(voice,account:account)}else{choose(kind:"voice",title:"选择合成音色"){voice in self.generateSpeech(voice,account:account)}}
        }catch{inform(error.localizedDescription)}
    }
    func generateSpeech(_ voice:Entry,account:QwenAccount){
        do{guard let reference = voice.audio else {throw failure("音色缺少参考录音")}
            let text = value("improved").trimmingCharacters(in:.whitespacesAndNewlines).isEmpty ? value("original") : value("improved")
            let input = try QwenTTS.prepare(text:text,language:UserDefaults.standard.string(forKey:"targetLanguage") ?? "en-US",reference:store.audioURL(reference),key:account.key,model:Preferences.shared.model)
            let fingerprint = QwenTTS.hash(Data((input.text + input.language + input.voiceCacheKey).utf8))
            if entry["tts_fingerprint"] == fingerprint,let audio = entry.audio,FileManager.default.fileExists(atPath:try store.audioURL(audio).path){speechState.text = "播放本地已生成语音，未再次调用千问。";play();return}
            confirm("使用千问账号：" + account.name + "\n音色：" + voice["title"] + "\n模型：" + input.model.title + (input.model.family == .minimax ? "\n新音色首次合成有解锁费用，以平台账单为准。" : "") + "\n将参考录音与以下文字发送到千问AI平台，按平台计费；成功后保存到本机。\n\n" + input.text){
                guard !self.busy,self.persist() else {return}
                self.busy = true;self.speechPanel.working(true);self.player?.stop();self.speechState.text = "准备生成…";self.inputs.values.forEach {$0.isEditable = false};self.navigationItem.rightBarButtonItem?.isEnabled = false
                self.qwenJob = QwenTTS.shared.synthesize(input,progress:{self.speechState.text = $0}){result in
                    self.busy = false;self.speechPanel.working(false);self.qwenJob = nil;self.inputs.values.forEach {$0.isEditable = true};self.navigationItem.rightBarButtonItem?.isEnabled = true
                    guard !self.leaving else {return}
                    switch result {case .failure(let error):self.speechState.text = "语音未生成：" + error.localizedDescription;self.inform(error.localizedDescription)
                    case .success(let bytes):do{var saved = self.collected();saved["tts_selected_voice"] = voice.id;saved["tts_fingerprint"] = fingerprint;saved["tts_text"] = input.text;saved["tts_model"] = input.model.id;saved["tts_account_id"] = account.id
                        self.entry = try store.saveGeneratedAudio(bytes,for:saved);self.player = nil;self.refreshSpeechPanel();self.initial = self.inputs.mapValues {$0.text ?? ""};self.speechState.text = "语音已保存到本机，可离线播放或导出文件。";self.play()
                    }catch{self.speechState.text = "本地保存失败：" + error.localizedDescription;self.inform(error.localizedDescription)}
                    }
                }
            }
        }catch{inform(error.localizedDescription)}
    }

}
final class RecorderVC: FormVC, AVAudioRecorderDelegate {
    var recorder:AVAudioRecorder?; var filename:String?; var timer:Timer?; let status = UILabel()
    override func viewDidLoad(){super.viewDidLoad();title = "录音";field("title","录音名称","录音 " + DateFormatter.localizedString(from:Date(),dateStyle:.short,timeStyle:.short),height:60);status.text = "尚未开始";stack.addArrangedSubview(status);button("开始录音",#selector(start));button("停止并保存",#selector(stop));label("最长 10 分钟。请保持应用在前台；切换应用或音频中断时自动停止保存。")
        NotificationCenter.default.addObserver(self,selector:#selector(stop),name:UIApplication.willResignActiveNotification,object:nil)
        NotificationCenter.default.addObserver(self,selector:#selector(stop),name:AVAudioSession.interruptionNotification,object:nil)
    }
    @objc func start(){guard recorder == nil else {return};AVAudioSession.sharedInstance().requestRecordPermission {allowed in DispatchQueue.main.async {guard allowed else {self.inform("请在系统设置中允许 SayAgain 使用麦克风");return};do{let s = AVAudioSession.sharedInstance();try s.setCategory(.playAndRecord,mode:.default,options:[.defaultToSpeaker]);try s.setActive(true);let name = UUID().uuidString + ".wav";self.filename = name;let r = try AVAudioRecorder(url:store.audioURL(name),settings:[AVFormatIDKey:kAudioFormatLinearPCM,AVSampleRateKey:24000,AVNumberOfChannelsKey:1,AVLinearPCMBitDepthKey:16,AVLinearPCMIsFloatKey:false,AVLinearPCMIsBigEndianKey:false]);self.recorder = r;guard r.record(forDuration:600) else {self.recorder = nil;throw failure("无法开始录音")};r.delegate = self;UIApplication.shared.isIdleTimerDisabled = true;self.timer = Timer.scheduledTimer(withTimeInterval:1,repeats:true){_ in self.status.text = "正在录音  \(Int(r.currentTime)) 秒"}}catch{self.inform(error.localizedDescription)}}}}
    @objc func stop(){guard let r = recorder else {return};r.delegate = nil;r.stop();recorder = nil;timer?.invalidate();UIApplication.shared.isIdleTimerDisabled = false;try? AVAudioSession.sharedInstance().setActive(false);do{let duration = AVURLAsset(url:r.url).duration.seconds;guard duration.isFinite,duration>0 else {throw failure("录音为空")};var e = Entry(kind:"recording",fields:["title":value("title").isEmpty ? "录音" : value("title"),"duration":String(Int(duration))]);e.audio = filename;try store.save(e);status.text = "已保存 \(Int(duration)) 秒，可返回我的音频查看"}catch{status.text = "保存失败，音频仍保留在 Documents";inform(error.localizedDescription)}}
    func audioRecorderDidFinishRecording(_ recorder:AVAudioRecorder,successfully flag:Bool){stop()}
    override func viewWillDisappear(_ animated:Bool){super.viewWillDisappear(animated);stop()}
}
final class SettingsVC: FormVC, UIDocumentPickerDelegate {
    let tokenField = UITextField()
    override func viewDidLoad(){super.viewDidLoad();title = "设置";tabBarItem.title = "设置";section("偏好与服务",detail:"阅读、播放、账号与本地资料，分别管理。")
        button("阅读与播放 · 字号和音量",#selector(appearanceSettings));button("默认语音模型",#selector(defaultSpeechModel));section("账号与服务");button("千问账号配置",#selector(qwenAccounts));button("大模型 API 配置",#selector(textModels));section("语言偏好")
        field("native","母语代码",UserDefaults.standard.string(forKey:"nativeLanguage") ?? "zh-CN",height:50);field("target","学习语言代码",UserDefaults.standard.string(forKey:"targetLanguage") ?? "en-US",height:50)
        section("电脑连接",detail:"转写等电脑端能力使用此连接。千问语音从 iPad 直接调用。")
        field("base","电脑 API 根地址",API.shared.base,height:60);label("连接令牌（留空保留；变更地址时清除旧令牌）");tokenField.isSecureTextEntry = true;tokenField.borderStyle = .roundedRect;tokenField.autocorrectionType = .no;tokenField.autocapitalizationType = .none;tokenField.heightAnchor.constraint(equalToConstant:48).isActive = true;stack.addArrangedSubview(tokenField)
        button("保存设置",#selector(save));button("检查 API 能力",#selector(check));section("资料与备份");button("导出完整资料备份",#selector(exportBackup));button("导入备份 / 桌面表达 JSON",#selector(importBackup));label("离线可用：表达整理、录音、播放、人物与音色资料、系统朗读。\n需要 API：表达优化、转写、候选说话人、克隆声音。\nHTTP 仅用于你信任的局域网；公网必须 HTTPS。千问账号单独配置，生成前显示账号、音色和模型。\n长录音拆条编辑、自动同步和跨会话声纹匹配尚未移植。")
    }
    @objc func save(){do{try API.shared.configure(base:value("base"),token:tokenField.text ?? "");UserDefaults.standard.set(value("native"),forKey:"nativeLanguage");UserDefaults.standard.set(value("target"),forKey:"targetLanguage");tokenField.text = "";inform("设置已保存")}catch{inform(error.localizedDescription)}}
    @objc func appearanceSettings(){navigationController?.pushViewController(PreferencesVC(),animated:true)}
    @objc func defaultSpeechModel(){navigationController?.pushViewController(SpeechModelPickerVC(style:.grouped),animated:true)}
    @objc func qwenAccounts(){navigationController?.pushViewController(QwenAccountSettingsVC(),animated:true)}
    @objc func textModels(){navigationController?.pushViewController(TextModelSettingsVC(),animated:true)}
    @objc func check(){API.shared.call("capabilities"){r in switch r {case .success(let d):self.inform((d["summary"] as? String) ?? "API 已连接");case .failure(let e):self.inform(e.localizedDescription)}}}
    @objc func exportBackup(){do {let url = FileManager.default.temporaryDirectory.appendingPathComponent("SayAgain-backup.json");try store.exportData().write(to:url,options:.atomic);share(url)}catch{inform(error.localizedDescription)}}
    @objc func importBackup(){let p = UIDocumentPickerViewController(documentTypes:[kUTTypeJSON as String],in:.import);p.delegate = self;present(p,animated:true)}
    func documentPicker(_ controller:UIDocumentPickerViewController,didPickDocumentsAt urls:[URL]){guard let url = urls.first else {return};do{let size = try url.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 0;guard size<=60*1024*1024 else {throw failure("备份超过 60MB")};let count = try store.importData(Data(contentsOf:url));inform("已合并导入 \(count) 条，不覆盖已有资料")}catch{inform(error.localizedDescription)}}
}
