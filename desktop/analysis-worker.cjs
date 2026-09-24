const {spawn}=require('node:child_process');

// Bound each message, not the complete recording. The idle deadline advances
// only after a validated clip; a long but progressing recording can finish.
function runAnalysisWorker(python,script,request,onProgress=()=>{},options={}){
 return new Promise((resolve,reject)=>{
  const child=(options.spawn||spawn)(python,[script],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  const results=[];let buffer='',finished=false,settled=false,timer;
  const fail=error=>{if(settled)return;settled=true;clearTimeout(timer);child.kill();reject(error);};
  const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>fail(Error('分析长时间未完成新片段，请重试')),options.idleTimeoutMs??600000);};
  arm();child.stdout.setEncoding('utf8');
  child.stdout.on('data',data=>{
   if(settled)return;
   buffer+=data;
   try{
    let end;
    while((end=buffer.indexOf('\n'))>=0){
     const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
     if(!line.trim())continue;
     if(line.length>2000000)throw Error('单个片段的分析输出过大');
     const value=JSON.parse(line);
     if(value.error)throw Error(value.error);
     if(finished)throw Error('无效分析结果');
     if(value.type==='clip'){
      const item=value.clip;
      if(!item||item.id!==request.clips[results.length]?.id||!Array.isArray(item.segments))throw Error('无效分析结果');
      options.onClip?.(item);results.push(item);arm();onProgress({completed:results.length,total:request.clips.length});
     }else if(value.type==='done'&&results.length===request.clips.length){finished=true;}
     else throw Error('无效分析结果');
    }
    if(buffer.length>2000000)throw Error('单个片段的分析输出过大');
   }catch(error){fail(error);}
  });
  child.stderr.on('data',()=>{});
  child.stdin.on('error',error=>fail(error));
  child.on('error',error=>fail(error));
  child.on('close',code=>{
   if(settled)return;
   if(code||!finished||buffer.trim())return fail(Error('分析进程退出或输出不完整，请重试'));
   settled=true;clearTimeout(timer);resolve({clips:results});
  });
  child.stdin.end(JSON.stringify(request));
 });
}
module.exports={runAnalysisWorker};
