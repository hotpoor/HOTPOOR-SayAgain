const fs=require('node:fs'),path=require('node:path');
function normalizeKey(value){
 if(typeof value!=='string')throw new Error('请粘贴一个 Qwen API Key');
 let key=value.replace(/^[\s\u200B-\u200D\u2060\uFEFF]+|[\s\u200B-\u200D\u2060\uFEFF]+$/g,'');
 key=key.replace(/^(?:api[_ -]?key|ak)\s*[:=：]\s*/i,'').replace(/^Bearer\s+/i,'').trim();
 if(key.length>=2&&[['"','"'],["'","'"],['“','”']].some(([a,b])=>key.startsWith(a)&&key.endsWith(b)))key=key.slice(1,-1).trim();
 if(!key)throw new Error('AK 为空，请复制平台上的 API Key');
 if(/\s/.test(key))throw new Error('AK 中含有空格或换行。请只粘贴一个完整 Key，不要包含应用名称或多个 Key。');
 if(/[^\x21-\x7E]/.test(key))throw new Error('AK 中含有中文或不可见字符，请复制平台上的完整 Key');
 if(key.length>8192)throw new Error('粘贴内容过长，请只复制 API Key');
 return key;
}
function createSecrets(directory){
 const filename=path.join(directory,'qianwen-api-keys.secret'),single=path.join(directory,'qianwen-api-key.secret'),legacy=path.join(directory,'qianwen-api-key.enc');
 function list(){
  if(fs.existsSync(filename)){try{const value=JSON.parse(fs.readFileSync(filename,'utf8'));if(value.version!==1||!Array.isArray(value.keys))throw Error();return value;}catch{throw new Error('本地 Key 列表无法读取，请检查密钥文件');}}
  if(fs.existsSync(single))return{version:1,active_id:'legacy',keys:[{id:'legacy',name:'默认 Key',key:normalizeKey(fs.readFileSync(single,'utf8')),created_at:fs.statSync(single).birthtimeMs}]};
  return{version:1,active_id:null,keys:[]};
 }
 function save(input){
  if(!input||!Array.isArray(input.keys)||input.keys.length>100)throw new Error('最多保存 100 个 Key');
  const previous=list(),ids=new Set(),values=new Set();
  const keys=input.keys.map((item,i)=>{if(!item||typeof item.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(item.id)||ids.has(item.id))throw new Error('Key 标识重复或无效');ids.add(item.id);const key=normalizeKey(item.key);if(values.has(key))throw new Error('列表中有重复的 Key，请保留一条');values.add(key);const name=String(item.name||('Key '+(i+1))).trim();if(name.length>120)throw new Error('Key 名称最多 120 字');return{id:item.id,name,key,created_at:previous.keys.find(k=>k.id===item.id)?.created_at||Date.now()};});
  const active_id=keys.length?input.active_id:null;if(keys.length&&!ids.has(active_id))throw new Error('请选择当前使用的 Key');
  const value={version:1,active_id,keys},temp=filename+'.tmp';
  try{fs.writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600});fs.chmodSync(temp,0o600);const fd=fs.openSync(temp,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,filename);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  return value;
 }
 function read(){const value=list(),current=value.keys.find(k=>k.id===value.active_id);if(!current)throw new Error(!fs.existsSync(filename)&&fs.existsSync(legacy)?'旧版 AK 使用加密存储，请重新粘贴并保存一次':'请先添加并选择一个 Qwen API Key');return normalizeKey(current.key);}
 function status(){try{const value=list();if(!value.keys.length){const old=!fs.existsSync(filename)&&fs.existsSync(legacy);return{present:old,usable:false,error:old?'旧版 AK 使用加密存储，请重新粘贴并保存一次':null};}read();return{present:true,usable:true,error:null};}catch(error){return{present:true,usable:false,error:error.message};}}
 return{list,save,has:()=>status().usable,status,get:read,
  set(key){key=normalizeKey(key);const value=list();let item=value.keys.find(k=>k.id===value.active_id);if(item)item.key=key;else{item={id:require('node:crypto').randomUUID(),name:'默认 Key',key};value.keys.push(item);value.active_id=item.id;}save(value);},
  clear(){save({keys:[],active_id:null});for(const file of [single,legacy])if(fs.existsSync(file))fs.unlinkSync(file);},
 };
}
module.exports={createSecrets,normalizeKey};
