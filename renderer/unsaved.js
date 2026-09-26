// Track edits in memory only: never persist credentials or microphone buffers.
window.unsaved=(()=>{
 const dirty=new Set();let replay=false,asking=false;
 const scope=el=>el.closest('form,[data-turn-editor]')||el.closest('.recording-clip');
 function prune(){for(const el of dirty)if(!el.isConnected)dirty.delete(el);}
 function has(){prune();return dirty.size>0;}
 function clear(el){if(el)dirty.delete(scope(el)||el);else dirty.clear();}
 async function permit(){
  if(window.recordingPage?.busy){await window.itemEditor({title:'录音正在处理中',message:'请先停止录音并保存，或等待当前解析任务完成。',submit:'知道了',onSave:async()=>{}});return false;}
  if(!has())return true;
  if(asking)return false;asking=true;
  try{const discard=await window.itemEditor({title:'有尚未保存的修改',message:'继续会放弃当前修改。选择取消可返回保存。',submit:'放弃修改并继续',onSave:async()=>{}});if(discard)clear();return discard;}finally{asking=false;}
 }
 for(const type of ['input','change'])document.addEventListener(type,e=>{
  const el=e.target;if(el.closest('.item-editor')||el.type==='search'||el.type==='range'||el.matches('[data-turn-play]'))return;
  const container=scope(el);if(container&&(el.matches('input,textarea,select')))dirty.add(container);
 },true);
 document.addEventListener('click',e=>{
  if(replay||e.target.closest('.item-editor'))return;
  const b=e.target.closest('[data-page],[data-action="close-dialog"],#recording-back,[data-recording-open],[data-action="add-expression"],[data-action="edit-expression"],[data-action="edit-voice"],[data-action="add-sample"]');
  if(!b||(!has()&&!window.recordingPage?.busy))return;
  e.preventDefault();e.stopImmediatePropagation();permit().then(ok=>{if(ok){replay=true;try{b.click();}finally{replay=false;}}});
 },true);
 // Filters rebuild records, so protect edits before delivering their change handlers.
 document.addEventListener('change',e=>{
  if(replay||!has()||!e.target.matches('#clip-speaker,#reader-sort,#voice-filter,#review-filter,#pair-filter'))return;
  e.stopImmediatePropagation();const el=e.target;permit().then(ok=>{if(ok){replay=true;try{el.dispatchEvent(new Event('change',{bubbles:true}));}finally{replay=false;}}});
 },true);
 document.addEventListener('cancel',e=>{if(replay||e.target.id!=='editor'||!has())return;e.preventDefault();permit().then(ok=>{if(ok)e.target.close();});},true);
 window.addEventListener('beforeunload',e=>{if(has()){e.preventDefault();e.returnValue='';}});
 return{has,clear,mark(el){dirty.add(scope(el)||el);},permit};
})();
