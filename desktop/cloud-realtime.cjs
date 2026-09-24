const {randomUUID}=require('node:crypto');
const WebSocket=require('ws');
function pcmWav(data){
 if(!data.length||data.length%2)throw new Error('实时音频不完整');
 const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(data.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(24000,24);header.writeUInt32LE(48000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(data.length,40);return Buffer.concat([header,data]);
}
function synthesizeRealtime({model,voice,text,key,signal,Socket=WebSocket,timeoutMs=120000}){
 return new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(new Error('任务已取消'));
  const ws=new Socket('wss://maas.qianwenaiapi.com/api-ws/v1/realtime?model='+encodeURIComponent(model),{headers:{Authorization:'Bearer '+key},maxPayload:8*1024*1024,handshakeTimeout:30000,followRedirects:false});
  const chunks=[];let size=0,settled=false,configured=false,submitted=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);ws.terminate();error?reject(error):resolve(value);};
  const abort=()=>finish(new Error('任务已取消'));signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>finish(new Error('实时语音合成超时，请重试')),timeoutMs);
  const send=value=>ws.send(JSON.stringify({event_id:randomUUID(),...value}));
  ws.on('message',raw=>{if(settled)return;try{const event=JSON.parse(raw.toString());
   if(event.type==='session.created'&&!configured){configured=true;send({type:'session.update',session:{mode:'server_commit',voice,response_format:'pcm',sample_rate:24000}});}
   else if(event.type==='session.updated'&&!submitted){submitted=true;send({type:'input_text_buffer.append',text});send({type:'session.finish'});}
   else if(event.type==='response.audio.delta'){if(typeof event.delta!=='string'||!event.delta||!/^[A-Za-z0-9+/]+={0,2}$/.test(event.delta)||event.delta.length%4)throw new Error('实时音频数据无效');const chunk=Buffer.from(event.delta,'base64');size+=chunk.length;if(size>30*1024*1024)throw new Error('实时音频超过大小限制');chunks.push(chunk);}
   else if(event.type==='error')throw new Error('实时语音接口返回错误，请检查模型权限与平台额度');
   else if(event.type==='session.finished')finish(null,pcmWav(Buffer.concat(chunks)));
  }catch(error){finish(error);}});
  ws.on('error',()=>finish(new Error('实时语音连接失败，请检查网络、密钥和模型权限')));
  ws.on('close',()=>finish(new Error('实时语音连接提前关闭，未保存不完整音频')));
 });
}
module.exports={synthesizeRealtime,pcmWav};
