const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {exportWatchReceipts,openReadOnlyService,SCHEMA}=require('../desktop/watch-receipts.cjs');
function options(args){
 const result={};for(let index=0;index<args.length;index+=2){const name=args[index],value=args[index+1];if(!['--data-dir','--output','--device-id','--client-id','--merge'].includes(name)||!value||value.startsWith('--')||result[name]!==undefined)throw Error('用法：node scripts/watch-receipts.cjs --data-dir <实际 data 目录> --output <本地回执.json> [--device-id <设备标识>] [--client-id <客户端安装标识>] [--merge <已有回执.json>]');result[name]=value;}
 if(!result['--data-dir']||!result['--output'])throw Error('必须指定实际 data 目录与本地 JSON 输出路径');return result;
}
function validateReceipts(value){
 if(!value||value.schema!==SCHEMA||!Array.isArray(value.receipts))throw Error('已有保存回执格式无效');
 const uuid=text=>typeof text==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text);
 return value.receipts.map(receipt=>{
  if(!receipt||Array.isArray(receipt)||!uuid(receipt.device_id)||!uuid(receipt.session_id)||typeof receipt.chunk_id!=='string'||typeof receipt.sha256!=='string'||!/^[0-9a-f]{64}$/i.test(receipt.sha256)||receipt.status!=='STORED'||!Number.isSafeInteger(receipt.stored_at_ms)||receipt.stored_at_ms<=0||receipt.stored_at_ms>8640000000000000||(receipt.client_id!==undefined&&!uuid(receipt.client_id)))throw Error('已有保存回执字段无效，不能用于确认上传');
  const session_id=receipt.session_id.toLowerCase(),chunk_id=receipt.chunk_id.toLowerCase(),prefix=`${session_id}_`,suffix=chunk_id.slice(prefix.length);
  if(!chunk_id.startsWith(prefix)||!/^(0|[1-9][0-9]*)$/.test(suffix)||!Number.isSafeInteger(Number(suffix)))throw Error('已有保存回执分片标识无效');
  return {device_id:receipt.device_id.toLowerCase(),session_id,chunk_id,sha256:receipt.sha256.toLowerCase(),status:'STORED',stored_at_ms:receipt.stored_at_ms,...(receipt.client_id!==undefined?{client_id:receipt.client_id.toLowerCase()}: {})};
 });
}
function mergeReceipts(existing,current){
 const merged=new Map();
 for(const receipt of [...validateReceipts(existing),...validateReceipts(current)]){
  const key=`${receipt.device_id}/${receipt.session_id}/${receipt.chunk_id}`,previous=merged.get(key);
  if(previous&&previous.sha256!==receipt.sha256)throw Error('同一保存回执标识对应不同 SHA-256，拒绝覆盖原上传记录');
  if(!previous||receipt.stored_at_ms<previous.stored_at_ms||(receipt.stored_at_ms===previous.stored_at_ms&&!previous.client_id&&receipt.client_id))merged.set(key,receipt);
 }
 return {schema:SCHEMA,receipts:[...merged.values()].sort((a,b)=>a.device_id.localeCompare(b.device_id)||a.session_id.localeCompare(b.session_id)||Number(a.chunk_id.split('_').at(-1))-Number(b.chunk_id.split('_').at(-1)))};
}
function readReceipts(filename){
 const stat=fs.lstatSync(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16*1024*1024)throw Error('已有保存回执文件无效、过大或为符号链接');
 let value;try{value=JSON.parse(fs.readFileSync(filename,'utf8'));}catch{throw Error('已有保存回执 JSON 损坏，原输出保持不变');}
 validateReceipts(value);return value;
}
function run(args){
 const input=options(args),output=path.resolve(input['--output']);if(path.extname(output).toLowerCase()!=='.json')throw Error('回执输出必须使用 .json 文件');
 if(fs.existsSync(output)){const stat=fs.lstatSync(output);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16*1024*1024)throw Error('已有回执输出路径无效');let existing;try{existing=JSON.parse(fs.readFileSync(output,'utf8'));}catch{throw Error('已有输出不是回执 JSON，请使用新路径');}if(existing.schema!==SCHEMA)throw Error('已有输出不是手表保存回执，请使用新路径');}
 const previous=input['--merge']?readReceipts(path.resolve(input['--merge'])):null;
 const service=openReadOnlyService(input['--data-dir']);let exported;
 try{exported=exportWatchReceipts(service,{device_id:input['--device-id'],client_id:input['--client-id']});}finally{service.close();}
 if(previous)exported=mergeReceipts(previous,exported);
 const json=JSON.stringify(exported,null,2)+'\n';if(Buffer.byteLength(json)>16*1024*1024)throw Error('合并保存回执超过16 MiB，原输出保持不变');
 fs.mkdirSync(path.dirname(output),{recursive:true});const temporary=`${output}.tmp-${randomUUID()}`,fd=fs.openSync(temporary,'wx',0o600);
 try{try{fs.writeFileSync(fd,json);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temporary,output);}catch(error){fs.rmSync(temporary,{force:true});throw error;}
 return {receipt_count:exported.receipts.length,device_count:new Set(exported.receipts.map(r=>r.device_id)).size,session_count:new Set(exported.receipts.map(r=>`${r.device_id}/${r.session_id}`)).size,output};
}
if(require.main===module){try{console.log(JSON.stringify(run(process.argv.slice(2))));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={run,mergeReceipts};
