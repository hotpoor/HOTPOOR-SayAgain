const fs=require('node:fs'),path=require('node:path');
function createSecrets(directory){
 const filename=path.join(directory,'qianwen-api-key.secret');
 const legacy=path.join(directory,'qianwen-api-key.enc');
 function read(){
  if(!fs.existsSync(filename))throw new Error(fs.existsSync(legacy)?'旧版 AK 使用加密存储，请重新粘贴并保存一次，之后将使用本地明文保存。':'请先配置千问AI平台 API Key');
  const key=fs.readFileSync(filename,'utf8').trim();
  if(key.length<10||key.length>1024||/\s/.test(key))throw new Error('本地 AK 文件内容无效，请重新填写并保存');
  return key;
 }
 function status(){const present=fs.existsSync(filename)||fs.existsSync(legacy);if(!present)return{present:false,usable:false,error:null};try{read();return{present:true,usable:true,error:null};}catch(error){return{present:true,usable:false,error:error.message};}}
 return{
  has:()=>status().usable,status,get:read,
  set(key){
   if(typeof key!=='string'||key.length<10||key.length>1024||/\s/.test(key))throw new Error('API Key 格式不正确');
   const temp=filename+'.tmp';
   try{fs.writeFileSync(temp,key,{mode:0o600});fs.chmodSync(temp,0o600);const fd=fs.openSync(temp,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,filename);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  },
  clear(){for(const file of [filename,legacy])if(fs.existsSync(file))fs.unlinkSync(file);},
 };
}
module.exports={createSecrets};
