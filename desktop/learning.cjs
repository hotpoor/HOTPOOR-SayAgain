module.exports=Service=>{
 Service.prototype.expressionFromClip=function(input){
  const clip=this.entity(input.clip_id,'recording_clip');if(clip.body.status!=='active'||clip.body.revision!==input.clip_revision)throw Error('原录音片段已变更，请重新选择');
  const original=String(input.original||'');if(!original.trim()||!clip.body.transcript.includes(original))throw Error('所选原句必须来自此片段的转写文字');
  const language=Intl.getCanonicalLocales(input.language)[0];if(!language)throw Error('请选择录音原文语言');
  const expression=this.addExpression(input);
  return this.update(expression,{source:'recording',source_clip_id:clip.block_id,source_recording_id:clip.body.recording_id,source_text_snapshot:original,source_offset_ms:clip.body.source_offset_ms||0,language_pair:{native_language:this.config().body.native_language,target_language:language},links:[...expression.body.links,{relation:'recording_clip',target_id:clip.block_id}]});
 };
};
