import Foundation
import AVFoundation

final class TTSTestProtocol:URLProtocol {
    static var routes:[String] = []
    static var audio = Data()
    static var failGeneration = false
    static var expectedModel = SpeechModel.standard
    override class func canInit(with request:URLRequest)->Bool {true}
    override class func canonicalRequest(for request:URLRequest)->URLRequest {request}
    override func startLoading(){
        let path = request.url!.path;Self.routes.append(path)
        var result:Data;var status = 200
        var bodyData = request.httpBody
        if bodyData == nil,let stream = request.httpBodyStream {stream.open();var bytes = Data();var buffer = [UInt8](repeating:0,count:4096);while stream.hasBytesAvailable {let count = stream.read(&buffer,maxLength:buffer.count);if count<=0 {break};bytes.append(contentsOf:buffer.prefix(count))};stream.close();bodyData = bytes}
        let json = bodyData.flatMap {try? JSONSerialization.jsonObject(with:$0) as? [String:Any]}
        let inputBody = json?["input"] as? [String:Any]
        if path == "/api/v1/uploads" {assert(request.value(forHTTPHeaderField:"Authorization") == "Bearer test-key");result = try! JSONSerialization.data(withJSONObject:["data":["upload_host":"https://test.aliyuncs.com/upload","upload_dir":"test-dir","oss_access_key_id":"oss-key","signature":"sig","policy":"policy","x_oss_object_acl":"private","x_oss_forbid_overwrite":"true","expires":123]])}
        else if path == "/upload" {assert(request.value(forHTTPHeaderField:"Authorization") == nil);assert(request.value(forHTTPHeaderField:"Content-Type")!.contains("multipart/form-data"));result = Data()}
        else if path.contains("customization") {assert(request.value(forHTTPHeaderField:"Authorization") == "Bearer test-key");assert(inputBody?["target_model"] as? String == Self.expectedModel.id);result = Data("{\"output\":{\"voice\":\"test-voice\",\"voice_id\":\"test-voice\"}}".utf8)}
        else if path.contains("generation") || path.contains("SpeechSynthesizer") {assert(request.value(forHTTPHeaderField:"Authorization") == "Bearer test-key");assert(json?["model"] as? String == Self.expectedModel.id);status = Self.failGeneration ? 403 : 200
            if inputBody?["action"] as? String == "voice_clone" {result = Data("{\"output\":{}}".utf8)}
            else if Self.expectedModel.family == .minimax {let hex = Self.audio.map {String(format:"%02x",$0)}.joined();result = try! JSONSerialization.data(withJSONObject:["output":["data":["status":2,"audio":hex]]])}
            else {result = Data("{\"output\":{\"audio\":{\"url\":\"https://test.aliyuncs.com/audio.wav?signature=preserved\"}}}".utf8)}
        }else {assert(request.value(forHTTPHeaderField:"Authorization") == nil);assert(request.url!.query == "signature=preserved");result = Self.audio}
        client?.urlProtocol(self,didReceive:HTTPURLResponse(url:request.url!,statusCode:status,httpVersion:nil,headerFields:nil)!,cacheStoragePolicy:.notAllowed);client?.urlProtocol(self,didLoad:result);client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading(){}
}
let testRoot = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
try FileManager.default.createDirectory(at:testRoot,withIntermediateDirectories:true)
defer{try? FileManager.default.removeItem(at:testRoot)}
let wav = testRoot.appendingPathComponent("reference.wav")
let settings:[String:Any] = [AVFormatIDKey:kAudioFormatLinearPCM,AVSampleRateKey:24000,AVNumberOfChannelsKey:1,AVLinearPCMBitDepthKey:16,AVLinearPCMIsFloatKey:false,AVLinearPCMIsBigEndianKey:false]
do{let file = try AVAudioFile(forWriting:wav,settings:settings);let buffer = AVAudioPCMBuffer(pcmFormat:file.processingFormat,frameCapacity:240000)!;buffer.frameLength = 240000;for i in 0..<240000 {buffer.floatChannelData![0][i] = Float(sin(Double(i)*0.1))*0.05};try file.write(from:buffer)}
TTSTestProtocol.audio = try Data(contentsOf:wav)
let config = URLSessionConfiguration.ephemeral;config.protocolClasses = [TTSTestProtocol.self]
let suite = "sayagain-tts-test-" + UUID().uuidString;let defaults = UserDefaults(suiteName:suite)!
defer{defaults.removePersistentDomain(forName:suite)}
let tts = QwenTTS(configuration:config,defaults:defaults)
let input = try QwenTTS.prepare(text:"Hello.",language:"en-US",reference:wav,key:"test-key")
func runTTS(_ requestInput:QwenTTSInput = input,cancel:Bool = false)throws->Data {
    var result:Result<Data,Error>?
    let job = tts.synthesize(requestInput,progress:{_ in},done:{result = $0})
    if cancel {job.cancel()}
    let deadline = Date().addingTimeInterval(10)
    while result == nil && Date()<deadline {_ = RunLoop.current.run(mode:.default,before:Date().addingTimeInterval(0.02))}
    guard let value = result else {throw failure("mock timed out")};return try value.get()
}
let audio = try runTTS();assert(audio == TTSTestProtocol.audio);assert(TTSTestProtocol.routes.count == 3)
let library = LibraryStore(root:testRoot.appendingPathComponent("library"));var entry = Entry(kind:"expression",fields:["original":"Hello."])
entry = try library.saveGeneratedAudio(audio,for:entry);let reopened = LibraryStore(root:library.root)
assert(reopened.library.entries.first?.audio == entry.audio)
let audioFile = try reopened.audioURL(entry.audio!);let savedAudio = try Data(contentsOf:audioFile);assert(savedAudio == audio)
let player = try AVAudioPlayer(contentsOf:audioFile);assert(player.duration >= 10)
_ = try runTTS();assert(TTSTestProtocol.routes.count == 5,"enrollment should be reused")
TTSTestProtocol.failGeneration = true
do{_ = try runTTS();assertionFailure("HTTP error accepted")}catch{}
TTSTestProtocol.failGeneration = false
do{_ = try runTTS(cancel:true);assertionFailure("cancel accepted")}catch{}
for url in ["https://attacker.test/audio.wav","https://user:pass@test.aliyuncs.com/a","http://qianwenai.com/a"] {do{_ = try QwenTTS.audioURL(url);assertionFailure("unsafe url accepted")}catch{}}
let upgraded = try QwenTTS.audioURL("http://test.aliyuncs.com/a?sig=x");assert(upgraded.absoluteString == "https://test.aliyuncs.com/a?sig=x")
let corruptRoot = testRoot.appendingPathComponent("bad");try FileManager.default.createDirectory(at:corruptRoot,withIntermediateDirectories:true);try Data("bad".utf8).write(to:corruptRoot.appendingPathComponent("library.json"));let corrupt = LibraryStore(root:corruptRoot)
do{_ = try corrupt.saveGeneratedAudio(audio,for:entry);assertionFailure("corrupt saved")}catch{}
let remaining = try FileManager.default.contentsOfDirectory(atPath:corruptRoot.path);assert(remaining == ["library.json"])
print("PASS TTS enrollment, generation, credential isolation, cached voice, download, local persistence/reopen/playability, HTTP failure, cancellation, unsafe URL rejection and rollback")

for model in SpeechModel.all where model.family != .realtime {
    TTSTestProtocol.expectedModel = model
    let selected = try QwenTTS.prepare(text:"Hello.",language:"en-US",reference:wav,key:"test-key",model:model)
    let rendered = try runTTS(selected);assert(rendered == TTSTestProtocol.audio)
}
let prefs = Preferences(defaults:defaults);prefs.update {$0.fontScale = 1.35;$0.volume = 0.42;$0.speechModelID = "cosyvoice-v3.5-plus"}
let restored = Preferences(defaults:defaults);assert(restored.value.fontScale == 1.35 && restored.value.volume == 0.42 && restored.model.family == .cosyvoice)
prefs.update {$0.volume = 5;$0.fontScale = 20};assert(prefs.value.volume == 1 && prefs.value.fontScale == 1.5)
prefs.update {$0.speechModelID = "invalid"};assert(prefs.model.family == .cosyvoice)
print("PASS all 12 HTTP model routes, OSS policy/upload, enrollment target model, MiniMax clone/hex audio, preference persistence and bounds")
