const { createHash } = require('node:crypto');
const { newId } = require('../storage/store.cjs');
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
function text(value, name, max=20000) {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${name}格式不正确`);
  return value;
}
function source(input) {
  const client=text(input.client,'client',80), conversation=text(input.conversation_id,'conversation_id',256), turn=text(input.turn_id,'turn_id',256);
  if (!client || !conversation || !turn) throw new Error('缺少来源标识');
  const revision=input.message_revision ?? 1;
  if(!Number.isSafeInteger(revision)||revision<1)throw new Error('消息修订号无效');
  return {client,conversation_id:conversation,turn_id:turn,message_revision:revision};
}
function installReview(Service) {
  Service.prototype.integration = function() {return this.store.list('integration')[0];};
  Service.prototype.reviewContext = function() {
    const config=this.config();
    return {enabled:!!this.integration()?.body.enabled,config:{id:config.block_id,revision:config.body.revision,native_language:config.body.native_language,target_language:config.body.target_language,onboarding_complete:config.body.onboarding_complete},policy_version:1};
  };
  Service.prototype.setIntegration = function(input) {
    if(typeof input.enabled!=='boolean')throw new Error('启用状态无效');
    return this.store.transaction(()=>{
      const current=this.integration();
      const changes={enabled:input.enabled,trigger_mode:'skill-or-hook',enabled_at:input.enabled?Date.now():null};
      return current?this.update(current,changes):this.store.put({type:'integration',profile_id:this.profileId,client:'skill',...changes});
    });
  };
  Service.prototype.submitReview = function(input) {
    if(!this.integration()?.body.enabled)throw new Error('请先在设置中启用 Skill 接入');
    const config=this.config();
    if(!config.body.onboarding_complete)throw new Error('请先选择母语和目标语言');
    const provenance=source(input);
    const original=text(input.source_text,'source_text');
    const decision=input.decision;
    if(!['needs_improvement','no_change','skipped','uncertain','failed'].includes(decision))throw new Error('未知评估结果');
    if(input.policy_version!==1)throw new Error('不支持此评估协议版本');
    const reason=text(input.reason,'reason',4000);
    const items=input.expressions;
    if(!Array.isArray(items)||items.length>20)throw new Error('建议列表无效');
    if((decision==='needs_improvement') !== (items.length>0))throw new Error('评估结果和建议数量不一致');
    const key=hash({...provenance,source_hash:hash(original),config_id:input.config_id,config_revision:input.config_revision,policy_version:1});
    const existing=this.store.db.prepare('SELECT block_id FROM dedupe_index WHERE scope=? AND dedupe_key=?').get('evaluation',key);
    if(existing){const e=this.entity(existing.block_id,'evaluation');return{evaluation_id:e.block_id,expression_ids:e.body.expression_ids,duplicate:true};}
    if(input.config_id!==config.block_id||input.config_revision!==config.body.revision)throw new Error('语言设置已改变，请重新读取 context 后评估');
    const chars=Array.from(original);
    const normalized=items.map(item=>{
      const span=item.source_span;
      if(!span||!Number.isSafeInteger(span.start)||!Number.isSafeInteger(span.end)||span.start<0||span.end<=span.start||span.end>chars.length)throw new Error('原句范围无效，使用 Unicode 字符索引');
      const quote=text(item.original,'original',10000);
      if(chars.slice(span.start,span.end).join('')!==quote)throw new Error('原句与来源片段不匹配');
      const improved=text(item.improved,'improved',10000);
      if(!improved.trim()||quote===improved)throw new Error('建议表达应有明确改进');
      if(!['grammar','word_choice','naturalness','register','translation_practice'].includes(item.category))throw new Error('建议类别无效');
      if(typeof item.confidence!=='number'||item.confidence<0||item.confidence>1||!Number.isFinite(item.confidence))throw new Error('置信度无效');
      return{original:quote,improved,source_span:span,category:item.category,confidence:item.confidence,translation:text(item.translation||'','translation',10000),explanation:text(item.explanation,'explanation',10000),pattern:text(item.pattern||'','pattern',10000)};
    });
    return this.store.transaction(()=>{
      const evaluationId=newId(),turnId=newId();
      const turn=this.store.put({type:'turn',profile_id:this.profileId,...provenance,source_hash:hash(original),occurred_at:Date.now(),role:'user'}, {id:turnId});
      const ids=normalized.map(item=>this.store.put({type:'expression',profile_id:this.profileId,...item,source:'skill',source_client:provenance.client,evaluation_id:evaluationId,source_occurred_at:turn.body.occurred_at,language_pair:{native_language:config.body.native_language,target_language:config.body.target_language},content_revision:1,acceptance:'pending',favorite:false,links:[{relation:'evaluation',target_id:evaluationId}]}).block_id);
      this.store.put({type:'evaluation',profile_id:this.profileId,turn_id:turnId,decision,reason,policy_version:1,learning_config_snapshot:{...config.body},evaluator:text(input.evaluator||provenance.client,'evaluator',200),input_hash:hash(original),expression_ids:ids,completed_at:Date.now(),links:[{relation:'turn',target_id:turnId},...ids.map(id=>({relation:'expression',target_id:id}))],dedupe_keys:[{scope:'evaluation',key}]},{id:evaluationId});
      const integration=this.integration();this.update(integration,{last_ack_at:Date.now(),last_decision:decision});
      return{evaluation_id:evaluationId,expression_ids:ids,duplicate:false};
    });
  };
}
module.exports={installReview};
