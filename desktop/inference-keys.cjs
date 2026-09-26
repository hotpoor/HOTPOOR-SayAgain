const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const BASE='https://model.service-inference.ai';
class InferenceKeys{
 constructor(directory,fetcher=fetch){this.file=path.join(directory,'service-inference-keys.secret');this.fetch=fetcher;this.busy=false;}
 read(){return fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{managers:[],usages:[],active:null};}
 write(data){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(data),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 migrate(key){if(!key)return;const data=this.read();if(data.legacyImported)return;if(!data.usages.some(p=>p.key===key))data.usages.push({id:randomUUID(),name:'旧使用 AK · 待绑定',key,managerId:'',enabled:false,models:[]});data.legacyImported=true;this.write(data);}
 status(){const d=this.read();return{active:d.active,managers:d.managers.map(({key,...p})=>p),usages:d.usages.map(({key,...p})=>p)};}
 validKey(key,management){if(typeof key!=='string'||key.length>4096||key.trim().length<8||/\s/.test(key.trim())||management&&!key.trim().startsWith('sk-mgmt-v1-')||!management&&key.trim().startsWith('sk-mgmt-'))throw Error(management?'请填写管理 AK（sk-mgmt-v1-…）':'请填写使用 AK，不能填写管理 AK');return key.trim();}
 async request(key,route){const response=await this.fetch(BASE+route,{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('service-inference HTTP '+response.status);const value=await response.json();if(!value||typeof value!=='object'||value.error)throw Error('service-inference 响应无效');return value;}
 credentials(id){const d=this.read(),usage=d.usages.find(p=>p.id===(id||d.active));if(!usage||!usage.enabled)throw Error('请先选择并启用使用 AK');const manager=d.managers.find(p=>p.id===usage.managerId);if(!manager||!manager.enabled)throw Error('使用 AK 尚未绑定已启用的管理 AK');this.validKey(usage.key,false);return{usage,manager};}
 async mutate(input){if(this.busy)throw Error('AK 配置正在更新，请稍后');this.busy=true;try{return await this.update(input);}finally{this.busy=false;}}
 async update(input){const d=this.read(),management=input.kind==='manager';if(!['manager','usage'].includes(input.kind))throw Error('AK 类型无效');const list=management?d.managers:d.usages;let item=list.find(p=>p.id===input.id);const action=input.action||'save';
  if(action==='delete'){if(!item)throw Error('AK 不存在');if(management&&d.usages.some(p=>p.managerId===item.id))throw Error('管理 AK 仍绑定使用 AK，请先改绑或删除使用 AK');list.splice(list.indexOf(item),1);if(d.active===item.id)d.active=null;}
  else if(action==='enable'){if(!item||typeof input.enabled!=='boolean')throw Error('启用状态无效');if(input.enabled){if(management){const identity=await this.request(item.key,'/manage/whoami');if(identity.organizationId!==item.organizationId)throw Error('组织已变化，请重新配置管理 AK');}else{const manager=d.managers.find(p=>p.id===item.managerId);if(!manager?.enabled)throw Error('请先绑定已启用的管理 AK');const models=await this.request(item.key,'/v1/models');if(!Array.isArray(models.data))throw Error('模型列表格式无效');item.models=models.data.map(p=>p.id).filter(v=>typeof v==='string'&&v.length<=160);}}item.enabled=input.enabled;if(!management&&!item.enabled&&d.active===item.id)d.active=null;}
  else if(action==='select'){if(management)throw Error('请选择使用 AK');this.credentials(input.id);d.active=input.id;}
  else if(action==='save'){
   if(input.id&&!item)throw Error('AK 不存在');const name=String(input.name||'').trim();if(!name||name.length>80)throw Error('名称需为 1–80 个字符');const key=this.validKey(input.key||item?.key,management);if(list.some(p=>p.id!==item?.id&&p.key===key))throw Error('此 AK 已保存，请编辑已有配置');if(!item&&list.length>=30)throw Error('每类最多保存 30 个 AK');const next={...item,id:item?.id||randomUUID(),name,key,enabled:true,checkedAt:Date.now()};
   if(management){const identity=await this.request(key,'/manage/whoami');if(typeof identity.organizationId!=='string'||!identity.organizationId||identity.organizationId.length>200)throw Error('管理 API 未返回有效组织 ID');if(item?.organizationId&&item.organizationId!==identity.organizationId&&d.usages.some(p=>p.managerId===item.id))throw Error('已绑定的管理 AK 不能更换组织，请新增后改绑');next.organizationId=identity.organizationId;}
   else {const manager=d.managers.find(p=>p.id===input.managerId);if(!manager?.enabled)throw Error('请选择已启用的管理 AK 进行匹配');const models=await this.request(key,'/v1/models');if(!Array.isArray(models.data))throw Error('模型列表格式无效');next.models=models.data.map(p=>p.id).filter(v=>typeof v==='string'&&v.length<=160).slice(0,500);next.managerId=manager.id;}
   if(item)list[list.indexOf(item)]=next;else list.push(next);if(!management)d.active=next.id;
  }else throw Error('未知配置操作');this.write(d);return this.status();
 }
 async report(id){const {manager,usage}=this.credentials(id);const summary=await this.request(manager.key,'/manage/cost/summary?period=30d');if(!['string','number'].includes(typeof summary.totalCostUsd))throw Error('费用汇总格式无效');return{usageName:usage.name,managerName:manager.name,organizationId:manager.organizationId,totalCostUsd:String(summary.totalCostUsd),period:'30d',scope:'organization'};}
}
module.exports={InferenceKeys,BASE};
