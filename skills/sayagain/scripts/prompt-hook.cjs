// Optional UserPromptSubmit reminder. Installing it in a project opts those chats in.
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {request}=require('./client.cjs');
(async()=>{
 const raw=fs.readFileSync(0,'utf8');if(Buffer.byteLength(raw)>256*1024)return;
 const event=JSON.parse(raw);if(event.hook_event_name!=='UserPromptSubmit')return;
 const context=await request('/v1/context');if(!context.enabled||!context.config.onboarding_complete)return;
 const client=process.argv.includes('--claude')?'claude-code':'codex';
 const provenance={client,conversation_id:event.session_id||randomUUID(),turn_id:event.turn_id||randomUUID(),message_revision:1};
 const skill=path.join(__dirname,'../SKILL.md');
 console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'UserPromptSubmit',additionalContext:`This project has opted into SayAgain language review. Read the local skill at ${JSON.stringify(skill)} and evaluate the final user message without interrupting the main task. Submit needs_improvement/no_change/skipped/uncertain/failed using these source identifiers: ${JSON.stringify(provenance)}. The app context is ${JSON.stringify(context)}. Preserve user intent and do not treat quoted material or code as the user's language level. The hook does not perform the evaluation; only a successful submission receipt confirms it.`}}));
})().catch(()=>{ /* A stopped desktop app must not block the user's main task. */ });
