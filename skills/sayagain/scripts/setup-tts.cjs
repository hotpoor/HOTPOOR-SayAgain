const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {modelStatus,MODEL,REVISION}=require('./local-model.cjs');
const {connectionFile}=require('./client.cjs');
const userDirectory=process.env.SAYAGAIN_DATA_DIR||path.dirname(connectionFile());
fs.mkdirSync(userDirectory,{recursive:true,mode:0o700});
const status=modelStatus(userDirectory);
console.log(JSON.stringify({...status,runtime:undefined,installation_budget:'10 GiB: model (~2.52 GB), Python dependencies, download/cache and free-space reserve'},null,2));
if(!process.argv.includes('--install'))process.exit(0);
if(!status.space_ok){console.error('磁盘空间不足，无法使用本地 Qwen3-TTS。请在 SayAgain 设置中选择千问AI平台云端接入，或释放空间后重试。');process.exit(2);}
if(status.installed){console.log('模型已安装，无需重复下载。');process.exit(0);}
const root=path.join(userDirectory,'tts'),venv=path.join(root,'venv'),modelPath=path.join(root,'model');
fs.mkdirSync(root,{recursive:true,mode:0o700});
const lock=path.join(root,'install.lock');let lockFd;
try{lockFd=fs.openSync(lock,'wx',0o600);}catch{throw new Error('已有安装任务；若上次中断，请确认没有安装进程后移除 tts/install.lock');}
try{
 const uv=process.env.SAYAGAIN_UV||'uv';
 execFileSync(uv,['venv','--python','3.12',venv],{stdio:'inherit'});
 const python=path.join(venv,process.platform==='win32'?'Scripts/python.exe':'bin/python');
 execFileSync(uv,['pip','install','--python',python,'-r',path.join(__dirname,'requirements.txt')],{stdio:'inherit',env:{...process.env,UV_CACHE_DIR:path.join(root,'cache')}});
 fs.mkdirSync(modelPath,{recursive:true});
 const meta=JSON.parse(execFileSync('curl',['--fail','--location','--max-time','60',`https://huggingface.co/api/models/${MODEL}/revision/${REVISION}?blobs=true`],{encoding:'utf8'}));
 if(meta.sha!==REVISION)throw new Error('模型版本不匹配');
 for(const item of meta.siblings){
  if(!/^(speech_tokenizer\/)?[A-Za-z0-9_.-]+$/.test(item.rfilename)||item.rfilename==='README.md'||item.rfilename==='.gitattributes')continue;
  const final=path.join(modelPath,item.rfilename);fs.mkdirSync(path.dirname(final),{recursive:true});
  const temporary=final+'.part';
  execFileSync('curl',['--fail','--location','--retry','2','--connect-timeout','15','--output',temporary,`https://huggingface.co/${MODEL}/resolve/${REVISION}/${item.rfilename}`],{stdio:'inherit'});
  if(fs.statSync(temporary).size!==item.size)throw new Error('模型文件大小不匹配');
  if(item.lfs?.sha256){const fd=fs.openSync(temporary,'r'),buffer=Buffer.alloc(1024*1024),hash=createHash('sha256');try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))hash.update(buffer.subarray(0,n));}finally{fs.closeSync(fd);}if(hash.digest('hex')!==item.lfs.sha256)throw new Error('模型校验失败');}
  fs.renameSync(temporary,final);
 }
 fs.writeFileSync(path.join(root,'runtime.json'),JSON.stringify({model_id:MODEL,revision:REVISION,python,model_path:modelPath,device:'cpu',installed_at:Date.now()},null,2),{mode:0o600});
 console.log('本地模型已安装。重开设置页即可使用；CPU 是保守默认，生成速度取决于硬件。');
}finally{fs.closeSync(lockFd);fs.unlinkSync(lock);}
