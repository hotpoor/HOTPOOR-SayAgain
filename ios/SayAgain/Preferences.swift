import Foundation

enum SpeechFamily:String,Codable {case qwen, audio, cosyvoice, minimax, realtime}
struct SpeechModel:Equatable {
    let id:String
    let title:String
    let family:SpeechFamily
    var group:String {switch family {case .qwen,.realtime:return "Qwen3-TTS";case .audio:return "Qwen-Audio";case .cosyvoice:return "CosyVoice";case .minimax:return "MiniMax"}}
    static let standard = SpeechModel(id:"qwen3-tts-vc-2026-01-22",title:"Qwen3-TTS VC",family:.qwen)
    static let all:[SpeechModel] = [standard,
        SpeechModel(id:"qwen-audio-3.0-tts-plus",title:"Qwen-Audio 3.0 · Plus",family:.audio),
        SpeechModel(id:"qwen-audio-3.1-tts-flash",title:"Qwen-Audio 3.1 · Flash",family:.audio),
        SpeechModel(id:"qwen-audio-3.0-tts-flash",title:"Qwen-Audio 3.0 · Flash",family:.audio),
        SpeechModel(id:"qwen3-tts-vc-realtime-2026-01-15",title:"Qwen3-TTS VC · Realtime",family:.realtime)]
        + ["v3.5-plus","v3.5-flash","v3-plus","v3-flash"].map {SpeechModel(id:"cosyvoice-" + $0,title:"CosyVoice " + $0,family:.cosyvoice)}
        + ["2.8-hd","02-hd","2.8-turbo","02-turbo"].map {SpeechModel(id:"MiniMax/speech-" + $0,title:"MiniMax Speech " + $0,family:.minimax)}
    static func find(_ id:String)->SpeechModel? {all.first {$0.id == id}}
}
struct UserPreferences:Codable {
    var fontScale:Double = 1
    var volume:Float = 1
    var speechModelID = SpeechModel.standard.id
}
final class Preferences {
    static let shared = Preferences()
    static let changed = Notification.Name("SayAgainPreferencesChanged")
    private let defaults:UserDefaults
    private(set) var value:UserPreferences
    init(defaults:UserDefaults = .standard){self.defaults = defaults;value = defaults.data(forKey:"SayAgain.preferences").flatMap {try? JSONDecoder().decode(UserPreferences.self,from:$0)} ?? UserPreferences();value.fontScale = min(1.5,max(0.85,value.fontScale));value.volume = min(1,max(0,value.volume));if SpeechModel.find(value.speechModelID) == nil {value.speechModelID = SpeechModel.standard.id}}
    var model:SpeechModel {SpeechModel.find(value.speechModelID) ?? .standard}
    func update(_ change:(inout UserPreferences)->Void){var next = value;change(&next);next.fontScale = next.fontScale.isFinite ? min(1.5,max(0.85,next.fontScale)) : 1;next.volume = next.volume.isFinite ? min(1,max(0,next.volume)) : 1;guard SpeechModel.find(next.speechModelID) != nil,let bytes = try? JSONEncoder().encode(next) else {return};value = next;defaults.set(bytes,forKey:"SayAgain.preferences");NotificationCenter.default.post(name:Self.changed,object:self)}
}
