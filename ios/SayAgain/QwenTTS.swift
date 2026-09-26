import Foundation
import AVFoundation
import CommonCrypto

final class QwenTTSJob {
    fileprivate var task:URLSessionTask?
    fileprivate var cancelled = false
    func cancel(){cancelled = true;task?.cancel()}
}
struct QwenTTSInput {
    let model:SpeechModel
    let text:String
    let language:String
    let reference:Data
    let key:String
    let voiceCacheKey:String
}
final class QwenTTS: NSObject, URLSessionTaskDelegate {
    static let shared = QwenTTS()
    static let model = "qwen3-tts-vc-2026-01-22"
    static let base = "https://maas.qianwenaiapi.com/api/v1"
    private let configuration:URLSessionConfiguration
    private let defaults:UserDefaults
    private lazy var session = URLSession(configuration:configuration,delegate:self,delegateQueue:nil)
    init(configuration:URLSessionConfiguration = .ephemeral,defaults:UserDefaults = .standard){self.configuration = configuration;self.defaults = defaults;super.init()}
    static func hash(_ bytes:Data)->String {var digest = [UInt8](repeating:0,count:Int(CC_SHA256_DIGEST_LENGTH));bytes.withUnsafeBytes {raw in _ = CC_SHA256(raw.baseAddress,CC_LONG(bytes.count),&digest)};return digest.map {String(format:"%02x",$0)}.joined()}
    static func prepare(text:String,language:String,reference:URL,key:String,model:SpeechModel = .standard)throws->QwenTTSInput {
        let text = text.trimmingCharacters(in:.whitespacesAndNewlines)
        guard !text.isEmpty,text.unicodeScalars.count <= 600 else {throw failure("合成文字需为 1–600 字")}
        guard !key.isEmpty,!key.hasPrefix("sk-mgmt-"),key.unicodeScalars.allSatisfy({33...126 ~= $0.value}) else {throw failure("请在千问账号配置中选择有效 API Key")}
        let languages = ["zh":"Chinese","en":"English","ja":"Japanese","ko":"Korean","de":"German","fr":"French","ru":"Russian","pt":"Portuguese","es":"Spanish","it":"Italian"]
        guard let lang = languages[String(language.split(separator:"-").first ?? "en")] else {throw failure("语音模型不支持此学习语言")}
        let size = try reference.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 0
        guard reference.pathExtension.lowercased() == "wav",size>0,size<=10*1024*1024 else {throw failure("参考录音需为 10MB 以内的 WAV，请在我的音色中独立录制")}
        let audio = try AVAudioFile(forReading:reference);let duration = Double(audio.length)/audio.processingFormat.sampleRate
        guard duration.isFinite,duration>=10,duration<=60,audio.processingFormat.channelCount == 1,audio.processingFormat.sampleRate>=24000 else {throw failure("参考录音需为 10–60 秒、至少 24kHz 的单声道 WAV")}
        let bytes = try Data(contentsOf:reference)
        let cache = "qwen-voice-" + hash(Data((hash(bytes) + model.id + hash(Data(key.utf8))).utf8))
        return QwenTTSInput(model:model,text:text,language:lang,reference:bytes,key:key,voiceCacheKey:cache)
    }
    static func audioURL(_ raw:String)throws->URL {
        guard var c = URLComponents(string:raw),let host = c.host,c.user == nil,c.password == nil,c.port == nil,["maas.qianwenaiapi.com","qianwenai.com","aliyuncs.com"].contains(where:{host == $0 || host.hasSuffix("." + $0)}) else {throw failure("云端返回的音频地址无效")}
        if c.scheme == "http",host.hasSuffix(".aliyuncs.com") {c.scheme = "https"}
        guard c.scheme == "https",let url = c.url else {throw failure("音频下载必须使用 HTTPS")};return url
    }
    private func request(_ request:URLRequest,job:QwenTTSJob,limit:Int,done:@escaping(Result<Data,Error>)->Void) {
        guard !job.cancelled else {done(.failure(failure("已取消语音生成")));return}
        job.task = session.dataTask(with:request){data,response,error in
            let result = Result<Data,Error> {if let error = error {throw error};guard let http = response as? HTTPURLResponse,(200...299).contains(http.statusCode) else {throw failure("千问语音服务 HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0)，请检查账号余额与模型权限")};guard let bytes = data,bytes.count <= limit else {throw failure("语音服务返回为空或过大")};return bytes}
            DispatchQueue.main.async {done(job.cancelled ? .failure(failure("已取消语音生成")) : result)}
        };job.task?.resume()
    }
    private func post(_ path:String,_ body:[String:Any],input:QwenTTSInput,job:QwenTTSJob,headers:[String:String] = [:],done:@escaping(Result<[String:Any],Error>)->Void) {
        do{var r = URLRequest(url:URL(string:Self.base + path)!);r.httpMethod = "POST";r.timeoutInterval = 120;r.setValue("Bearer " + input.key,forHTTPHeaderField:"Authorization");r.setValue("application/json",forHTTPHeaderField:"Content-Type");r.httpBody = try JSONSerialization.data(withJSONObject:body);for (name,value) in headers {r.setValue(value,forHTTPHeaderField:name)}
            request(r,job:job,limit:70*1024*1024){result in done(result.flatMap {bytes in Result {guard let value = try JSONSerialization.jsonObject(with:bytes) as? [String:Any] else {throw failure("千问语音响应格式无效")};if let code = value["code"] as? String,!code.isEmpty {throw failure("千问平台返回业务错误，请检查模型权限与额度")};return value}})}
        }catch{done(.failure(error))}
    }
    private func upload(_ input:QwenTTSInput,job:QwenTTSJob,done:@escaping(Result<String,Error>)->Void){
        let model = input.model.family == .minimax ? input.model.id : "voice-enrollment"
        var c = URLComponents(string:Self.base + "/uploads")!;c.queryItems = [URLQueryItem(name:"action",value:"getPolicy"),URLQueryItem(name:"model",value:model)]
        var r = URLRequest(url:c.url!);r.timeoutInterval = 60;r.setValue("Bearer " + input.key,forHTTPHeaderField:"Authorization")
        request(r,job:job,limit:1024*1024){result in
            do{let bytes = try result.get();guard let json = try JSONSerialization.jsonObject(with:bytes) as? [String:Any],let policy = json["data"] as? [String:Any],let host = policy["upload_host"] as? String,let dir = policy["upload_dir"] as? String,!dir.isEmpty,!dir.contains("\r"),!dir.contains("\n") else {throw failure("参考录音上传凭证无效")};let url = try Self.audioURL(host);guard url.host?.hasSuffix(".aliyuncs.com") == true else {throw failure("上传地址无效")}
                let boundary = UUID().uuidString;let name = UUID().uuidString + ".wav";let object = dir.trimmingCharacters(in:CharacterSet(charactersIn:"/")) + "/" + name;var data = Data()
                func field(_ key:String,_ value:String){data.append(Data(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + key + "\"\r\n\r\n" + value + "\r\n").utf8))}
                for (fieldName,key) in ["OSSAccessKeyId":"oss_access_key_id","Signature":"signature","policy":"policy","x-oss-object-acl":"x_oss_object_acl","x-oss-forbid-overwrite":"x_oss_forbid_overwrite"] {guard let value = policy[key] as? String else {throw failure("上传凭证不完整")};field(fieldName,value)}
                field("key",object);field("success_action_status","200");data.append(Data(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" + name + "\"\r\nContent-Type: audio/wav\r\n\r\n").utf8));data.append(input.reference);data.append(Data(("\r\n--" + boundary + "--\r\n").utf8))
                var upload = URLRequest(url:url);upload.httpMethod = "POST";upload.timeoutInterval = 120;upload.setValue("multipart/form-data; boundary=" + boundary,forHTTPHeaderField:"Content-Type");upload.httpBody = data
                self.request(upload,job:job,limit:1024*1024){done($0.map {_ in "oss://" + object})}
            }catch{done(.failure(error))}
        }
    }
    @discardableResult func synthesize(_ input:QwenTTSInput,progress:@escaping(String)->Void,done:@escaping(Result<Data,Error>)->Void)->QwenTTSJob {
        let job = QwenTTSJob();let family = input.model.family
        func complete(_ bytes:Data){do{let player = try AVAudioPlayer(data:bytes);guard !bytes.isEmpty,bytes.count<=25*1024*1024,player.duration.isFinite,player.duration>0 else {throw failure("合成音频无法播放或超过大小限制")};done(.success(bytes))}catch{done(.failure(error))}}
        func generate(_ voice:String){
            progress("正在生成语音…")
            if family == .realtime {if #available(iOS 13.0,*) {self.realtime(input,voice:voice,job:job,done:done)}else{done(.failure(failure("实时模型需要 iOS 13 或更新版本")))};return}
            let legacy = family == .audio || family == .cosyvoice
            let route = legacy ? "/services/audio/tts/SpeechSynthesizer" : "/services/aigc/multimodal-generation/generation"
            let body:[String:Any]
            if family == .minimax {body = ["model":input.model.id,"input":["text":input.text,"voice_setting":["voice_id":voice],"audio_setting":["format":"wav","sample_rate":24000,"channel":1],"output_format":"hex"]]}
            else if legacy {body = ["model":input.model.id,"input":["text":input.text,"voice":voice,"format":"wav","sample_rate":24000]]}
            else {body = ["model":input.model.id,"input":["text":input.text,"voice":voice,"language_type":input.language]]}
            self.post(route,body,input:input,job:job){result in
                do{let data = try result.get();guard let output = data["output"] as? [String:Any] else {throw failure("千问未返回合成结果")}
                    if family == .minimax {guard let value = output["data"] as? [String:Any],value["status"] as? Int == 2,let hex = value["audio"] as? String,!hex.isEmpty,hex.count%2 == 0,hex.count<=50*1024*1024 else {throw failure("MiniMax 音频尚未完整返回")};let chars = Array(hex.utf8);var bytes = Data();bytes.reserveCapacity(chars.count/2);for i in stride(from:0,to:chars.count,by:2){guard let value = UInt8(String(bytes:chars[i...i+1],encoding:.ascii) ?? "",radix:16) else {throw failure("MiniMax 音频编码无效")};bytes.append(value)};complete(bytes);return}
                    guard let audio = output["audio"] as? [String:Any],let raw = audio["url"] as? String else {throw failure("千问未返回合成音频")};let url = try Self.audioURL(raw)
                    progress("正在下载语音到本地…");var r = URLRequest(url:url);r.timeoutInterval = 120
                    self.request(r,job:job,limit:25*1024*1024){switch $0 {case .failure(let e):done(.failure(e));case .success(let bytes):complete(bytes)}}
                }catch{done(.failure(error))}
            }
        }
        func remember(_ voice:String){self.defaults.set(voice,forKey:input.voiceCacheKey);generate(voice)}
        if let voice = defaults.string(forKey:input.voiceCacheKey),!voice.isEmpty {generate(voice)}else{
            progress("正在准备所选音色…")
            if family == .qwen || family == .realtime {
                post("/services/audio/tts/customization",["model":"qwen-voice-enrollment","input":["action":"create","target_model":input.model.id,"preferred_name":"sayagain","audio":["data":"data:audio/wav;base64," + input.reference.base64EncodedString()]]],input:input,job:job){result in do{let data = try result.get();guard let output = data["output"] as? [String:Any],let voice = output["voice"] as? String,!voice.isEmpty else {throw failure("千问未返回克隆音色")};remember(voice)}catch{done(.failure(error))}}
            }else{
                upload(input,job:job){result in do{let url = try result.get();let headers = ["X-DashScope-OssResourceResolve":"enable"]
                    if family == .minimax {let voice = "sayagain" + UUID().uuidString.replacingOccurrences(of:"-",with:"");self.post("/services/aigc/multimodal-generation/generation",["model":input.model.id,"input":["action":"voice_clone","voice_id":voice,"audio_url":url,"text":input.text]],input:input,job:job,headers:headers){result in do{_ = try result.get();remember(voice)}catch{done(.failure(error))}}}
                    else {self.post("/services/audio/tts/customization",["model":"voice-enrollment","input":["action":"create_voice","target_model":input.model.id,"prefix":"sayagain","url":url]],input:input,job:job,headers:headers){result in do{let data = try result.get();guard let output = data["output"] as? [String:Any],let voice = output["voice_id"] as? String,!voice.isEmpty else {throw failure("未返回克隆音色")};remember(voice)}catch{done(.failure(error))}}}
                }catch{done(.failure(error))}}
            }
        }
        return job
    }
    @available(iOS 13.0,macOS 10.15,*) private func realtime(_ input:QwenTTSInput,voice:String,job:QwenTTSJob,done:@escaping(Result<Data,Error>)->Void){
        var c = URLComponents(string:"wss://maas.qianwenaiapi.com/api-ws/v1/realtime")!;c.queryItems = [URLQueryItem(name:"model",value:input.model.id)];var r = URLRequest(url:c.url!);r.setValue("Bearer " + input.key,forHTTPHeaderField:"Authorization");let socket = session.webSocketTask(with:r);job.task = socket;var pcm = Data();var finished = false;var configured = false;var submitted = false
        var timeout:DispatchWorkItem?
        func finish(_ result:Result<Data,Error>){guard !finished else {return};finished = true;timeout?.cancel();socket.cancel(with:.goingAway,reason:nil);done(job.cancelled ? .failure(failure("已取消语音生成")) : result)}
        func send(_ value:[String:Any]){do{var value = value;value["event_id"] = UUID().uuidString;let data = try JSONSerialization.data(withJSONObject:value);socket.send(.string(String(data:data,encoding:.utf8)!)){error in if error != nil {DispatchQueue.main.async {finish(.failure(failure("实时语音连接失败")))}}}}catch{finish(.failure(error))}}
        func receive(){socket.receive {result in DispatchQueue.main.async {guard !finished else {return};do{let message = try result.get();let bytes:Data;switch message {case .data(let data):bytes = data;case .string(let text):bytes = Data(text.utf8);@unknown default:throw failure("实时响应无效")};guard let event = try JSONSerialization.jsonObject(with:bytes) as? [String:Any],let type = event["type"] as? String else {throw failure("实时响应无效")}
            if type == "session.created" && !configured {configured = true;send(["type":"session.update","session":["mode":"server_commit","voice":voice,"response_format":"pcm","sample_rate":24000]])}
            else if type == "session.updated" && !submitted {submitted = true;send(["type":"input_text_buffer.append","text":input.text]);send(["type":"session.finish"])}
            else if type == "response.audio.delta" {guard let raw = event["delta"] as? String,let data = Data(base64Encoded:raw),!data.isEmpty,pcm.count+data.count<=25*1024*1024 else {throw failure("实时音频无效或过大")};pcm.append(data)}
            else if type == "error" {throw failure("实时模型返回错误，请检查权限与额度")}
            else if type == "session.finished" {guard !pcm.isEmpty,pcm.count%2 == 0 else {throw failure("实时音频不完整")};var wav = Data();func text(_ t:String){wav.append(Data(t.utf8))};func number<T:FixedWidthInteger>(_ n:T){var v = n.littleEndian;withUnsafeBytes(of:&v){wav.append(contentsOf:$0)}};text("RIFF");number(UInt32(pcm.count+36));text("WAVEfmt ");number(UInt32(16));number(UInt16(1));number(UInt16(1));number(UInt32(24000));number(UInt32(48000));number(UInt16(2));number(UInt16(16));text("data");number(UInt32(pcm.count));wav.append(pcm);finish(.success(wav));return}
            receive()
        }catch{finish(.failure(error))}}}}
        timeout = DispatchWorkItem {finish(.failure(failure("实时语音超时")))};DispatchQueue.main.asyncAfter(deadline:.now()+120,execute:timeout!);socket.resume();receive()
    }
    func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest request:URLRequest,completionHandler:@escaping(URLRequest?)->Void){completionHandler(nil)}
}
