import Foundation
import Security

final class API: NSObject, URLSessionTaskDelegate {
    static let shared = API()
    private lazy var session = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: nil)
    var base: String { UserDefaults.standard.string(forKey: "apiBase") ?? "" }
    func token() -> String {
        let q: [String: Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"SayAgain.Companion",kSecAttrAccount as String:"token",kSecReturnData as String:true]
        var result: CFTypeRef?; guard SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess, let data = result as? Data else {return ""}
        return String(data:data, encoding:.utf8) ?? ""
    }
    func configure(base: String, token: String) throws {
        let cleaned = base.trimmingCharacters(in:.whitespacesAndNewlines).trimmingCharacters(in:CharacterSet(charactersIn:"/"))
        if !cleaned.isEmpty { _ = try endpoint(cleaned) }
        let q: [String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"SayAgain.Companion",kSecAttrAccount as String:"token"]
        if !token.isEmpty {
            var values = q; values[kSecValueData as String] = Data(token.utf8); values[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            let status = SecItemAdd(values as CFDictionary,nil)
            if status == errSecDuplicateItem {
                let result = SecItemUpdate(q as CFDictionary,[kSecValueData as String:Data(token.utf8)] as CFDictionary)
                guard result == errSecSuccess else {throw failure("钥匙串保存失败：\(result)")}
            } else if status != errSecSuccess {throw failure("钥匙串保存失败：\(status)")}
        } else if cleaned != self.base { SecItemDelete(q as CFDictionary) }
        UserDefaults.standard.set(cleaned,forKey:"apiBase")
    }
    private func endpoint(_ value: String) throws -> URL {
        guard let u = URL(string:value), let host = u.host, u.user == nil, u.password == nil, u.query == nil, u.fragment == nil, u.path.isEmpty || u.path == "/" else {throw failure("填写 API 根地址，例如 http://192.168.100.10:8765")}
        let parts = host.split(separator:".").compactMap {Int($0)}
        let lan = parts.count == 4 && parts.allSatisfy {0...255 ~= $0} && (parts[0] == 10 || (parts[0] == 192 && parts[1] == 168) || (parts[0] == 172 && 16...31 ~= parts[1]))
        guard u.scheme == "https" || (u.scheme == "http" && (lan || host == "localhost" || host == "127.0.0.1" || host.hasSuffix(".local"))) else {throw failure("公网 API 必须使用 HTTPS；HTTP 仅限可信局域网")}
        return u
    }
    @discardableResult func call(_ path: String, body: [String:Any]? = nil, done: @escaping (Result<[String:Any],Error>)->Void) -> URLSessionDataTask? {
        do {
            let url = try endpoint(base).appendingPathComponent("v1/" + path)
            guard !token().isEmpty else {throw failure("请在设置中填写连接令牌")}
            var request = URLRequest(url:url); request.timeoutInterval = path == "capabilities" ? 15 : 600
            request.setValue("Bearer " + token(), forHTTPHeaderField:"Authorization")
            if let body = body {request.httpMethod = "POST"; request.setValue("application/json",forHTTPHeaderField:"Content-Type"); request.httpBody = try JSONSerialization.data(withJSONObject:body)}
            let task = session.dataTask(with:request) {data,response,error in
                let result: Result<[String:Any],Error>
                do {
                    if let error = error {
                        let networkError = error as NSError
                        if networkError.domain == NSURLErrorDomain {
                            switch networkError.code {
                            case NSURLErrorNotConnectedToInternet:
                                throw failure("iPad 当前无法使用网络。请连接与电脑同一局域网的 Wi-Fi，并检查系统是否允许 SayAgain 使用网络。")
                            case NSURLErrorCannotConnectToHost, NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed:
                                throw failure("无法连接电脑服务。请检查 API 地址、电脑端服务是否启动，以及 iPad 与电脑是否处于同一局域网。")
                            case NSURLErrorTimedOut:
                                throw failure("请求超时。请检查网络和电脑端服务；处理长录音时可缩短录音后重试。")
                            case NSURLErrorNetworkConnectionLost:
                                throw failure("连接已中断。请确认 Wi-Fi 稳定且电脑未休眠，然后重试。")
                            case NSURLErrorCancelled:
                                throw failure("请求已取消。")
                            default: break
                            }
                        }
                        throw error
                    }
                    guard let data = data, data.count <= 35 * 1024 * 1024, let http = response as? HTTPURLResponse else {throw failure("API 响应无效")}
                    guard let value = try JSONSerialization.jsonObject(with:data) as? [String:Any] else {throw failure("API 返回格式无效")}
                    guard http.statusCode == 200 else {throw failure(value["error"] as? String ?? "API HTTP \(http.statusCode)")}
                    result = .success(value)
                } catch {result = .failure(error)}
                DispatchQueue.main.async {done(result)}
            }; task.resume(); return task
        } catch {done(.failure(error)); return nil}
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?)->Void) {completionHandler(nil)}
}
