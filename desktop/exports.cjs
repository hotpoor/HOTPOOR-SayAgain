const fs=require('node:fs'),path=require('node:path');
function stamp(ms,vtt=false){const n=Math.max(0,Math.round(ms)),h=Math.floor(n/3600000),m=Math.floor(n/60000)%60,s=Math.floor(n/1000)%60;return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}${vtt?'.':','}${String(n%1000).padStart(3,'0')}`;}
function subtitles(rows,format){return(format==='vtt'?'WEBVTT\n\n':'')+rows.filter(r=>r.text?.trim()).sort((a,b)=>a.start-b.start).map((r,i)=>`${i+1}\n${stamp(r.start,format==='vtt')} --> ${stamp(r.end,format==='vtt')}\n${r.text.replace(/-->/g,'→').replace(/\n\s*\n/g,'\n')}\n`).join('\n');}
function build(service,input){
 const ids=input.ids;if(!Array.isArray(ids)||!ids.length||ids.length>500||new Set(ids).size!==ids.length)throw Error('请选择1–500条不同记录');
 if(input.kind==='expressions'){
  const entries=ids.map(id=>service.entity(id,'expression')),body=entries.map(r=>({id:r.block_id,...r.body}));
  if(input.format==='json')return[{name:'expressions.json',text:JSON.stringify(body,null,2)}];
  if(input.format==='csv'){const cols=['original','improved','translation','explanation','pattern','category'],quote=v=>'"'+String(v||'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';return[{name:'expressions.csv',text:'\ufeff'+[cols.join(','),...body.map(b=>cols.map(c=>quote(b[c])).join(','))].join('\r\n')}];}
  if(input.format==='md')return[{name:'expressions.md',text:body.map(b=>`## ${b.original}\n\n${b.improved}\n\n${b.translation||''}\n\n${b.explanation||''}`).join('\n\n---\n\n')}];
 }
 if(input.kind==='recordings'&&['txt','srt','vtt'].includes(input.format)){
  const view=require('../renderer/recording-view.js');return ids.flatMap(id=>{const session=service.state().recordings.find(r=>r.block_id===id)||service.entity(id,'recording'),clips=service.store.list('recording_clip').filter(c=>c.body.recording_id===id&&c.body.status==='active');if(input.format==='txt')return[{name:`${id}.txt`,text:view.transcript(session,clips)}];const groups=new Map();for(const c of clips){const key=c.body.recording_source_id||c.body.source_name||'recording';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(...view.rows(c));}return[...groups.values()].map((rows,i)=>({name:`${id}-source-${i+1}.${input.format}`,text:subtitles(rows,input.format)}));});
 }
 if(input.kind==='audio')return ids.map(id=>{const record=service.store.get(id);if(!record||!['voice_sample','synthesis','recording_clip','recording_source'].includes(record.body.type)||!record.body.asset_id)throw Error('此记录没有可导出的音频');const asset=service.asset(record.body.asset_id);return{name:id+path.extname(asset.filename),filename:asset.filename};});
 throw Error('不支持的导出格式');
}
function write(service,input,destination){const items=build(service,input);if(!items.length)throw Error('没有可导出的内容');const folder=path.join(destination,'SayAgain-export-'+Date.now());fs.mkdirSync(folder);try{for(const item of items){const file=path.join(folder,item.name);if(item.filename)fs.copyFileSync(item.filename,file);else fs.writeFileSync(file,item.text,'utf8');}}catch(e){fs.rmSync(folder,{recursive:true,force:true});throw e;}return{directory:folder,count:items.length};}
module.exports={build,write,subtitles};
