import UIKit
import AVFoundation

final class VoiceRecorderVC: FormVC, AVAudioRecorderDelegate {
    static let reading = "我们每天都在忙着寻找答案，却很少停下来，认真看看自己的问题。今天，我想给自己一点安静的时间，想一想：什么是我真正看重的？哪些判断只是习惯，哪些选择出于内心？承认不知道，并不是软弱，而是学习的开始。愿我保持好奇，愿意倾听，也敢于修正自己。让每一次真诚的提问，都成为认识自己的一小步。"
    var recorder: AVAudioRecorder?
    var player: AVAudioPlayer?
    var timer: Timer?
    var draft: URL?
    var duration: Double = 0
    var requestingPermission = false
    let status = UILabel()
    override func viewDidLoad() {
        super.viewDidLoad(); title = "录制我的音色"
        navigationItem.leftBarButtonItem = UIBarButtonItem(title:"返回",style:.plain,target:self,action:#selector(back))
        field("voice-name","音色名称","我的声音",height:52)
        label("认识自己 · 中文朗读约 30 秒")
        label("受苏格拉底的自省与求知思想启发的原创朗读稿，非名言原文。请按自然语速读完，不必赶在 30 秒结束。")
        field("voice-script","朗读文本 · 可修改或校对",Self.reading,height:220)
        status.text = "准备好后开始 · 建议 30 秒";status.numberOfLines = 0;status.font = .monospacedDigitSystemFont(ofSize:18,weight:.medium);status.accessibilityIdentifier = "voice-recording-status";stack.addArrangedSubview(status)
        button("开始录制 / 重新录制",#selector(start))
        button("停止录制",#selector(stop))
        button("试听 / 停止播放",#selector(preview))
        button("保存为我的音色",#selector(saveVoice))
        label("选择安静的环境，用平时说话的声音朗读。支持 10–60 秒，最长 60 秒自动停止。录音与原文保存在这台 iPad；声音克隆需要另行连接电脑。")
        NotificationCenter.default.addObserver(self,selector:#selector(stop),name:UIApplication.willResignActiveNotification,object:nil)
        NotificationCenter.default.addObserver(self,selector:#selector(stop),name:AVAudioSession.interruptionNotification,object:nil)
    }
    @objc func start() {
        guard recorder == nil, !requestingPermission else {return}
        guard !value("voice-script").isEmpty else {inform("请先填写朗读文本");return}
        if draft != nil {
            let alert = UIAlertController(title:"重新录制？",message:"将替换本次尚未保存的录音。",preferredStyle:.alert)
            alert.addAction(UIAlertAction(title:"取消",style:.cancel));alert.addAction(UIAlertAction(title:"重新录制",style:.destructive){_ in self.requestPermission()});present(alert,animated:true)
        } else {requestPermission()}
    }
    func requestPermission() {
        requestingPermission = true
        AVAudioSession.sharedInstance().requestRecordPermission { [weak self] allowed in DispatchQueue.main.async {
            guard let self = self else {return};self.requestingPermission = false
            guard self.view.window != nil, self.navigationController?.topViewController === self else {return}
            guard allowed else {self.inform("请在系统设置中允许 SayAgain 使用麦克风");return}
            self.begin()
        }}
    }
    func begin() {
        player?.stop();view.endEditing(true)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".wav")
        do {
            let session = AVAudioSession.sharedInstance();try session.setCategory(.playAndRecord,mode:.default,options:[.defaultToSpeaker]);try session.setActive(true)
            let recording = try AVAudioRecorder(url:url,settings:[AVFormatIDKey:kAudioFormatLinearPCM,AVSampleRateKey:24000,AVNumberOfChannelsKey:1,AVLinearPCMBitDepthKey:16,AVLinearPCMIsFloatKey:false,AVLinearPCMIsBigEndianKey:false])
            recording.delegate = self
            guard recording.record(forDuration:59.8) else {throw failure("无法开始录音，请重试")}
            if let old = draft {try? FileManager.default.removeItem(at:old)}
            draft = url;duration = 0;recorder = recording;inputs["voice-script"]?.isEditable = false
            UIApplication.shared.isIdleTimerDisabled = true;status.text = "正在录制  0 秒 / 建议 30 秒"
            timer = Timer.scheduledTimer(withTimeInterval:0.5,repeats:true){[weak self] _ in
                guard let self = self, let r = self.recorder else {return}
                let seconds = Int(r.currentTime);self.status.text = "正在录制  \(seconds) 秒" + (seconds >= 30 ? " · 读完即可停止" : " / 建议 30 秒")
            }
        } catch {try? FileManager.default.removeItem(at:url);try? AVAudioSession.sharedInstance().setActive(false);inform(error.localizedDescription)}
    }
    @objc func stop() {
        player?.stop()
        guard let r = recorder else {return}
        r.delegate = nil;r.stop();recorder = nil;timer?.invalidate();timer = nil
        UIApplication.shared.isIdleTimerDisabled = false;inputs["voice-script"]?.isEditable = true
        try? AVAudioSession.sharedInstance().setActive(false)
        duration = AVURLAsset(url:r.url).duration.seconds
        status.text = duration.isFinite && duration >= 10 ? "已录制 \(Int(duration)) 秒 · 请试听并确认原文" : "录音不足 10 秒，请重新录制"
    }
    func audioRecorderDidFinishRecording(_ recorder:AVAudioRecorder,successfully flag:Bool) {stop();if !flag {duration = 0;status.text = "录音未完成，请重新录制"}}
    func audioRecorderEncodeErrorDidOccur(_ recorder:AVAudioRecorder,error:Error?) {stop();duration = 0;status.text = "录音失败，请重新录制"}
    @objc func preview() {
        guard recorder == nil else {inform("请先停止录制");return}
        if player?.isPlaying == true {player?.stop();return}
        guard let url = draft else {inform("请先录制一段声音");return}
        do {let session = AVAudioSession.sharedInstance();try session.setCategory(.playback,mode:.default);try session.setActive(true);player = try AVAudioPlayer(contentsOf:url);player?.volume = Preferences.shared.value.volume;player?.play()} catch {inform(error.localizedDescription)}
    }
    @objc func saveVoice() {
        guard recorder == nil else {inform("请先停止录制并试听");return}
        guard let source = draft, duration.isFinite, duration >= 10, duration <= 60 else {inform("请录制 10–60 秒的声音后保存");return}
        guard !value("voice-name").isEmpty, !value("voice-script").isEmpty else {inform("请填写音色名称和实际朗读的原文");return}
        let name = UUID().uuidString + ".wav"
        do {
            let target = try store.audioURL(name);try FileManager.default.copyItem(at:source,to:target)
            var entry = Entry(kind:"voice",fields:["title":value("voice-name"),"text":value("voice-script"),"duration":String(Int(duration)),"note":"独立录制 · 中文参考音色"]);entry.audio = name
            do {try store.save(entry)} catch {try? FileManager.default.removeItem(at:target);throw error}
            player?.stop();try? FileManager.default.removeItem(at:source);draft = nil
            navigationController?.popViewController(animated:true)
        } catch {inform(error.localizedDescription)}
    }
    @objc func back() {
        stop()
        guard draft != nil else {navigationController?.popViewController(animated:true);return}
        let alert = UIAlertController(title:"录音尚未保存",message:"可以继续试听并保存，或放弃本次录音。",preferredStyle:.alert)
        alert.addAction(UIAlertAction(title:"继续编辑",style:.cancel));alert.addAction(UIAlertAction(title:"放弃录音",style:.destructive){_ in self.navigationController?.popViewController(animated:true)});present(alert,animated:true)
    }
    override func viewWillDisappear(_ animated:Bool) {super.viewWillDisappear(animated);stop();try? AVAudioSession.sharedInstance().setActive(false)}
    deinit {timer?.invalidate();if let url = draft {try? FileManager.default.removeItem(at:url)}}
}
