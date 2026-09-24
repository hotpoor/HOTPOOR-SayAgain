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
 const filename=path.join(directory,'qianwen-api-key.secret');
 const legacy=path.join(directory,'qianwen-api-key.enc');
 function read(){
  if(!fs.existsSync(filename))throw new Error(fs.existsSync(legacy)?'旧版 AK 使用加密存储，请重新粘贴并保存一次，之后将使用本地明文保存。':'请先配置千问AI平台 API Key');
  return normalizeKey(fs.readFileSync(filename,'utf8'));
 }
 function status(){const present=fs.existsSync(filename)||fs.existsSync(legacy);if(!present)return{present:false,usable:false,error:null};try{read();return{present:true,usable:true,error:null};}catch(error){return{present:true,usable:false,error:error.message};}}
 return{
  has:()=>status().usable,status,get:read,
  set(key){
   key=normalizeKey(key);
   const temp=filename+'.tmp';
   try{fs.writeFileSync(temp,key,{mode:0o600});fs.chmodSync(temp,0o600);const fd=fs.openSync(temp,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,filename);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  },
  clear(){for(const file of [filename,legacy])if(fs.existsSync(file))fs.unlinkSync(file);},
 };
}
module.exports={createSecrets,normalizeKey};
