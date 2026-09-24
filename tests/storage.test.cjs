const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { Store, newId, shardFor } = require('../storage/store.cjs');
const { Service } = require('../desktop/service.cjs');
function fixture(t) { const root=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-test-')); const service=new Service(path.join(root,'data')); t.after(()=>{service.close();fs.rmSync(root,{recursive:true,force:true});});return {service,root}; }
function wav() { const bytes=Buffer.alloc(44+16000);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(16000,40);return bytes; }
const addAudio = (service,id) => service.addSample({voice_id:id,language:'zh-CN',transcript:'测试录音',bytes:wav(),media_type:'audio/wav',duration_ms:1000,waveform:Array(64).fill(.5),source:'import'});
test('three DB files, exact shard fields, 128-bit routing and persistent records', t=>{
 const {service,root}=fixture(t); const store=service.store;
 for(let i=0;i<100;i++){ const id=newId();assert.equal(shardFor(id),Number(BigInt('0x'+id)%2n)+1); }
 for(const n of [1,2]){assert.deepEqual(store.db.prepare(`SELECT name FROM shard${n}.sqlite_master WHERE type='table'`).all().map(r=>r.name),['entities']);assert.deepEqual(store.db.prepare(`PRAGMA shard${n}.table_info(entities)`).all().map(r=>r.name),['block_id','body','createtime','updatetime']);}
 const voice=service.saveVoice({name:'我的声音',note:'第一次'});const reopened=new Store(path.join(root,'data'));try{assert.equal(reopened.get(voice.block_id).body.note,'第一次');}finally{reopened.close();}
});
test('index + entity + dedupe roll back atomically on failure',t=>{
 const {service}=fixture(t),store=service.store;const before=store.list('voice').length;
 assert.throws(()=>store.transaction(()=>{store.put({type:'voice',dedupe_keys:[{scope:'test',key:'same'}]});store.put({type:'voice',dedupe_keys:[{scope:'test',key:'same'}]});}),/UNIQUE/);
 assert.equal(store.list('voice').length,before);assert.equal(store.db.prepare("SELECT count(*) n FROM dedupe_index WHERE scope='test'").get().n,0);
 for(const n of [1,2])assert.equal(store.db.prepare(`SELECT count(*) n FROM shard${n}.entities WHERE json_extract(body,'$.type')='voice'`).get().n,0);
});
test('optimistic revisions, immutable creation time and index rebuild',t=>{
 const {service}=fixture(t),store=service.store;
 const voice=service.saveVoice({name:'原声',note:''});const updated=service.saveVoice({id:voice.block_id,revision:voice.body.revision,name:'更新',note:'备注'});
 assert.equal(updated.createtime,voice.createtime);assert.equal(updated.body.voice_revision,voice.body.voice_revision);
 assert.throws(()=>service.saveVoice({id:voice.block_id,revision:voice.body.revision,name:'旧写入',note:''}),/已更新/);
 store.db.exec('DELETE FROM entity_index;DELETE FROM relation_index;');assert.equal(store.list('voice').length,0);assert.equal(store.rebuild(),3);assert.equal(store.list('voice')[0].body.name,'更新');
});
test('language changes do not rewrite history; archive and favorite persist',t=>{
 const {service}=fixture(t);
 assert.throws(()=>service.addExpression({original:'a',improved:'b'}),/先设置/);
 service.saveSettings({revision:service.config().body.revision,native_language:'zh-CN',target_language:'en-US'});
 const e=service.addExpression({original:'I very like it.',improved:'I really like it.',explanation:'解释'});
 service.saveSettings({revision:service.config().body.revision,native_language:'zh-CN',target_language:'ja-JP'});
 assert.equal(service.store.get(e.block_id).body.language_pair.target_language,'en-US');
 const f=service.editExpression({id:e.block_id,revision:e.body.revision,action:'favorite'});const a=service.editExpression({id:e.block_id,revision:f.body.revision,action:'archive'});
 assert.equal(a.body.status,'archived');assert.equal(a.body.favorite,true);assert.throws(()=>service.saveSettings({revision:service.config().body.revision,native_language:'bad_code',target_language:'en-US'}),/语言代码/);
});
test('multiple samples, archive clears default without removing audio, restore',t=>{
 const {service}=fixture(t);const voice=service.saveVoice({name:'声音',note:'备注'});
 const sample=addAudio(service,voice.block_id);addAudio(service,voice.block_id);service.defaultVoice({id:voice.block_id});
 assert.equal(service.state().samples.length,2);assert.equal(service.asset(sample.body.asset_id).media_type,'audio/wav');assert.equal(sample.body.recorded_at,null);
 const current=service.store.get(voice.block_id);const archived=service.archiveVoice({id:voice.block_id,revision:current.body.revision});
 assert.deepEqual(service.config().body.default_voice_ids,[]);assert(fs.existsSync(service.asset(sample.body.asset_id).filename));assert.throws(()=>addAudio(service,voice.block_id),/恢复/);assert.throws(()=>service.defaultVoice({id:voice.block_id}),/未归档/);
 service.archiveVoice({id:voice.block_id,revision:archived.body.revision});assert.equal(service.state().samples.length,2);
});
test('backup reopens with recordings and no fake audio success',t=>{
 const {service,root}=fixture(t);const voice=service.saveVoice({name:'声音',note:''});const sample=addAudio(service,voice.block_id);
 const target=service.backup(path.join(root,'backup'));const restored=new Service(target);try{assert.equal(restored.state().voices.length,1);assert.deepEqual(fs.readFileSync(restored.asset(sample.body.asset_id).filename),wav());}finally{restored.close();}
 assert.throws(()=>service.backup(path.join(service.directory,'bad')),/不能位于/);
 assert.throws(()=>service.asset('../../etc/passwd'),/ID/);
 assert.throws(()=>service.addSample({voice_id:voice.block_id,language:'zh-CN',bytes:Buffer.from('fake'),media_type:'audio/wav'}),/不匹配/);
 const db=new DatabaseSync(path.join(target,'SayAgain1'));try{assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{db.close();}
});
