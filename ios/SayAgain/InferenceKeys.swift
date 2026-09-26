import UIKit
import Security

struct InferenceKey: Codable {
    var id = UUID().uuidString
    var name:String
    var key:String
    var enabled = true
    var organizationId = ""
    var managerId = ""
    var models:[String] = []
}
struct InferenceKeyDocument: Codable {
    var managers:[InferenceKey] = []
    var usages:[InferenceKey] = []
    var active:String?
    var legacyImported = false
}
final class InferenceKeys: NSObject, URLSessionTaskDelegate {
    static let shared = InferenceKeys()
    private lazy var session = URLSession(configuration:.ephemeral,delegate:self,delegateQueue:nil)
    private let query:[String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"SayAgain.InferenceKeys",kSecAttrAccount as String:"profiles"]
    private(set) var busy = false
    func read()throws->InferenceKeyDocument {
        var q = query;q[kSecReturnData as String] = true;var result:CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary,&result)
        if status == errSecItemNotFound {return InferenceKeyDocument()}
        guard status == errSecSuccess,let bytes = result as? Data else {throw failure("无法读取 AK 钥匙串")}
        return try JSONDecoder().decode(InferenceKeyDocument.self,from:bytes)
    }
    private func write(_ document:InferenceKeyDocument)throws {
        let bytes = try JSONEncoder().encode(document);var add = query;add[kSecValueData as String] = bytes;add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary,nil)
        if status == errSecDuplicateItem {guard SecItemUpdate(query as CFDictionary,[kSecValueData as String:bytes] as CFDictionary) == errSecSuccess else {throw failure("AK 保存失败")}}
        else if status != errSecSuccess {throw failure("AK 保存失败")}
    }
    func migrate(_ key:String?)throws {guard !busy else {throw failure("正在更新 AK，请稍后")};guard let key = key,!key.isEmpty else {return};var d = try read();guard !d.legacyImported else {return};if !d.usages.contains(where:{$0.key == key}) {var p = InferenceKey(name:"旧使用 AK · 待绑定",key:key);p.enabled = false;d.usages.append(p)};d.legacyImported = true;try write(d)}
    func credentials(_ id:String?)throws->(InferenceKey,InferenceKey) {
        let d = try read();guard let usage = d.usages.first(where:{$0.id == (id?.isEmpty == false ? id : d.active)}),usage.enabled else {throw failure("请选择已启用的使用 AK")}
        guard let manager = d.managers.first(where:{$0.id == usage.managerId}),manager.enabled else {throw failure("使用 AK 尚未匹配已启用的管理 AK")}
        guard !usage.key.hasPrefix("sk-mgmt-") else {throw failure("管理 AK 不能用于生成")};return (usage,manager)
    }
    func request(_ key:String,_ route:String,done:@escaping(Result<[String:Any],Error>)->Void) {
        var request = URLRequest(url:URL(string:"https://model.service-inference.ai" + route)!);request.timeoutInterval = 20;request.setValue("Bearer " + key,forHTTPHeaderField:"Authorization")
        session.dataTask(with:request){data,response,error in
            let result:Result<[String:Any],Error> = Result {if let error = error {throw error};guard let http = response as? HTTPURLResponse else {throw failure("服务响应无效")};guard http.statusCode == 200 else {throw failure("service-inference HTTP \(http.statusCode)")};guard let data = data,data.count <= 2*1024*1024,let value = try JSONSerialization.jsonObject(with:data) as? [String:Any],value["error"] == nil else {throw failure("服务返回格式无效")};return value}
            DispatchQueue.main.async {done(result)}
        }.resume()
    }
    func save(management:Bool,id:String?,name:String,key:String,managerId:String,done:@escaping(Result<Void,Error>)->Void) {
        guard !busy else {done(.failure(failure("正在更新 AK，请稍后")));return}
        do {
            var d = try read();let rows = management ? d.managers : d.usages;let old = rows.first {$0.id == id}
            let name = name.trimmingCharacters(in:.whitespacesAndNewlines),key = key.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty ? old?.key ?? "" : key.trimmingCharacters(in:.whitespacesAndNewlines)
            guard !name.isEmpty,name.count<=80 else {throw failure("名称需为 1–80 个字符")}
            guard key.count>=8,key.count<=4096,!key.contains(where:{$0.isWhitespace}),management ? key.hasPrefix("sk-mgmt-v1-") : !key.hasPrefix("sk-mgmt-") else {throw failure(management ? "请填写管理 AK（sk-mgmt-v1-…）" : "请填写使用 AK，不能填写管理 AK")}
            guard !rows.contains(where:{$0.id != id && $0.key == key}) else {throw failure("此 AK 已保存，请编辑已有配置")}
            guard old != nil || rows.count<30 else {throw failure("每类最多保存 30 个 AK")}
            if !management {guard d.managers.contains(where:{$0.id == managerId && $0.enabled}) else {throw failure("请选择已启用的管理 AK 进行匹配")}}
            var p = old ?? InferenceKey(name:name,key:key);p.name = name;p.key = key;p.enabled = true
            busy = true
            request(key,management ? "/manage/whoami" : "/v1/models"){result in
                defer {self.busy = false}
                done(Result {
                    let value = try result.get()
                    if management {
                        guard let org = value["organizationId"] as? String,!org.isEmpty,org.count<=200 else {throw failure("管理 API 未返回有效组织 ID")}
                        if let old = old,!old.organizationId.isEmpty,old.organizationId != org,d.usages.contains(where:{$0.managerId == old.id}) {throw failure("已绑定的管理 AK 不能更换组织，请新增后改绑")}
                        p.organizationId = org
                        if let index = d.managers.firstIndex(where:{$0.id == p.id}) {d.managers[index] = p}else{d.managers.append(p)}
                    } else {
                        guard let models = value["data"] as? [[String:Any]] else {throw failure("模型列表格式无效")}
                        p.models = Array(models.compactMap {$0["id"] as? String}.filter {$0.count<=160}.prefix(500));p.managerId = managerId
                        if let index = d.usages.firstIndex(where:{$0.id == p.id}) {d.usages[index] = p}else{d.usages.append(p)};d.active = p.id
                    }
                    try self.write(d)
                })
            }
        } catch {done(.failure(error))}
    }
    func delete(management:Bool,id:String)throws {
        guard !busy else {throw failure("正在更新 AK，请稍后")};var d = try read()
        if management {guard !d.usages.contains(where:{$0.managerId == id}) else {throw failure("管理 AK 仍绑定使用 AK，请先改绑或删除使用 AK")};d.managers.removeAll {$0.id == id}}
        else {d.usages.removeAll {$0.id == id};if d.active == id {d.active = nil}}
        try write(d)
    }
    func select(_ id:String)throws {guard !busy else {throw failure("正在更新 AK，请稍后")};_ = try credentials(id);var d = try read();d.active = id;try write(d)}
    func enabled(management:Bool,item:InferenceKey,done:@escaping(Result<Void,Error>)->Void) {
        if !item.enabled {save(management:management,id:item.id,name:item.name,key:"",managerId:item.managerId,done:done);return}
        done(Result {guard !busy else {throw failure("正在更新 AK，请稍后")};var d = try read();if management {if let i = d.managers.firstIndex(where:{$0.id == item.id}) {d.managers[i].enabled = false}}
        else {if let i = d.usages.firstIndex(where:{$0.id == item.id}) {d.usages[i].enabled = false};if d.active == item.id {d.active = nil}};try write(d)})
    }
    func report(_ id:String,done:@escaping(Result<String,Error>)->Void) {
        do {let (usage,manager) = try credentials(id);request(manager.key,"/manage/cost/summary?period=30d"){result in done(result.flatMap {value in Result {guard let total = value["totalCostUsd"],total is String || total is NSNumber else {throw failure("费用汇总格式无效")};return "使用 AK：\(usage.name)\n管理 AK：\(manager.name)\n组织：\(manager.organizationId)\n最近30天组织总费用：USD \(total)\n此为组织汇总，不是此使用 AK 的单独费用。"}})}}catch{done(.failure(error))}
    }
    func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest request:URLRequest,completionHandler:@escaping(URLRequest?)->Void) {completionHandler(nil)}
}
final class InferenceActionButton:UIButton {
    var run:(()->Void)?
    @objc func invoke(){run?()}
}
extension FormVC {
    func action(_ title:String,_ run:@escaping()->Void) {
        let b = InferenceActionButton(type:.system);b.setTitle(title,for:.normal);b.titleLabel?.font = .systemFont(ofSize:15);b.titleLabel?.numberOfLines = 0;b.contentEdgeInsets = UIEdgeInsets(top:12,left:12,bottom:12,right:12);b.layer.borderWidth = 1;b.layer.borderColor = UIColor(white:0.88,alpha:1).cgColor;b.layer.cornerRadius = 8;b.heightAnchor.constraint(greaterThanOrEqualToConstant:44).isActive = true;b.run = run;b.addTarget(b,action:#selector(InferenceActionButton.invoke),for:.touchUpInside);stack.addArrangedSubview(b)
    }
}
final class InferenceKeysVC:FormVC {
    override func viewDidLoad(){super.viewDidLoad();title = "管理 AK 与使用 AK"}
    override func viewWillAppear(_ animated:Bool){super.viewWillAppear(animated);reload()}
    func reload() {
        stack.arrangedSubviews.forEach {stack.removeArrangedSubview($0);$0.removeFromSuperview()}
        do {let d = try InferenceKeys.shared.read();label("先验证管理 AK 的组织，再为使用 AK 选择匹配的管理 AK。管理 AK 不会用于生成。")
            for management in [true,false] {
                label(management ? "管理 AK" : "使用 AK")
                for p in management ? d.managers : d.usages {
                    label(p.name + (p.enabled ? " · 已启用" : " · 已停用") + (d.active == p.id ? " · 默认使用" : ""))
                    label(management ? "组织：" + p.organizationId : "匹配：" + (d.managers.first {$0.id == p.managerId}?.name ?? "待绑定") + " · \(p.models.count) 个模型")
                    action("编辑 " + p.name){[weak self] in self?.navigationController?.pushViewController(InferenceKeyEditorVC(management:management,item:p),animated:true)}
                    action(p.enabled ? "停用 " + p.name : "启用 " + p.name){[weak self] in InferenceKeys.shared.enabled(management:management,item:p){result in do{try result.get();self?.reload()}catch{self?.inform(error.localizedDescription)}}}
                    if !management {
                        action("默认使用 " + p.name){[weak self] in do{try InferenceKeys.shared.select(p.id);self?.reload()}catch{self?.inform(error.localizedDescription)}}
                        action("查询绑定组织费用 · " + p.name){[weak self] in InferenceKeys.shared.report(p.id){result in do{self?.inform(try result.get())}catch{self?.inform(error.localizedDescription)}}}
                    }
                    action("删除 " + p.name){[weak self] in guard let self = self else {return};let a = UIAlertController(title:"删除此 AK？",message:p.name,preferredStyle:.alert);a.addAction(UIAlertAction(title:"取消",style:.cancel));a.addAction(UIAlertAction(title:"删除",style:.destructive){_ in do{try InferenceKeys.shared.delete(management:management,id:p.id);self.reload()}catch{self.inform(error.localizedDescription)}});self.present(a,animated:true)}
                }
                action(management ? "＋ 添加管理 AK" : "＋ 添加使用 AK"){[weak self] in self?.navigationController?.pushViewController(InferenceKeyEditorVC(management:management,item:nil),animated:true)}
            }
        }catch{label(error.localizedDescription)}
    }
}
final class InferenceKeyEditorVC:FormVC {
    let management:Bool;let item:InferenceKey?;var managerId:String;let key = UITextField();let binding = UILabel();var saving = false
    init(management:Bool,item:InferenceKey?){self.management = management;self.item = item;managerId = item?.managerId ?? "";super.init(nibName:nil,bundle:nil)}
    required init?(coder:NSCoder){fatalError()}
    override func viewDidLoad(){super.viewDidLoad();title = management ? "管理 AK" : "使用 AK 匹配"
        field("ak-name","名称",item?.name ?? "",height:52);label(management ? "管理 AK（sk-mgmt-v1-…）" : "使用 AK · 不能填写管理 AK")
        key.isSecureTextEntry = true;key.autocapitalizationType = .none;key.autocorrectionType = .no;key.borderStyle = .roundedRect;key.heightAnchor.constraint(equalToConstant:48).isActive = true;key.placeholder = item == nil ? "输入完整 AK" : "已保存，留空保留";key.accessibilityIdentifier = "inference-ak-secret";stack.addArrangedSubview(key)
        if !management {binding.numberOfLines = 0;binding.font = .systemFont(ofSize:14);stack.addArrangedSubview(binding);showBinding();button("选择匹配的管理 AK",#selector(choose));label("请选择属于此使用 AK 的管理组织。此处为手动匹配，不代表服务自动验证了两者归属。")}
        button("验证并保存 AK",#selector(save));label(management ? "保存时验证 /manage/whoami，读取组织 ID。" : "保存时用使用 AK 读取模型列表；不调用生成。")
    }
    func showBinding(){binding.text = "匹配管理 AK：" + ((try? InferenceKeys.shared.read().managers.first {$0.id == managerId}?.name) ?? "请选择")}
    @objc func choose(){do{let rows = try InferenceKeys.shared.read().managers.filter {$0.enabled};guard !rows.isEmpty else {inform("请先添加并启用管理 AK");return};let a = UIAlertController(title:"匹配管理 AK",message:nil,preferredStyle:.actionSheet);for p in rows {a.addAction(UIAlertAction(title:p.name + " · " + p.organizationId,style:.default){_ in self.managerId = p.id;self.showBinding()})};a.addAction(UIAlertAction(title:"取消",style:.cancel));a.popoverPresentationController?.sourceView = view;a.popoverPresentationController?.sourceRect = CGRect(x:view.bounds.midX,y:view.bounds.midY,width:1,height:1);present(a,animated:true)}catch{inform(error.localizedDescription)}}
    @objc func save(){guard !saving else {return};saving = true;InferenceKeys.shared.save(management:management,id:item?.id,name:value("ak-name"),key:key.text ?? "",managerId:managerId){[weak self] result in guard let self = self else {return};self.saving = false;do{try result.get();self.navigationController?.popViewController(animated:true)}catch{self.inform(error.localizedDescription)}}}
}
