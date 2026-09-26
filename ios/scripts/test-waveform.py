#!/usr/bin/env python3
"""Exercise the production PCM decoder with silence, stereo peaks and invalid audio."""
import pathlib, tempfile, subprocess
root = pathlib.Path(__file__).resolve().parents[1]
source = (root/'SayAgain/Waveform.swift').read_text()
method = source[source.index('    static func read('):source.index('    override func draw(')]
test = r'''
import Foundation
import AVFoundation
enum Decoder {
METHOD
}
let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
defer {try? FileManager.default.removeItem(at:folder)}
let format = AVAudioFormat(standardFormatWithSampleRate:24000,channels:2)!
func file(_ name:String,silent:Bool)throws->URL {
 let url = folder.appendingPathComponent(name + ".caf")
 let buffer = AVAudioPCMBuffer(pcmFormat:format,frameCapacity:24000)!
 buffer.frameLength = 24000
 for channel in 0..<2 {for frame in 0..<24000 {buffer.floatChannelData![channel][frame] = 0}}
 if !silent {buffer.floatChannelData![1][18000] = -0.8;buffer.floatChannelData![0][2500] = 0.4}
 let file = try AVAudioFile(forWriting:url,settings:format.settings)
 try file.write(from:buffer);return url
}
let silence = try Decoder.read(file("silence",silent:true))
assert(silence.count == 96 && silence.allSatisfy {$0 == 0})
let peaks = try Decoder.read(file("stereo",silent:false))
assert(peaks.count == 96 && peaks[72] == 1 && abs(peaks[10]-0.5)<0.001)
assert(peaks.enumerated().filter {$0.element > 0}.map {$0.offset} == [10,72])
do {_ = try Decoder.read(folder.appendingPathComponent("missing.wav"));fatalError("Missing file should fail")}catch{}
print("PASS: real PCM bins, second-channel peak, normalization, silence and missing-file failure")
'''.replace('METHOD',method)
with tempfile.TemporaryDirectory() as folder:
 p = pathlib.Path(folder)/'test.swift';p.write_text(test)
 subprocess.run(['swift','-swift-version','5',str(p)],check=True)
