import Foundation
import Security

struct QwenAccount: Codable {
    var id = UUID().uuidString
    var name:String
    var key:String
}
struct QwenAccountList: Codable {
    var keys:[QwenAccount] = []
    var active:String?
    var importedTextKeys = false
}
final class QwenAccounts: NSObject {
    static let shared = QwenAccounts()
    private let query:[String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"SayAgain.QwenAccounts",kSecAttrAccount as String:"keys"]
    func read()throws->QwenAccountList {
        var q = query;q[kSecReturnData as String] = true;var result:CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary,&result)
        if status == errSecItemNotFound {return QwenAccountList()}
        guard status == errSecSuccess,let data = result as? Data else {throw failure("无法读取千问账号 Key")}
        return try JSONDecoder().decode(QwenAccountList.self,from:data)
    }
    func migratePreviousKeys()throws {
        var d = try read();guard !d.importedTextKeys else {return}
        let q:[String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"SayAgain.TextModel",kSecReturnData as String:true,kSecReturnAttributes as String:true,kSecMatchLimit as String:kSecMatchLimitAll]
        var result:CFTypeRef?;let status = SecItemCopyMatching(q as CFDictionary,&result)
        guard status == errSecSuccess || status == errSecItemNotFound else {throw failure("暂时无法读取旧千问配置")}
        for item in (result as? [[String:Any]]) ?? [] {
            guard let id = item[kSecAttrAccount as String] as? String,TextModelAPI.isQwen(id),let data = item[kSecValueData as String] as? Data,let profile = try? JSONDecoder().decode([String:String].self,from:data),let key = profile["key"],!key.isEmpty,URL(string:profile["url"] ?? "")?.host == "maas.qianwenaiapi.com",!d.keys.contains(where:{$0.key == key}) else {continue}
            let row = QwenAccount(name:profile["name"] ?? "原千问账号",key:key);d.keys.append(row);if d.active == nil {d.active = row.id}
        }
        d.importedTextKeys = true;try write(d)
    }
    func write(_ value:QwenAccountList)throws {
        guard value.keys.count <= 100,Set(value.keys.map {$0.id}).count == value.keys.count,Set(value.keys.map {$0.key}).count == value.keys.count else {throw failure("最多 100 个 Key，请勿重复添加")}
        for row in value.keys {guard !row.name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,row.name.count <= 120,!row.key.isEmpty,row.key.count <= 8192,row.key.unicodeScalars.allSatisfy({33...126 ~= $0.value}),!row.key.hasPrefix("sk-mgmt-") else {throw failure("请填写 Key 名称和完整的千问 API Key，不能使用管理 AK")}}
        guard value.active == nil || value.keys.contains(where:{$0.id == value.active}) else {throw failure("当前账号不存在")}
        let data = try JSONEncoder().encode(value);var add = query;add[kSecValueData as String] = data;add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary,nil)
        if status == errSecDuplicateItem {guard SecItemUpdate(query as CFDictionary,[kSecValueData as String:data] as CFDictionary) == errSecSuccess else {throw failure("账号 Key 保存失败")}}
        else if status != errSecSuccess {throw failure("账号 Key 保存失败")}
    }
}
