import UIKit
import AVFoundation

// Decode real PCM in bounded chunks off the main thread. No decorative/random bars.
final class AudioWaveform: UIControl {
    private(set) var peaks:[Float] = []
    var progress:Double = 0 {didSet {setNeedsDisplay();accessibilityValue = "\(Int(progress * 100))%"}}
    var seek:((Float)->Void)?
    private var source:URL?
    override init(frame:CGRect) {super.init(frame:frame);backgroundColor = .clear;isAccessibilityElement = true;accessibilityLabel = "音频波形";accessibilityIdentifier = "audio-waveform";accessibilityTraits = [.adjustable];heightAnchor.constraint(equalToConstant:64).isActive = true}
    required init?(coder:NSCoder){fatalError()}
    func load(_ url:URL?) {
        guard source != url else {return};source = url;peaks = [];progress = 0;isEnabled = false
        guard let url = url else {return}
        DispatchQueue.global(qos:.utility).async {[weak self] in
            let result = try? Self.read(url)
            DispatchQueue.main.async {guard let self = self,self.source == url else {return};self.peaks = result ?? [];self.isEnabled = !(result?.isEmpty ?? true);self.accessibilityLabel = self.isEnabled ? "音频波形，已加载" : "波形无法读取";self.setNeedsDisplay()}
        }
    }
    static func read(_ url:URL)throws->[Float] {
        let file = try AVAudioFile(forReading:url,commonFormat:.pcmFormatFloat32,interleaved:false)
        guard file.length > 0,let buffer = AVAudioPCMBuffer(pcmFormat:file.processingFormat,frameCapacity:4096) else {return []}
        let count = 96;var result = [Float](repeating:0,count:count);var offset:Int64 = 0
        while offset < file.length {
            try file.read(into:buffer,frameCount:AVAudioFrameCount(min(Int64(4096),file.length-offset)))
            guard buffer.frameLength > 0,let channels = buffer.floatChannelData else {break}
            for frame in 0..<Int(buffer.frameLength) {
                let bin = min(count-1,Int((offset+Int64(frame))*Int64(count)/file.length))
                for channel in 0..<Int(buffer.format.channelCount) {let value = abs(channels[channel][frame]);if value.isFinite {result[bin] = max(result[bin],value)}}
            };offset += Int64(buffer.frameLength)
        }
        let peak = max(result.max() ?? 0,0.0001);return result.map {min(1,$0/peak)}
    }
    override func draw(_ rect:CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else {return}
        let samples = peaks.isEmpty ? [Float](repeating:0,count:96) : peaks
        let step = bounds.width/CGFloat(samples.count);let mid = bounds.midY
        ctx.setLineCap(.round);ctx.setLineWidth(max(1,min(3,step*0.5)))
        for (i,p) in samples.enumerated() {let x = (CGFloat(i)+0.5)*step;let h = max(1,CGFloat(p)*(bounds.height-14)/2);ctx.setStrokeColor((Double(i)/Double(samples.count)<progress ? brand : UIColor(white:0.78,alpha:1)).cgColor);ctx.move(to:CGPoint(x:x,y:mid-h));ctx.addLine(to:CGPoint(x:x,y:mid+h));ctx.strokePath()}
        if !peaks.isEmpty {let x = CGFloat(progress)*bounds.width;ctx.setStrokeColor(brand.cgColor);ctx.setLineWidth(1);ctx.move(to:CGPoint(x:x,y:4));ctx.addLine(to:CGPoint(x:x,y:bounds.height-4));ctx.strokePath()}
    }
    private func move(_ touch:UITouch){guard isEnabled,bounds.width>0 else {return};progress = Double(max(0,min(1,touch.location(in:self).x/bounds.width)));seek?(Float(progress))}
    override func beginTracking(_ touch:UITouch,with event:UIEvent?)->Bool {move(touch);return isEnabled}
    override func continueTracking(_ touch:UITouch,with event:UIEvent?)->Bool {move(touch);return isEnabled}
    override func accessibilityIncrement(){guard isEnabled else{return};progress = min(1,progress+0.05);seek?(Float(progress))}
    override func accessibilityDecrement(){guard isEnabled else{return};progress = max(0,progress-0.05);seek?(Float(progress))}
}
