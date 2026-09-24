const fs=require('node:fs'),path=require('node:path');
function createSecrets(directory,safeStorage){
 const filename=path.join(directory,'qianwen-api-key.enc');
 function available(){return safeStorage.isEncryptionAvailable() && (!safeStorage.getSelectedStorageBackend || safeStorage.getSelectedStorageBackend()!=='basic_text');}
 return{
  has:()=>fs.existsSync(filename),
  get(){if(!available())throw new Error('系统加密存储不可用，请检查系统钥匙串');if(!fs.existsSync(filename))throw new Error('请先配置千问AI平台 API Key');return safeStorage.decryptString(fs.readFileSync(filename));},
  set(key){if(!available())throw new Error('系统加密存储不可用，未保存 API Key');if(typeof key!=='string'||key.length<10||key.length>1024||/\s/.test(key))throw new Error('API Key 格式不正确');const temp=filename+'.tmp';fs.writeFileSync(temp,safeStorage.encryptString(key),{mode:0o600});fs.renameSync(temp,filename);},
  clear(){if(fs.existsSync(filename))fs.unlinkSync(filename);},
 };
}
module.exports={createSecrets};
