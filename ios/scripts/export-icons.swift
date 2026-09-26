// iOS build asset export: composite the unchanged approved logo on an opaque white canvas.
// iOS applies its own corner mask; never ship desktop icon transparency as an AppIcon.
import AppKit
import ImageIO
let root = URL(fileURLWithPath:CommandLine.arguments[1])
let original = root.appendingPathComponent("renderer/assets/sayagain-icon.png")
guard let source = CGImageSourceCreateWithURL(original as CFURL,nil), let cg = CGImageSourceCreateImageAtIndex(source,0,nil) else {fatalError("Missing approved logo")}
let folder = root.appendingPathComponent("ios/SayAgain/Assets.xcassets/AppIcon.appiconset")
for size in [20,29,40,58,60,76,80,87,120,152,167,180,1024] {
    let cs = CGColorSpaceCreateDeviceRGB()
    let ctx = CGContext(data:nil,width:size,height:size,bitsPerComponent:8,bytesPerRow:0,space:cs,bitmapInfo:CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.setFillColor(CGColor(red:1,green:1,blue:1,alpha:1));ctx.fill(CGRect(x:0,y:0,width:size,height:size))
    ctx.interpolationQuality = .high;ctx.draw(cg,in:CGRect(x:0,y:0,width:size,height:size))
    let url = folder.appendingPathComponent("icon-\(size).png")
    let out = CGImageDestinationCreateWithURL(url as CFURL,"public.png" as CFString,1,nil)!
    CGImageDestinationAddImage(out,ctx.makeImage()!,nil);assert(CGImageDestinationFinalize(out))
}
print("Exported opaque iOS AppIcons from the unchanged official logo")
