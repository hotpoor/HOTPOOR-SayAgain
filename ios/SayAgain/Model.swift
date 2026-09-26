import Foundation

struct Entry: Codable {
    var id = UUID().uuidString
    var kind: String
    var fields: [String: String]
    var created = Date()
    var archived = false
    var favorite = false
    var audio: String?
    subscript(_ key: String) -> String {
        get { fields[key] ?? "" }
        set { fields[key] = newValue }
    }
}
struct Library: Codable { var version = 1; var entries: [Entry] = [] }
struct Transfer: Codable { var library: Library; var audio: [String: Data] }
final class LibraryStore {
    let root: URL
    private(set) var library = Library()
    var loadError: Error?
    init(root: URL) {
        self.root = root
        do {
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            let file = root.appendingPathComponent("library.json")
            if FileManager.default.fileExists(atPath: file.path) {
                let decoded = try JSONDecoder().decode(Library.self, from: Data(contentsOf: file))
                guard decoded.version == 1 else { throw failure("资料版本不支持") }
                library = decoded
            }
        } catch { loadError = error }
    }
    func save(_ entry: Entry) throws {
        guard loadError == nil else { throw failure("资料未能读取，已停止写入以保护原文件") }
        var next = library
        if let i = next.entries.firstIndex(where: {$0.id == entry.id}) { next.entries[i] = entry }
        else { next.entries.insert(entry, at: 0) }
        try commit(next)
    }
    private func commit(_ next: Library) throws {
        try JSONEncoder().encode(next).write(to: root.appendingPathComponent("library.json"), options: .atomic)
        library = next
    }
    func audioURL(_ filename: String) throws -> URL {
        guard filename == (filename as NSString).lastPathComponent, !filename.hasPrefix("."), !filename.isEmpty else { throw failure("无效的音频路径") }
        return root.appendingPathComponent(filename)
    }
    func saveGeneratedAudio(_ bytes:Data,for entry:Entry)throws->Entry {
        guard !bytes.isEmpty,bytes.count <= 25*1024*1024 else {throw failure("合成音频为空或超过 25MB")}
        let ext = bytes.starts(with:Data("RIFF".utf8)) ? "wav" : (bytes.count>8 && String(data:bytes.subdata(in:4..<8),encoding:.ascii) == "ftyp" ? "m4a" : "mp3")
        let name = UUID().uuidString + "." + ext;let file = try audioURL(name)
        try bytes.write(to:file,options:.atomic)
        var next = entry;next.audio = name
        do{try save(next);return next}catch{try? FileManager.default.removeItem(at:file);throw error}
    }
    func exportData() throws -> Data {
        var audio: [String: Data] = [:]; var total = 0
        for e in library.entries {
            if let name = e.audio, audio[name] == nil {
                let data = try Data(contentsOf: audioURL(name)); total += data.count
                guard total <= 40 * 1024 * 1024 else { throw failure("完整备份超过 40MB；请通过文件共享备份应用 Documents 目录") }
                audio[name] = data
            }
        }
        return try JSONEncoder().encode(Transfer(library: library, audio: audio))
    }
    func importData(_ data: Data) throws -> Int {
        guard loadError == nil, data.count <= 60 * 1024 * 1024 else { throw failure("无法导入，文件过大或本地资料读取异常") }
        if let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            guard rows.count <= 10000 else { throw failure("表达记录过多") }
            var next = library; var count = 0
            for row in rows {
                guard row["type"] as? String == "expression", let id = row["id"] as? String, let original = row["original"] as? String, let improved = row["improved"] as? String else { throw failure("请选择桌面端导出的 expressions.json") }
                let stable = "desktop-" + id
                if next.entries.contains(where: {$0.id == stable}) { continue }
                var e = Entry(kind: "expression", fields: ["original": original, "improved": improved]); e.id = stable
                for key in ["translation", "explanation", "category", "pattern"] { e[key] = row[key] as? String ?? "" }
                e.favorite = row["favorite"] as? Bool ?? false; e.archived = row["status"] as? String == "archived"
                next.entries.append(e); count += 1
            }
            try commit(next); return count
        }
        let transfer = try JSONDecoder().decode(Transfer.self, from: data)
        guard transfer.library.version == 1, transfer.library.entries.count <= 10000 else { throw failure("不支持的备份版本或记录过多") }
        var next = library; var count = 0; var created: [URL] = []
        do {
            for var entry in transfer.library.entries where !next.entries.contains(where: {$0.id == entry.id}) {
                guard ["expression", "recording", "person", "voice"].contains(entry.kind) else { throw failure("不支持的记录类型") }
                if let old = entry.audio {
                    _ = try audioURL(old)
                    guard let bytes = transfer.audio[old], bytes.count <= 25 * 1024 * 1024 else { throw failure("备份音频缺失或过大") }
                    let ext = (old as NSString).pathExtension.lowercased()
                    guard ["wav","m4a","mp3","aac","caf"].contains(ext) else { throw failure("音频格式不支持") }
                    let name = UUID().uuidString + "." + ext; let url = try audioURL(name)
                    try bytes.write(to: url, options: .atomic); created.append(url); entry.audio = name
                }
                next.entries.append(entry); count += 1
            }
            try commit(next); return count
        } catch { created.forEach {try? FileManager.default.removeItem(at: $0)}; throw error }
    }
}
func failure(_ message: String) -> NSError { NSError(domain: "SayAgain", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
