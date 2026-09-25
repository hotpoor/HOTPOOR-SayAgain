// Display aliases stay separate from model labels and confirmed speaker boundaries.
(function(scope){
 const key=value=>String(value||'不确定');
 function turns(clip){const b=clip.body;return b.speaker_analysis?.segments?.length?b.speaker_analysis.segments:[{speaker:key(b.speaker),start_ms:0,end_ms:b.duration_ms}];}
 function turnSpeakers(turn){return Array.isArray(turn.speakers)&&turn.speakers.length?turn.speakers.map(key):[key(turn.speaker)];}
 function keys(clip){return [...new Set(turns(clip).flatMap(turnSpeakers))];}
 function name(session,speaker){speaker=key(speaker);return session.body.speaker_profiles?.find(p=>p.key===speaker)?.name||(/^[A-H]$/.test(speaker)?'Speaker '+speaker:speaker);}
 // Explicit person links may share presentation; local avatar overrides retain their own identity.
 function displayKey(session,speaker){const p=session.body.speaker_profiles?.find(p=>p.key===speaker);return speaker!=='不确定'&&p?.person_id&&!p.avatar_override?'person:'+p.person_id:'speaker:'+speaker;}
 function displayRoster(session,speakers){const seen=new Set();return speakers.filter(p=>{const id=displayKey(session,p.key);if(seen.has(id))return false;seen.add(id);return true;});}
 function color(session,speaker){const p=session.body.speaker_profiles?.find(p=>p.key===speaker);if(/^#[0-9a-f]{6}$/i.test(p?.color||''))return p.color;const id=p?.person_id||speaker||'不确定';return ['#588ab6','#8875b3','#649782','#b18152','#ad647b','#658e96'][[...id].reduce((n,c)=>n+c.charCodeAt(0),0)%6];}
 function roster(session,clips){const counts=new Map((session.body.speaker_profiles||[]).filter(p=>p.key!=='不确定').map(p=>[p.key,0]));for(const clip of clips)for(const speaker of keys(clip))counts.set(speaker,(counts.get(speaker)||0)+1);return [...counts].map(([speaker,count])=>({key:speaker,name:name(session,speaker),note:session.body.speaker_profiles?.find(p=>p.key===speaker)?.note||'',count}));}
 function time(ms){ms=Math.max(0,Math.round(Number(ms)||0));return [Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60].map(n=>String(n).padStart(2,'0')).join(':')+'.'+String(ms%1000).padStart(3,'0');}
 function rows(clip){const b=clip.body,offset=b.source_offset_ms||0;
  // A corrected full transcript takes precedence over old machine segment text.
  const parts=b.transcript_status!=='user_reviewed'&&!b.transcript_turns_stale&&b.transcript_segments?.length?b.transcript_segments:[{start_ms:0,end_ms:b.duration_ms,speaker:keys(clip).join(' / '),speakers:keys(clip),text:b.transcript||''}];
  return parts.map(p=>({...p,speaker:key(p.speaker),start:offset+p.start_ms,end:offset+p.end_ms}));
 }
 function transcript(session,clips){return clips.flatMap(clip=>rows(clip).map(r=>`[${time(r.start)} – ${time(r.end)}] ${(r.speakers||[r.speaker]).map(k=>name(session,k)).join(' / ')}\n${clip.body.source_name||''}\n${r.text||'（尚未转写）'}${clip.body.transcript_turns_stale?'\n（分段已修改，文字待更新）':''}`)).join('\n\n')+'\n';}
 function updated(session,clips=[],sources=[]){return Math.max(session.updatetime||session.createtime||0,...clips.map(c=>c.updatetime||0),...sources.map(c=>c.updatetime||0));}
 // Display the mean envelope of saved peaks, not the maximum of every clip.
 // More zoom reveals more bins, up to the resolution actually stored on disk.
 function waveBars(body,end,width){
  const peaks=body.waveform||[];if(!peaks.length||!(end>0)||!(width>0))return [];
  const left=(body.source_offset_ms||0)/end*width,span=body.duration_ms/end*width;
  const count=Math.min(peaks.length,Math.max(1,Math.floor(span/3)));
  return Array.from({length:count},(_,i)=>{const from=i*peaks.length/count,to=(i+1)*peaks.length/count;let sum=0;
   for(let j=Math.floor(from);j<Math.ceil(to);j++){const weight=Math.min(to,j+1)-Math.max(from,j);sum+=Math.max(0,Math.min(1,Number(peaks[j])||0))*weight;}
   return {x:left+(i+.5)*span/count,height:Math.max(.5,sum/(to-from)*19)};
  });
 }
 const api={color,displayKey,displayRoster,waveBars,turnSpeakers,updated,key,turns,keys,name,roster,time,rows,transcript};if(typeof module!=='undefined')module.exports=api;else scope.recordingView=api;
})(typeof window==='undefined'?{}:window);
