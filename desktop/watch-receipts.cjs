const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const SCHEMA='sayagain-watch-sync-v1',RATE=16000;
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const integer=(value,min=0)=>Number.isSafeInteger(value)&&value>=min;
function expectedHeader(samples){
 const bytes=Buffer.alloc(44);bytes.write('RIFF');bytes.writeUInt32LE(36+samples*2,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(RATE,24);bytes.writeUInt32LE(RATE*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples*2,40);return bytes;
}
function verifySavedChunk(service,clip){
 const b=clip.body,w=b.watch;
 if(w.schema!=='sayagain-watch-v1'||!uuid(w.device_id)||!uuid(w.session_id)||!integer(w.index)||w.chunk_id!==`${w.session_id}_${w.index}`||!integer(w.sample_start)||!integer(w.sample_count,1)||w.sample_count>RATE*600||!integer(w.sample_start+w.sample_count)||w.sample_rate!==RATE||w.channels!==1||w.bits_per_sample!==16||!/^[0-9a-f]{64}$/.test(b.sha256||'')||(b.sample_count!==undefined&&b.sample_count!==w.sample_count)||(b.sample_start!==undefined&&b.sample_start!==w.sample_start))throw Error('手表原始分片身份、采样或校验元数据无效');
 if(!integer(b.imported_at,1)||b.imported_at>8640000000000000)throw Error('手表分片缺少真实保存时间，不能产生 STORED 回执');
 const asset=service.entity(b.asset_id,'asset'),a=asset.body;
 if(a.sha256!==b.sha256||a.byte_size!==44+w.sample_count*2||a.media_type!=='audio/wav'||!/^assets\/[0-9a-f]{32}\.wav$/.test(a.relative_path||''))throw Error(`手表分片 ${w.index} 的资产元数据与原始音频不符`);
 const directory=path.resolve(service.directory),assets=path.join(directory,'assets'),folder=fs.lstatSync(assets);
 if(!folder.isDirectory()||folder.isSymbolicLink())throw Error('音频资产目录必须为真实目录');
 const filename=path.join(directory,a.relative_path),before=fs.lstatSync(filename);
 if(!before.isFile()||before.isSymbolicLink()||before.size!==a.byte_size||!fs.realpathSync(filename).startsWith(fs.realpathSync(assets)+path.sep))throw Error(`手表分片 ${w.index} 的已存音频无效、损坏或为符号链接`);
 const fd=fs.openSync(filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)),hash=createHash('sha256');
 try{
  const opened=fs.fstatSync(fd);if(!opened.isFile()||opened.size!==before.size||opened.ino!==before.ino||opened.dev!==before.dev)throw Error(`手表分片 ${w.index} 在校验时改变`);
  const h=Buffer.alloc(44);let position=0;
  while(position<h.length){const n=fs.readSync(fd,h,position,h.length-position,position);if(!n)throw Error(`手表分片 ${w.index} 的 WAV 头不完整`);position+=n;}
  if(!h.equals(expectedHeader(w.sample_count)))throw Error(`手表分片 ${w.index} 的 WAV 格式或采样数不正确`);hash.update(h);
  const buffer=Buffer.alloc(65536);
  while(position<opened.size){const n=fs.readSync(fd,buffer,0,Math.min(buffer.length,opened.size-position),position);if(!n)throw Error(`手表分片 ${w.index} 的 PCM 数据不完整`);hash.update(buffer.subarray(0,n));position+=n;}
  if(hash.digest('hex')!==b.sha256)throw Error(`手表分片 ${w.index} 的已存音频 SHA-256 校验失败，不能确认已保存`);
 }finally{fs.closeSync(fd);}
 return {device_id:w.device_id,session_id:w.session_id,chunk_id:w.chunk_id,sha256:b.sha256,status:'STORED',stored_at_ms:b.imported_at};
}
function exportWatchReceipts(service,{device_id,client_id}={}){
 if(device_id!==undefined&&!uuid(device_id))throw Error('手表设备标识无效');
 if(client_id!==undefined&&!uuid(client_id))throw Error('客户端安装标识无效');
 const clips=service.store.list('recording_clip').filter(c=>c.body.source==='watch'&&c.body.watch?.kind==='chunk'&&(!device_id||c.body.watch.device_id===device_id)),receipts=new Map();
 for(const clip of clips){
  const receipt=verifySavedChunk(service,clip),w=clip.body.watch,key=`${receipt.device_id}/${receipt.session_id}/${receipt.chunk_id}`;
  const signature=JSON.stringify({sha256:receipt.sha256,index:w.index,sample_start:w.sample_start,sample_count:w.sample_count,continuity_id:w.continuity_id??0}),previous=receipts.get(key);
  if(previous){if(previous.signature!==signature)throw Error('同一手表分片标识对应冲突的内容或采样元数据');previous.receipt.stored_at_ms=Math.min(previous.receipt.stored_at_ms,receipt.stored_at_ms);}
  else receipts.set(key,{signature,receipt:{...receipt,...(client_id?{client_id}:{})}});
 }
 return {schema:SCHEMA,receipts:[...receipts.values()].map(row=>row.receipt).sort((a,b)=>a.device_id.localeCompare(b.device_id)||a.session_id.localeCompare(b.session_id)||Number(a.chunk_id.split('_').at(-1))-Number(b.chunk_id.split('_').at(-1)))};
}
// The CLI must not construct Service/Store: their initialization runs migrations
// and settings writes. This adapter opens every existing SQLite file read-only.
function openReadOnlyService(directory){
 const {DatabaseSync}=require('node:sqlite'),absolute=path.resolve(directory),opened=[];
 try{
  for(const name of ['SayAgain','SayAgain1','SayAgain2']){
   const filename=path.join(absolute,name),stat=fs.lstatSync(filename);if(!stat.isFile()||stat.isSymbolicLink())throw Error('SayAgain 数据库必须为真实文件');
   const db=new DatabaseSync(filename,{readOnly:true});opened.push(db);if(db.prepare('PRAGMA user_version').get().user_version>1)throw Error('数据库来自更新版本的 SayAgain');
  }
  const parse=row=>row?{...row,body:JSON.parse(row.body)}:null;
  const get=id=>{if(typeof id!=='string'||!/^[0-9a-f]{32}$/.test(id))throw Error('无效的实体 ID');return parse(opened[parseInt(id.at(-1),16)%2+1].prepare('SELECT * FROM entities WHERE block_id=?').get(id));};
  const list=type=>opened.slice(1).flatMap(db=>db.prepare("SELECT * FROM entities WHERE json_extract(body,'$.type')=?").all(type).map(parse)).filter(r=>r.body.status!=='deleted');
  let closed=false;
  return {directory:absolute,store:{get,list},entity(id,type){const record=get(id);if(!record||record.body.type!==type||record.body.status==='deleted')throw Error('记录不存在');return record;},close(){if(!closed){closed=true;for(const db of opened.toReversed())db.close();}}};
 }catch(error){for(const db of opened.toReversed())db.close();throw error;}
}
module.exports={exportWatchReceipts,openReadOnlyService,SCHEMA};
