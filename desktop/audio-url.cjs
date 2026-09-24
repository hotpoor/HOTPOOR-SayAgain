function normalizeAudioUrl(value){
 let url;try{url=new URL(value);}catch{throw new Error('云端未返回有效的音频地址');}
 const trusted=['maas.qianwenaiapi.com','qianwenai.com','aliyuncs.com'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host));
 if(!trusted||url.username||url.password||url.port||!['http:','https:'].includes(url.protocol))throw new Error(`云端音频地址暂不支持：${url.protocol}//${url.hostname}。请反馈此域名。`);
 // Official Qwen responses may contain HTTP OSS URLs. Keep the signed query
 // intact and use HTTPS to download from the same trusted host.
 if(url.protocol==='http:'){
  if(!url.hostname.endsWith('.aliyuncs.com'))throw new Error(`云端音频地址需要 HTTPS：${url.hostname}`);
  url.protocol='https:';
 }
 return url.href;
}
module.exports={normalizeAudioUrl};
