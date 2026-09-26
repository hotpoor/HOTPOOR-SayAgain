import Foundation
import AVFoundation
import UIKit

struct LocalASRSegment:Codable {
    let start:Double
    let end:Double
    let text:String
}
struct LocalASRReport:Codable {
    let text:String
    let audioSeconds:Double
    let loadSeconds:Double
    let inferenceSeconds:Double
    let elapsedSeconds:Double
    let peakFootprintMB:Double
    let physicalMemoryMB:Double
    let model:String
    var segments:[LocalASRSegment] = []
    var totalSeconds:Double = 0
    var completed:Bool = false
    var source:String = ""
    var display:String {
        String(format:"%@\n%@\n\n已处理 %.2f / %.2f 秒 · %d 段\n模型加载 %.2f 秒 · 识别 %.2f 秒\n总耗时 %.2f 秒 · 采样内存峰值 %.1f MB\n草稿已单独保存在本机，未替换原文字。",completed ? "本机整段转写完成" : "本机转写草稿（未完成）",text.isEmpty ? "未识别到文字" : text,audioSeconds,totalSeconds,segments.count,loadSeconds,inferenceSeconds,elapsedSeconds,peakFootprintMB)
    }
}
enum LocalASR {
    private static let queue = DispatchQueue(label:"SayAgain.LocalASR",qos:.userInitiated)
    private static let cancelLock = NSLock()
    private static var cancelled = false
    private(set) static var running = false
    static func cancel() {cancelLock.lock();cancelled = true;cancelLock.unlock()}
    private static var shouldStop:Bool {cancelLock.lock();defer{cancelLock.unlock()};return cancelled}
    static func draftURL(for url:URL)->URL {url.appendingPathExtension("asr.json")}
    static func saved(for url:URL)->LocalASRReport? {
        guard let data = try? Data(contentsOf:draftURL(for:url)),let report = try? JSONDecoder().decode(LocalASRReport.self,from:data),report.source == url.lastPathComponent else {return nil}
        return report
    }
    static func run(url:URL,progress:@escaping(String)->Void,done:@escaping(Result<LocalASRReport,Error>)->Void) {
        dispatchPrecondition(condition:.onQueue(.main))
        guard !running else {done(.failure(failure("已有本机识别任务运行中")));return}
        guard let folder = Bundle.main.url(forResource:"LocalASRResources",withExtension:nil),FileManager.default.fileExists(atPath:folder.appendingPathComponent("model.int8.onnx").path) else {done(.failure(failure("此构建未包含离线模型")));return}
        running = true;cancelLock.lock();cancelled = false;cancelLock.unlock()
        let previousIdleSetting = UIApplication.shared.isIdleTimerDisabled
        UIApplication.shared.isIdleTimerDisabled = true
        let backgroundObserver = NotificationCenter.default.addObserver(forName:UIApplication.didEnterBackgroundNotification,object:nil,queue:.main){_ in cancel()}
        UserDefaults.standard.set(true,forKey:"localASRProbeInterrupted")
        queue.async {
            let started = Date();let lock = NSLock();var peak:UInt64 = 0
            let meter = DispatchSource.makeTimerSource(queue:DispatchQueue.global(qos:.utility))
            meter.schedule(deadline:.now(),repeating:.milliseconds(100))
            meter.setEventHandler {lock.lock();peak = max(peak,SAASREngine.memoryFootprint());lock.unlock()};meter.resume()
            let result:Result<LocalASRReport,Error>
            do {
                let file = try AVAudioFile(forReading:url,commonFormat:.pcmFormatFloat32,interleaved:false)
                let rate = file.processingFormat.sampleRate
                guard rate.isFinite,rate>0,file.length>0 else {throw failure("录音为空或格式不可读取")}
                DispatchQueue.main.async {progress("在 iPad 上加载 SenseVoice…可在当前步骤结束后停止")}
                let loading = Date()
                let engine = try SAASREngine(modelPath:folder.appendingPathComponent("model.int8.onnx").path,tokensPath:folder.appendingPathComponent("tokens.txt").path)
                let load = Date().timeIntervalSince(loading)
                var segments:[LocalASRSegment] = [];var inference:Double = 0
                func report()->LocalASRReport {
                    lock.lock();let memory = max(peak,SAASREngine.memoryFootprint());lock.unlock()
                    return LocalASRReport(text:segments.map{$0.text}.filter{!$0.isEmpty}.joined(separator:"\n"),audioSeconds:Double(file.framePosition)/rate,loadSeconds:load,inferenceSeconds:inference,elapsedSeconds:Date().timeIntervalSince(started),peakFootprintMB:Double(memory)/1048576,physicalMemoryMB:Double(ProcessInfo.processInfo.physicalMemory)/1048576,model:"SenseVoice INT8 · sherpa-onnx 1.10.30 · CPU 1 thread",segments:segments,totalSeconds:Double(file.length)/rate,completed:file.framePosition>=file.length,source:url.lastPathComponent)
                }
                while file.framePosition<file.length && !shouldStop {
                    try autoreleasepool {
                        let start = Double(file.framePosition)/rate
                        let pcm = try samples(file)
                        let end = Double(file.framePosition)/rate;let number = segments.count+1
                        DispatchQueue.main.async {progress(String(format:"本机正在识别第 %d 段 · %.1f–%.1f 秒 / %.1f 秒\n已完成段落已保存，停止会在当前段结束后生效。",number,start,end,Double(file.length)/rate))}
                        let decoding = Date();let text = try engine.transcribePCM(pcm);inference += Date().timeIntervalSince(decoding)
                        segments.append(LocalASRSegment(start:start,end:end,text:text))
                        try JSONEncoder().encode(report()).write(to:draftURL(for:url),options:.atomic)
                    }
                }
                guard !segments.isEmpty else {throw failure("已停止，尚未生成新段落；已有草稿保留")}
                let final = report();try JSONEncoder().encode(final).write(to:draftURL(for:url),options:.atomic);result = .success(final)
            }catch {result = .failure(error)}
            meter.cancel()
            DispatchQueue.main.async {NotificationCenter.default.removeObserver(backgroundObserver);UIApplication.shared.isIdleTimerDisabled = previousIdleSetting;running = false;UserDefaults.standard.set(false,forKey:"localASRProbeInterrupted");done(result)}
        }
    }
    // Bounded 10-second buffers. Prefer a quiet 120 ms window after 7 seconds;
    // this is an energy heuristic, not a VAD model or word alignment.
    private static func samples(_ file:AVAudioFile)throws->Data {
        let rate = file.processingFormat.sampleRate;let start = file.framePosition
        let frames = AVAudioFrameCount(min(file.length-start,Int64(rate*10)))
        guard let input = AVAudioPCMBuffer(pcmFormat:file.processingFormat,frameCapacity:frames) else {throw failure("无法分配录音缓冲")}
        try file.read(into:input,frameCount:frames)
        guard let channels = input.floatChannelData,let monoFormat = AVAudioFormat(standardFormatWithSampleRate:rate,channels:1),let mono = AVAudioPCMBuffer(pcmFormat:monoFormat,frameCapacity:input.frameLength),let monoData = mono.floatChannelData else {throw failure("无法读取录音采样")}
        mono.frameLength = input.frameLength
        for i in 0..<Int(input.frameLength) {var value:Float = 0;for c in 0..<Int(input.format.channelCount){value += channels[c][i]};monoData[0][i] = value/Float(input.format.channelCount)}
        if file.framePosition<file.length {
            let window = max(1,Int(rate*0.12));var quiet:Float = .greatestFiniteMagnitude;var cut = Int(input.frameLength)
            for i in stride(from:Int(rate*7),to:Int(input.frameLength)-window,by:window) {
                var energy:Float = 0;for j in i..<(i+window) {energy += monoData[0][j]*monoData[0][j]};energy /= Float(window)
                if energy<quiet {quiet = energy;cut = i+window/2}
            }
            if quiet<0.0001 {mono.frameLength = AVAudioFrameCount(cut);file.framePosition = start+Int64(cut)}
        }
        guard let target = AVAudioFormat(standardFormatWithSampleRate:16000,channels:1),let converter = AVAudioConverter(from:monoFormat,to:target),let output = AVAudioPCMBuffer(pcmFormat:target,frameCapacity:160100) else {throw failure("无法创建音频转换器")}
        var supplied = false;var error:NSError?
        let status = converter.convert(to:output,error:&error){_,state in if supplied {state.pointee = .endOfStream;return nil};supplied = true;state.pointee = .haveData;return mono}
        if let error = error {throw error};guard status != .error,output.frameLength>0,let data = output.floatChannelData else {throw failure("录音转换失败")}
        return Data(bytes:data[0],count:Int(output.frameLength)*MemoryLayout<Float>.size)
    }
}
