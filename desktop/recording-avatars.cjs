const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
function save(directory,value){
 if(!value)return value;
 if(typeof value!=='string')throw Error('头像格式无效');
 if(/^avatar:[a-f0-9]{64}\.(png|jpeg|webp)$/.test(value)){
  if(!fs.existsSync(path.join(directory,'assets',value.replace(':','-'))))throw Error('头像文件不存在');
  return value;
 }
 const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!match||value.length>400000)throw Error('头像需为本地 PNG、JPEG 或 WebP 图片');
 const bytes=Buffer.from(match[2],'base64'),name='avatar-'+createHash('sha256').update(bytes).digest('hex')+'.'+match[1];
 try{fs.writeFileSync(path.join(directory,'assets',name),bytes,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
 return name.replace('avatar-','avatar:');
}
function read(directory,value){
 if(!value||!/^avatar:[a-f0-9]{64}\.(png|jpeg|webp)$/.test(value))return value;
 try{return `data:image/${value.split('.').at(-1)};base64,`+fs.readFileSync(path.join(directory,'assets',value.replace(':','-'))).toString('base64');}catch{return '';}
}
function normalize(directory,body){
 if(body.type==='recording_person')return{...body,avatar:save(directory,body.avatar),avatars:[...new Set((body.avatars||[]).map(v=>save(directory,v)))]};
 if(body.type==='recording')return{...body,speaker_profiles:(body.speaker_profiles||[]).map(p=>({...p,avatar:save(directory,p.avatar),avatar_override:save(directory,p.avatar_override)}))};
 return body;
}
module.exports={save,read,normalize};
