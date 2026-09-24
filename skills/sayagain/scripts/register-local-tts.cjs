// Register an existing environment; never installs packages or downloads models.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {connectionFile}=require('./client.cjs');
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
for(const name of ['--python','--model-path'])if(!args.includes(name)||!path.isAbsolute(option(name)||''))throw Error(`${name} requires an absolute path`);
const python=option('--python'),modelPath=option('--model-path'),device=args.includes('--device')?option('--device'):'cpu';
if(!['cpu','cuda:0','mps'].includes(device))throw Error('Unsupported device');
const cfg=JSON.parse(fs.readFileSync(path.join(modelPath,'config.json'),'utf8'));
if(cfg.model_type!=='qwen3_tts'||cfg.tts_model_type!=='base'||!['0b6','1b7'].includes(cfg.tts_model_size))throw Error('Expected Qwen3-TTS 0.6B or 1.7B Base');
const hash=createHash('sha256');
for(const file of ['config.json','model.safetensors','speech_tokenizer/model.safetensors']){
 const fd=fs.openSync(path.join(modelPath,file),'r'),buffer=Buffer.alloc(1024*1024);try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))hash.update(buffer.subarray(0,n));}finally{fs.closeSync(fd);}
}
execFileSync(python,['-c',"import sys,torch,soundfile,qwen_tts; d=sys.argv[1]; assert d!='cuda:0' or torch.cuda.is_available(), 'CUDA unavailable'; assert d!='mps' or torch.backends.mps.is_available(), 'MPS unavailable'",device],{stdio:'pipe'});
const directory=process.env.SAYAGAIN_DATA_DIR||path.dirname(connectionFile());
if(!path.isAbsolute(directory))throw Error('SAYAGAIN_DATA_DIR must be absolute');
const root=path.join(directory,'tts');fs.mkdirSync(root,{recursive:true});
const filename=path.join(root,'runtime.json');
if(fs.existsSync(filename))fs.copyFileSync(filename,filename+'.backup-'+Date.now());
const runtime={source:'existing',model_id:`Qwen/Qwen3-TTS-12Hz-${cfg.tts_model_size==='1b7'?'1.7B':'0.6B'}-Base`,revision:'local-sha256:'+hash.digest('hex'),python,model_path:modelPath,device,installed_at:Date.now()};
fs.writeFileSync(filename,JSON.stringify(runtime,null,2),{mode:0o600});
console.log(JSON.stringify({registered:true,model_id:runtime.model_id,device,runtime_file:filename}));
