import UIKit

final class QwenAccountSettingsVC: FormVC {
    override func viewDidLoad(){super.viewDidLoad();title = "千问账号配置";do{try QwenAccounts.shared.migratePreviousKeys()}catch{inform(error.localizedDescription)};reload()}
    override func viewWillAppear(_ animated:Bool){super.viewWillAppear(animated);if isViewLoaded {reload()}}
    func reload(){for child in stack.arrangedSubviews {stack.removeArrangedSubview(child);child.removeFromSuperview()}
        label("管理千问AI平台账号的 API Key，可添加个人、工作等多个账号。Key 只保存在此 iPad 钥匙串，不写入资料备份。")
        label("此页只保存账号，不调用 API。在回顾详情点击「生成语音 · 千问」，使用当前账号合成并保存本地语音。")
        do{let d = try QwenAccounts.shared.read()
            if d.keys.isEmpty {label("尚未添加千问账号")}
            for row in d.keys {label(row.name + (row.id == d.active ? " · 当前账号" : "") + "\nAPI Key 已保存")
                action("设为当前：" + row.name){[weak self] in do{var value = try QwenAccounts.shared.read();value.active = row.id;try QwenAccounts.shared.write(value);self?.reload()}catch{self?.inform(error.localizedDescription)}}
                action("编辑：" + row.name){[weak self] in self?.navigationController?.pushViewController(QwenAccountEditorVC(row:row),animated:true)}
                action("删除：" + row.name){[weak self] in guard let self = self else {return};let a = UIAlertController(title:"删除这个千问账号？",message:"仅删除此 iPad 保存的账号配置，其他账号会保留。",preferredStyle:.alert);a.addAction(UIAlertAction(title:"取消",style:.cancel));a.addAction(UIAlertAction(title:"删除",style:.destructive){_ in do{var value = try QwenAccounts.shared.read();value.keys.removeAll {$0.id == row.id};if value.active == row.id {value.active = nil};try QwenAccounts.shared.write(value);self.reload()}catch{self.inform(error.localizedDescription)}});self.present(a,animated:true)}
            }
            action("＋ 添加千问账号"){[weak self] in self?.navigationController?.pushViewController(QwenAccountEditorVC(row:nil),animated:true)}
        }catch{label(error.localizedDescription)}
    }
}
final class QwenAccountEditorVC: FormVC {
    let row:QwenAccount?;let key = UITextField()
    init(row:QwenAccount?){self.row = row;super.init(nibName:nil,bundle:nil)}
    required init?(coder:NSCoder){fatalError()}
    override func viewDidLoad(){super.viewDidLoad();title = row == nil ? "添加千问账号" : "编辑千问账号"
        field("qwen-account-name","账号名称，例如个人、工作",row?.name ?? "",height:52)
        label("千问AI平台 API Key（AK）" + (row == nil ? "" : " · 留空保留"));key.isSecureTextEntry = true;key.accessibilityIdentifier = "qwen-account-key";key.autocapitalizationType = .none;key.autocorrectionType = .no;key.borderStyle = .roundedRect;key.heightAnchor.constraint(equalToConstant:48).isActive = true;stack.addArrangedSubview(key)
        label("只需填写账号名称与 API Key，无需填写模型、接口类型或应用名称。")
        button("保存账号",#selector(saveAccount))
    }
    @objc func saveAccount(){do{var d = try QwenAccounts.shared.read();var value = row ?? QwenAccount(name:"",key:"");value.name = self.value("qwen-account-name").trimmingCharacters(in:.whitespacesAndNewlines);let input = (key.text ?? "").trimmingCharacters(in:.whitespacesAndNewlines);if !input.isEmpty {value.key = input};if let i = d.keys.firstIndex(where:{$0.id == value.id}) {d.keys[i] = value}else{d.keys.append(value)};if d.active == nil {d.active = value.id};try QwenAccounts.shared.write(d);navigationController?.popViewController(animated:true)}catch{inform(error.localizedDescription)}}
}
