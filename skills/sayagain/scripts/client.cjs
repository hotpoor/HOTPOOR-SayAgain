const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
function connectionFile() {
 if(process.env.SAYAGAIN_CONNECTION_FILE)return process.env.SAYAGAIN_CONNECTION_FILE;
 const base=process.env.SAYAGAIN_DATA_DIR||(process.platform==='darwin'?path.join(os.homedir(),'Library/Application Support/HOTPOOR SayAgain'):process.platform==='win32'?path.join(process.env.APPDATA||path.join(os.homedir(),'AppData/Roaming'),'HOTPOOR SayAgain'):path.join(process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config'),'HOTPOOR SayAgain'));
 return path.join(base,'sayagain-connection.json');
}
function request(endpoint,body) {
 let settings;try{settings=JSON.parse(fs.readFileSync(connectionFile(),'utf8'));}catch{throw new Error('请先启动 SayAgain，并在设置中启用 Skill 接入。');}
 if(settings.version!==1||!Number.isInteger(settings.port)||settings.port<1||settings.port>65535||!/^[0-9a-f]{64}$/.test(settings.token))throw new Error('本地连接文件无效');
 const payload=body===undefined?null:Buffer.from(JSON.stringify(body));
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:settings.port,path:endpoint,method:payload?'POST':'GET',headers:{Authorization:`Bearer ${settings.token}`,...(payload?{'Content-Type':'application/json','Content-Length':payload.length}:{})},timeout:5000},res=>{
   let result='';res.setEncoding('utf8');res.on('data',chunk=>{result+=chunk;if(result.length>300000)req.destroy(new Error('响应过大'));});res.on('end',()=>{try{const data=JSON.parse(result);if(res.statusCode!==200)reject(new Error(data.error||'本地接口失败'));else resolve(data);}catch(error){reject(error);}});
  });req.on('timeout',()=>req.destroy(new Error('SayAgain 响应超时')));req.on('error',reject);if(payload)req.write(payload);req.end();
 });
}
async function main(args) {
 if(args[0]==='context')return request('/v1/context');
 if(args[0]==='submit'){
  const filename=args[1];if(!filename)throw new Error('用法：node client.cjs submit <review.json 或 ->');
  const raw=fs.readFileSync(filename==='-'?0:filename,'utf8');if(Buffer.byteLength(raw)>256*1024)throw new Error('评估记录过大');
  return request('/v1/reviews',JSON.parse(raw));
 }
 throw new Error('用法：node client.cjs context | submit <review.json 或 ->');
}
if(require.main===module)main(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={request,connectionFile,main};
