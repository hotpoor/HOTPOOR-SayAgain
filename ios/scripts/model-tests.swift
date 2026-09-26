import Foundation
let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
defer {try? FileManager.default.removeItem(at:root)}
let s = LibraryStore(root:root)
var entry = Entry(kind:"expression",fields:["original":"test","improved":"a test"])
try s.save(entry)
entry.favorite = true; try s.save(entry)
let reopened = LibraryStore(root:root)
assert(reopened.library.entries.count == 1 && reopened.library.entries[0].favorite)
let backup = try s.exportData()
let importedBackup = try s.importData(backup); assert(importedBackup == 0)
let desktop = Data("[{\"type\":\"expression\",\"id\":\"sample\",\"original\":\"hello\",\"improved\":\"Hello.\"}]".utf8)
let importedDesktop = try s.importData(desktop); assert(importedDesktop == 1)
let importedAgain = try s.importData(desktop); assert(importedAgain == 0)
do {_ = try s.audioURL("../secret"); assertionFailure("traversal accepted")}catch{}
let corruptRoot = root.appendingPathComponent("corrupt")
try FileManager.default.createDirectory(at:corruptRoot,withIntermediateDirectories:true)
try Data("broken".utf8).write(to:corruptRoot.appendingPathComponent("library.json"))
let corrupt = LibraryStore(root:corruptRoot)
do {try corrupt.save(entry); assertionFailure("corrupt data overwritten")}catch{}
print("PASS persistence, backup deduplication, desktop import, traversal rejection, corruption protection")
