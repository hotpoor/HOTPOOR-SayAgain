const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {normalizeAudioUrl}=require('./audio-url.cjs');
async function uploadReference(speech,filename,key,signal,model='voice-enrollment'){
 const response=await speech.fetch('https://maas.qianwenaiapi.com/api/v1/uploads?action=getPolicy&model='+encodeURIComponent(model),{headers:{Authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(60000)])});
 if(!response.ok)throw new Error(`参考录音上传凭证获取失败 (${response.status})`);
 const policy=JSON.parse((await speech.readLimited(response,1024*1024)).toString()).data;
 if(!policy||typeof policy.upload_dir!=='string'||!policy.upload_dir||/[\r\n]/.test(policy.upload_dir))throw new Error('参考录音上传凭证不完整');
 const url=normalizeAudioUrl(policy.upload_host);if(!new URL(url).hostname.endsWith('.aliyuncs.com'))throw new Error('参考录音上传地址无效');
 const name=`${randomUUID()}.wav`,objectKey=policy.upload_dir.replace(/\/$/,'')+'/'+name;
 const form=new FormData();
 for(const [field,property] of Object.entries({OSSAccessKeyId:'oss_access_key_id',Signature:'signature',policy:'policy','x-oss-object-acl':'x_oss_object_acl','x-oss-forbid-overwrite':'x_oss_forbid_overwrite'})){
  if(typeof policy[property]!=='string')throw new Error('参考录音上传凭证不完整');form.append(field,policy[property]);
 }
 form.append('key',objectKey);form.append('success_action_status','200');form.append('file',new Blob([fs.readFileSync(filename)],{type:'audio/wav'}),name);
 const uploaded=await speech.fetch(url,{method:'POST',body:form,redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(120000)])});
 if(!uploaded.ok)throw new Error(`参考录音上传失败 (${uploaded.status})`);await uploaded.body?.cancel();
 return 'oss://'+objectKey;
}
module.exports={uploadReference};
